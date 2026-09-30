import { structured } from "./llm";
import type { CampaignBrief, InboundJudgment, Intent, OutboundJudgment, Turn, VoiceProfile } from "./types";

// Used only when Jev is unavailable (no TYPESAFE_API_KEY, outage, or timeout).
// Same questions, same output shape, answered by the LLM instead. Less
// calibrated, so the agent runs in approval mode whenever this path is used.

const p = { type: "number", minimum: 0, maximum: 1 };

export async function inboundFallback(input: { message: string; thread: Turn[]; campaigns: CampaignBrief[] }): Promise<InboundJudgment> {
  const r = await structured<{
    campaign_related: number; campaign_id: string; campaign_confidence: number;
    intent: Intent; intent_confidence: number; needs_human: number; distress: number;
  }>({
    system: "You classify Instagram DMs sent to a creator. Give honest probabilities from 0 to 1.",
    user: `Active campaigns: ${JSON.stringify(input.campaigns.map((c) => ({ id: c.id, name: c.name, keyword: c.keyword, product: c.product })))}
Thread so far: ${JSON.stringify(input.thread)}
Latest follower message: ${input.message}

campaign_related: probability the message is about one of the campaigns (directly or as a reply in a campaign thread).
campaign_id: the campaign id it's about, or "none".
intent: what the follower wants.
needs_human: probability the creator should personally handle it (upset, hostile, personal, flirting, order/account problem, or a question a product brief can't answer).
distress: probability the message mentions self-harm, suicide, or being in crisis.`,
    toolName: "classify",
    toolDescription: "Record the classification.",
    schema: {
      properties: {
        campaign_related: p,
        campaign_id: { type: "string" },
        campaign_confidence: p,
        intent: { type: "string", enum: ["wants_link", "product_question", "price_question", "earnings_question", "sponsorship_question", "declined", "off_topic"] },
        intent_confidence: p,
        needs_human: p,
        distress: p,
      },
      required: ["campaign_related", "campaign_id", "campaign_confidence", "intent", "intent_confidence", "needs_human", "distress"],
    },
  });
  return {
    campaignRelated: r.campaign_related, campaignId: r.campaign_id, campaignConfidence: r.campaign_confidence,
    intent: r.intent, intentConfidence: r.intent_confidence, needsHuman: r.needs_human, distress: r.distress,
  };
}

export async function outboundFallback(input: { draft: string; followerMessage: string; brief: CampaignBrief; voice: VoiceProfile }): Promise<OutboundJudgment> {
  const r = await structured<{ money_claim: number; unsupported_claim: number; poses_as_brand: number; banned_phrase: number; voice_match: number }>({
    system: "You are a strict compliance reviewer for creator DMs. Give honest probabilities from 0 to 1.",
    user: `Draft reply: ${input.draft}
Follower message: ${input.followerMessage}
Approved facts: ${JSON.stringify(input.brief.facts)}
Banned phrases/claims: ${JSON.stringify(input.brief.banned)}
Brand: ${input.brief.brand}
Creator voice notes: ${input.voice.notes}
Creator examples: ${JSON.stringify(input.voice.samples.slice(0, 8))}

money_claim: promises/implies earnings, or stacks 2+ of big number / low effort / short timeframe.
unsupported_claim: states a product/price/offer fact not in the approved facts.
poses_as_brand: speaks as the brand company instead of an individual creator.
banned_phrase: uses a banned phrase or claim, or a close variant.
voice_match: 0 = brand bot, 1 = generic casual, 2 = mostly this creator, 3 = exactly this creator.`,
    toolName: "review",
    toolDescription: "Record the review.",
    schema: {
      properties: { money_claim: p, unsupported_claim: p, poses_as_brand: p, banned_phrase: p, voice_match: { type: "number", minimum: 0, maximum: 3 } },
      required: ["money_claim", "unsupported_claim", "poses_as_brand", "banned_phrase", "voice_match"],
    },
  });
  return {
    moneyClaim: r.money_claim, unsupportedClaim: r.unsupported_claim, posesAsBrand: r.poses_as_brand,
    bannedPhrase: r.banned_phrase, voiceMatch: r.voice_match,
  };
}
