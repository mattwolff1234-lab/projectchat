import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";
import type {
  CampaignBrief,
  InboundJudgment,
  Intent,
  OutboundJudgment,
  Turn,
  VoiceProfile,
} from "./types";

// Jev (TypeSafe System One) makes every yes/no and pick-one judgment.
// It never writes text: the LLM writes every reply (see writer.ts).
// Each check is ONE request; all questions run in parallel over shared state.

let client: TypeSafeClient | null = null;
export function jevAvailable() {
  return Boolean(process.env.TYPESAFE_API_KEY);
}
function jev() {
  if (!client) client = new TypeSafeClient({ timeout: 4000, retry: { maxRetries: 1 } });
  return client;
}

const INTENTS = {
  wants_link: "Wants the link, says yes/send it/drop it, or replied to the comment keyword.",
  product_question: "Asks what the product is, how it works, or how to use it.",
  price_question: "Asks what it costs or whether it is free.",
  earnings_question: "Asks how much money they could make or whether it actually makes money.",
  sponsorship_question: "Asks whether this is an ad, sponsored, or whether the creator is paid.",
  declined: "Says no thanks, not interested, or otherwise turns it down.",
  off_topic: "Anything else: small talk, fan messages, unrelated questions.",
} satisfies Record<Intent, string>;

export async function inboundCheck(input: {
  message: string;
  thread: Turn[];
  campaigns: CampaignBrief[];
}): Promise<InboundJudgment> {
  const campaignOptions: Record<string, string> = { none: "The message is not about any of these campaigns." };
  for (const c of input.campaigns) campaignOptions[c.id] = `${c.name}: ${c.product}`;

  const res = await jev().systemOne({
    state: {
      latest_follower_message: input.message,
      thread_so_far: input.thread.map((t) => `${t.from}: ${t.text}`),
      creator_active_campaigns: input.campaigns.map((c) => ({ id: c.id, name: c.name, keyword: c.keyword, product: c.product })),
    },
    questions: {
      campaign_related: noul(
        "Is `latest_follower_message` about one of `creator_active_campaigns`, either directly or as a reply in a thread that is already about one?",
        { true: "It is about a campaign's product, link, keyword, or offer.", false: "It is a personal DM, fan message, or unrelated conversation." },
      ),
      campaign: choice("Which campaign is `latest_follower_message` about, using `thread_so_far` for context?", campaignOptions),
      intent: choice("What does the follower want in `latest_follower_message`?", INTENTS),
      needs_human: noul(
        "Should the creator personally handle this instead of an automated assistant?",
        {
          true: "The follower is upset, hostile, harassing, asking something personal about the creator, flirting, reporting a problem with an order or account, or asking something a product brief could not answer.",
          false: "An ordinary question or reaction about the product that a short friendly reply can handle.",
        },
      ),
      distress: noul("Does `latest_follower_message` mention self-harm, suicide, or being in a crisis or danger?"),
    },
  });

  const a = res.answers;
  return {
    campaignRelated: a.campaign_related.noul,
    campaignId: a.campaign.choice,
    campaignConfidence: a.campaign.confidence,
    intent: a.intent.choice as Intent,
    intentConfidence: a.intent.confidence,
    needsHuman: a.needs_human.noul,
    distress: a.distress.noul,
  };
}

export async function outboundCheck(input: {
  draft: string;
  followerMessage: string;
  brief: CampaignBrief;
  voice: VoiceProfile;
}): Promise<OutboundJudgment> {
  const res = await jev().systemOne({
    state: {
      draft_reply: input.draft,
      follower_message: input.followerMessage,
      approved_facts: input.brief.facts,
      banned_phrases_and_claims: input.brief.banned,
      brand: input.brief.brand,
      creator_voice: { notes: input.voice.notes, real_examples: input.voice.samples.slice(0, 8) },
    },
    questions: {
      money_claim: noul(
        "Does `draft_reply` promise, predict, or imply how much money the follower will make, or combine two or more of: a big number, low effort (easy, anyone, passive), a short timeframe (overnight, this week)?",
        { true: "It makes or implies an earnings promise.", false: "It talks about the product or the skill without promising income." },
      ),
      unsupported_claim: noul(
        "Does `draft_reply` state a fact about the product, price, or offer that is not supported by `approved_facts`?",
        { true: "At least one product claim goes beyond the approved facts.", false: "Every product claim is covered by the approved facts, or it makes none." },
      ),
      poses_as_brand: noul("Does `draft_reply` speak as the `brand` company itself (we, our team, official support) instead of as an individual creator?"),
      banned_phrase: noul("Does `draft_reply` use any phrase or make any claim listed in `banned_phrases_and_claims`, or a close variant of one?"),
      voice_match: score("How much does `draft_reply` sound like the creator in `creator_voice`?", [
        "Sounds like a brand bot or customer support script.",
        "Generic casual, but not like this creator.",
        "Mostly like this creator, with a phrase or two that feels off.",
        "Reads exactly like this creator texting a follower.",
      ]),
    },
  });

  const a = res.answers;
  return {
    moneyClaim: a.money_claim.noul,
    unsupportedClaim: a.unsupported_claim.noul,
    posesAsBrand: a.poses_as_brand.noul,
    bannedPhrase: a.banned_phrase.noul,
    voiceMatch: a.voice_match.score,
  };
}
