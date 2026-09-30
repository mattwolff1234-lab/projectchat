import { structured } from "./llm";
import type { CampaignBrief, InboundJudgment, Turn, VoiceProfile } from "./types";

// The agent. It writes every message from scratch; there are no canned replies.
// It sees the thread, the campaign brief, and the creator's voice, and decides
// what to say, whether to ask something back, and when to drop the link.

export const LINK_TOKEN = "[[LINK]]";

const INTENT_HINTS: Record<string, string> = {
  earnings_question:
    "They asked about earnings. Never give or imply a number or a promise. Be honest that results depend on what they sell and the work they put in, then steer to the skill (launching the store).",
  sponsorship_question: "They asked if this is sponsored. Say yes plainly, in your own words.",
  declined: "They declined. Reply once, warmly, with zero pressure, and do not resend the link.",
};

export async function writeReply(input: {
  brief: CampaignBrief;
  voice: VoiceProfile;
  thread: Turn[];
  message: string;
  judgment?: InboundJudgment;
  linksAlreadySent: number;
  revisionNote?: string; // set when the outbound check blocked the previous draft
  commentOpener?: boolean; // first DM, sent as a private reply to a comment
}) {
  const { brief, voice } = input;
  const hint = input.judgment ? INTENT_HINTS[input.judgment.intent] : undefined;
  const opener = input.commentOpener
    ? `\nThis is your FIRST DM to them, sent because they commented "${input.message}" on your post. Instagram lets you send exactly ONE message until they reply, so write exactly ONE bubble that makes them want to answer: a quick question or an offer ("want the walkthrough?"), not just a link. Reference their comment naturally.`
    : "";

  const system = `You are replying to Instagram DMs as the creator @${voice.handle}. You are a real person texting a follower, not a brand account or support bot.

VOICE
${voice.notes}
Real examples of how @${voice.handle} writes (match casing, slang, emoji, length):
${voice.samples.map((s) => `- ${s}`).join("\n")}

WHAT YOU'RE TALKING ABOUT
Campaign: ${brief.name} (partnership with ${brief.brand})
${brief.product}

Facts you may state (state NOTHING about the product, price, or offer beyond these):
${brief.facts.map((f) => `- ${f}`).join("\n")}

Angles you can lean on:
${brief.talkingPoints.map((t) => `- ${t}`).join("\n")}

Never say or imply:
${brief.banned.map((b) => `- ${b}`).join("\n")}
- how much money anyone will make, or any earnings promise
- anything as if you are ${brief.brand} itself ("we", "our team")

If asked whether it's sponsored: ${brief.disclosure}

HOW TO REPLY
- Texting style: 1 or 2 short bubbles, usually one line each. Never a paragraph.
- Answer what they actually asked. It's fine to ask a question back.
- To include the link, write ${LINK_TOKEN} on its own where it belongs. Code swaps in their tracked link.
- Links already sent in this chat: ${input.linksAlreadySent}. Don't send it more than twice total, and don't paste it into every reply.
- If there's nothing useful left to say (they said thanks/bye), set end_conversation and send at most one short bubble.`;

  const user = `Conversation so far:
${input.thread.map((t) => `${t.from === "follower" ? "them" : "you"}: ${t.text}`).join("\n") || "(this is the first message)"}

Their new message: ${input.message}${opener}
${hint ? `\nNote: ${hint}` : ""}${input.revisionNote ? `\nYour previous draft was blocked: ${input.revisionNote}. Write a new reply that fixes this.` : ""}`;

  return structured<{ bubbles: string[]; end_conversation: boolean }>({
    system,
    user,
    toolName: "send_reply",
    toolDescription: "Send your DM reply as one or two chat bubbles.",
    schema: {
      properties: {
        bubbles: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 3 },
        end_conversation: { type: "boolean" },
      },
      required: ["bubbles", "end_conversation"],
    },
  });
}
