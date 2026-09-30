import type { InboundJudgment, OutboundJudgment } from "./types";

// All risk tolerance lives here, in code, not in prompts. Starting values come
// from TypeSafe's guardrails cookbook (review 0.35 / act 0.70) and should be
// tuned on real pilot conversations.

export const T = {
  review: 0.35, // at or above: a person should look before it sends
  block: 0.7, // at or above: never send this
  silent: 0.35, // campaign_related below this: not our conversation, stay out
  confident: 0.5, // Choice confidence below this: don't act on it
  voiceFloor: 1.5, // voice_match below this (0..3): rewrite once
};

export type InboundDecision =
  | { kind: "crisis"; reason: string }
  | { kind: "silent"; reason: string }
  | { kind: "handoff"; reason: string }
  | { kind: "write"; campaignId: string; reason: string };

export function decideInbound(j: InboundJudgment, campaignIds: string[]): InboundDecision {
  if (j.distress >= T.review) return { kind: "crisis", reason: `distress ${j.distress.toFixed(2)}` };
  if (j.campaignRelated < T.silent) return { kind: "silent", reason: `campaign_related ${j.campaignRelated.toFixed(2)}` };
  if (j.needsHuman >= T.confident) return { kind: "handoff", reason: `needs_human ${j.needsHuman.toFixed(2)}` };

  // One active campaign: no need to trust the campaign choice.
  let campaignId = campaignIds.length === 1 ? campaignIds[0] : j.campaignId;
  if (campaignIds.length > 1 && (j.campaignId === "none" || j.campaignConfidence < T.confident)) {
    return { kind: "handoff", reason: `unsure which campaign (${j.campaignId}, conf ${j.campaignConfidence.toFixed(2)})` };
  }
  if (!campaignIds.includes(campaignId)) campaignId = campaignIds[0];

  if (j.intentConfidence < T.confident) {
    return { kind: "handoff", reason: `unsure what they want (${j.intent}, conf ${j.intentConfidence.toFixed(2)})` };
  }
  return { kind: "write", campaignId, reason: `intent ${j.intent}` };
}

export type OutboundDecision =
  | { kind: "send" }
  | { kind: "review"; reason: string }
  | { kind: "block"; reason: string };

export function decideOutbound(o: OutboundJudgment): OutboundDecision {
  const checks: [string, number][] = [
    ["money claim", o.moneyClaim],
    ["claim not in the brief", o.unsupportedClaim],
    ["speaks as the brand", o.posesAsBrand],
    ["banned phrase", o.bannedPhrase],
  ];
  const blocked = checks.filter(([, v]) => v >= T.block);
  if (blocked.length) return { kind: "block", reason: blocked.map(([n, v]) => `${n} (${v.toFixed(2)})`).join(", ") };
  if (o.voiceMatch < T.voiceFloor) return { kind: "block", reason: `doesn't sound like the creator (voice ${o.voiceMatch.toFixed(1)}/3)` };
  const review = checks.filter(([, v]) => v >= T.review);
  if (review.length) return { kind: "review", reason: review.map(([n, v]) => `${n} (${v.toFixed(2)})`).join(", ") };
  return { kind: "send" };
}
