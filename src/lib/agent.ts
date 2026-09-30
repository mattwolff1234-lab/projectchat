import { inboundCheck, jevAvailable, outboundCheck } from "./jev";
import { inboundFallback, outboundFallback } from "./fallback";
import { decideInbound, decideOutbound } from "./policy";
import { LINK_TOKEN, writeReply } from "./writer";
import type { CampaignBrief, InboundJudgment, OutboundJudgment, TraceStep, Turn, TurnResult, VoiceProfile } from "./types";

// One follower message in, one decision out. Channel-agnostic: the simulator,
// the ManyChat bridge, and (later) a direct Meta app all call runTurn.
//
//   inbound check (Jev)  ->  policy  ->  agent writes (LLM)  ->  outbound check (Jev)  ->  policy
//                                              ^------ one rewrite if blocked -------|

export async function runTurn(input: {
  message: string;
  thread: Turn[];
  campaigns: CampaignBrief[];
  voice: VoiceProfile;
  approvalMode: boolean;
  makeLink: (campaign: CampaignBrief) => Promise<string>;
}): Promise<TurnResult> {
  const trace: TraceStep[] = [];
  let usedFallback = false;

  // 1. Inbound: should we engage, with which campaign, and what do they want?
  let inbound: InboundJudgment;
  try {
    if (!jevAvailable()) throw new Error("TYPESAFE_API_KEY not set");
    inbound = await inboundCheck(input);
    trace.push({ step: "inbound check", engine: "jev", detail: inbound });
  } catch (err) {
    usedFallback = true;
    inbound = await inboundFallback(input);
    trace.push({ step: "inbound check", engine: "llm-fallback", detail: { ...inbound, why: String(err) } });
  }

  const decision = decideInbound(inbound, input.campaigns.map((c) => c.id));
  trace.push({ step: "inbound policy", engine: "code", detail: decision });
  if (decision.kind !== "write") {
    return { action: decision.kind, reason: decision.reason, bubbles: [], trace };
  }
  const brief = input.campaigns.find((c) => c.id === decision.campaignId)!;
  const linksAlreadySent = input.thread.filter((t) => t.from !== "follower" && /https?:\/\//.test(t.text)).length;

  // 2. Write, check, and rewrite once if the check blocks the draft.
  let revisionNote: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const draft = await writeReply({ brief, voice: input.voice, thread: input.thread, message: input.message, judgment: inbound, linksAlreadySent, revisionNote });
    trace.push({ step: `draft ${attempt}`, engine: "llm", detail: draft });
    if (draft.bubbles.length === 0) {
      return { action: "silent", reason: "agent chose not to reply", bubbles: [], campaignId: brief.id, trace };
    }

    const text = draft.bubbles.join("\n");
    let outbound: OutboundJudgment;
    try {
      if (!jevAvailable()) throw new Error("TYPESAFE_API_KEY not set");
      outbound = await outboundCheck({ draft: text, followerMessage: input.message, brief, voice: input.voice });
      trace.push({ step: `outbound check ${attempt}`, engine: "jev", detail: outbound });
    } catch (err) {
      usedFallback = true;
      outbound = await outboundFallback({ draft: text, followerMessage: input.message, brief, voice: input.voice });
      trace.push({ step: `outbound check ${attempt}`, engine: "llm-fallback", detail: { ...outbound, why: String(err) } });
    }

    const verdict = decideOutbound(outbound);
    trace.push({ step: `outbound policy ${attempt}`, engine: "code", detail: verdict });

    if (verdict.kind === "block") {
      revisionNote = verdict.reason;
      continue;
    }

    const link = text.includes(LINK_TOKEN) ? await input.makeLink(brief) : "";
    const bubbles = draft.bubbles.map((b) => b.replaceAll(LINK_TOKEN, link).trim()).filter(Boolean);

    if (verdict.kind === "review" || input.approvalMode || usedFallback) {
      const reason = verdict.kind === "review" ? verdict.reason : input.approvalMode ? "approval mode is on" : "Jev unavailable, LLM fallback used";
      return { action: "needs_approval", reason, bubbles, campaignId: brief.id, trace };
    }
    return { action: "reply", reason: decision.reason, bubbles, campaignId: brief.id, trace };
  }

  return { action: "handoff", reason: `draft blocked twice: ${revisionNote}`, bubbles: [], campaignId: brief.id, trace };
}
