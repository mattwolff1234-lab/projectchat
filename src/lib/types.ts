// Shared types for the DM agent. Everything the agent knows about a campaign
// or a creator arrives through these shapes, so the simulator and the live
// Instagram webhook run the exact same pipeline.

export interface CampaignBrief {
  id: string;
  name: string; // e.g. "Shopify: launch a store with Claude/ChatGPT"
  brand: string; // e.g. "Shopify"
  keyword: string; // comment trigger, e.g. "STORE"
  link: string; // destination URL (wrapped in a tracked redirect before sending)
  product: string; // one-paragraph plain description
  facts: string[]; // the ONLY product claims the agent may make
  talkingPoints: string[]; // angles to lean on, in priority order
  banned: string[]; // phrases/claims that must never appear
  disclosure: string; // how to answer "is this sponsored?"
}

export interface VoiceProfile {
  handle: string; // creator's IG handle
  notes: string; // casing, slang, emoji habits, message length
  samples: string[]; // real captions / comment replies from the creator
}

export interface Turn {
  from: "follower" | "creator" | "agent";
  text: string;
}

export type Intent =
  | "wants_link"
  | "product_question"
  | "price_question"
  | "earnings_question"
  | "sponsorship_question"
  | "declined"
  | "off_topic";

export interface InboundJudgment {
  campaignRelated: number; // Noul probability
  campaignId: string; // chosen campaign id or "none"
  campaignConfidence: number;
  intent: Intent;
  intentConfidence: number;
  needsHuman: number; // Noul
  distress: number; // Noul
}

export interface OutboundJudgment {
  moneyClaim: number;
  unsupportedClaim: number;
  posesAsBrand: number;
  bannedPhrase: number;
  voiceMatch: number; // 0..3 score
}

export type Action = "reply" | "silent" | "handoff" | "crisis" | "needs_approval";

export interface TraceStep {
  step: string;
  engine: "jev" | "llm-fallback" | "llm" | "code";
  detail: unknown;
}

export interface TurnResult {
  action: Action;
  reason: string;
  bubbles: string[]; // final messages (link tokens already resolved)
  campaignId?: string;
  trace: TraceStep[];
}
