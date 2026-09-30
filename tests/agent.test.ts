import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideInbound, decideOutbound } from "@/lib/policy";
import { SAMPLE_VOICE, SHOPIFY_BRIEF } from "@/lib/seed";
import type { InboundJudgment, OutboundJudgment } from "@/lib/types";

const jev = vi.hoisted(() => ({ available: true, inbound: vi.fn(), outbound: vi.fn() }));
const writer = vi.hoisted(() => ({ write: vi.fn() }));
const fallback = vi.hoisted(() => ({ inbound: vi.fn(), outbound: vi.fn() }));

vi.mock("@/lib/jev", () => ({
  jevAvailable: () => jev.available,
  inboundCheck: jev.inbound,
  outboundCheck: jev.outbound,
}));
vi.mock("@/lib/fallback", () => ({ inboundFallback: fallback.inbound, outboundFallback: fallback.outbound }));
vi.mock("@/lib/writer", async (orig) => ({ ...(await orig<typeof import("@/lib/writer")>()), writeReply: writer.write }));

const { runTurn } = await import("@/lib/agent");

const inbound = (o: Partial<InboundJudgment> = {}): InboundJudgment => ({
  campaignRelated: 0.95, campaignId: SHOPIFY_BRIEF.id, campaignConfidence: 0.9,
  intent: "product_question", intentConfidence: 0.9, needsHuman: 0.05, distress: 0.01, ...o,
});
const clean = (o: Partial<OutboundJudgment> = {}): OutboundJudgment => ({
  moneyClaim: 0.02, unsupportedClaim: 0.05, posesAsBrand: 0.01, bannedPhrase: 0.01, voiceMatch: 2.7, ...o,
});
const turn = (message = "what is this?") =>
  runTurn({
    message, thread: [], campaigns: [SHOPIFY_BRIEF], voice: SAMPLE_VOICE, approvalMode: false,
    makeLink: async () => "https://x.test/l/abc",
  });

beforeEach(() => {
  vi.clearAllMocks();
  jev.available = true;
});

describe("policy", () => {
  it("stays out of non-campaign DMs", () => {
    expect(decideInbound(inbound({ campaignRelated: 0.1 }), [SHOPIFY_BRIEF.id]).kind).toBe("silent");
  });
  it("crisis beats everything", () => {
    expect(decideInbound(inbound({ distress: 0.6, campaignRelated: 0.1 }), [SHOPIFY_BRIEF.id]).kind).toBe("crisis");
  });
  it("hands off when unsure which of several campaigns", () => {
    expect(decideInbound(inbound({ campaignConfidence: 0.3 }), ["a", "b"]).kind).toBe("handoff");
  });
  it("blocks money claims and holds borderline drafts", () => {
    expect(decideOutbound(clean({ moneyClaim: 0.8 })).kind).toBe("block");
    expect(decideOutbound(clean({ unsupportedClaim: 0.4 })).kind).toBe("review");
    expect(decideOutbound(clean({ voiceMatch: 0.8 })).kind).toBe("block");
    expect(decideOutbound(clean()).kind).toBe("send");
  });
});

describe("runTurn", () => {
  it("writes, checks, and swaps in the tracked link", async () => {
    jev.inbound.mockResolvedValue(inbound({ intent: "wants_link" }));
    writer.write.mockResolvedValue({ bubbles: ["here u go 🙏", "[[LINK]]"], end_conversation: false });
    jev.outbound.mockResolvedValue(clean());
    const r = await turn("STORE");
    expect(r.action).toBe("reply");
    expect(r.bubbles).toEqual(["here u go 🙏", "https://x.test/l/abc"]);
  });

  it("rewrites a blocked draft once, then sends the clean one", async () => {
    jev.inbound.mockResolvedValue(inbound({ intent: "earnings_question" }));
    writer.write
      .mockResolvedValueOnce({ bubbles: ["ppl make 10k a month easy"], end_conversation: false })
      .mockResolvedValueOnce({ bubbles: ["depends what u sell fr, the setup part is quick tho"], end_conversation: false });
    jev.outbound.mockResolvedValueOnce(clean({ moneyClaim: 0.92 })).mockResolvedValueOnce(clean());
    const r = await turn("how much can i make");
    expect(r.action).toBe("reply");
    expect(writer.write).toHaveBeenCalledTimes(2);
    expect(writer.write.mock.calls[1][0].revisionNote).toMatch(/money claim/);
  });

  it("hands off after two blocked drafts", async () => {
    jev.inbound.mockResolvedValue(inbound());
    writer.write.mockResolvedValue({ bubbles: ["we at shopify can help"], end_conversation: false });
    jev.outbound.mockResolvedValue(clean({ posesAsBrand: 0.9 }));
    const r = await turn();
    expect(r.action).toBe("handoff");
    expect(r.bubbles).toEqual([]);
  });

  it("sends exactly one bubble as a comment opener", async () => {
    jev.inbound.mockResolvedValue(inbound({ intent: "wants_link" }));
    writer.write.mockResolvedValue({ bubbles: ["saw ur comment!! want the walkthrough?", "[[LINK]]"], end_conversation: false });
    jev.outbound.mockResolvedValue(clean());
    const r = await runTurn({
      message: "STORE", thread: [], campaigns: [SHOPIFY_BRIEF], voice: SAMPLE_VOICE, approvalMode: false,
      source: "comment", makeLink: async () => "https://x.test/l/abc",
    });
    expect(r.bubbles).toEqual(["saw ur comment!! want the walkthrough?"]);
    expect(writer.write.mock.calls[0][0].commentOpener).toBe(true);
  });

  it("never writes when the inbound check says stay out", async () => {
    jev.inbound.mockResolvedValue(inbound({ campaignRelated: 0.05 }));
    const r = await turn("hey how was your weekend");
    expect(r.action).toBe("silent");
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("falls back to the LLM without Jev and holds for approval", async () => {
    jev.available = false;
    fallback.inbound.mockResolvedValue(inbound());
    fallback.outbound.mockResolvedValue(clean());
    writer.write.mockResolvedValue({ bubbles: ["it's shopify but u build it from claude"], end_conversation: false });
    const r = await turn();
    expect(r.action).toBe("needs_approval");
    expect(r.trace.some((t) => t.engine === "llm-fallback")).toBe(true);
  });
});
