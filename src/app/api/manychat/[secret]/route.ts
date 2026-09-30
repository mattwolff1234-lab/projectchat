import { after } from "next/server";
import { runTurn } from "@/lib/agent";
import {
  addMessage, createLink, getCampaigns, getCreatorBySecret, getOrCreateConversation, getThread, updateConversation,
  type Conversation, type Creator,
} from "@/lib/db";
import { addTag, dynamicBlock, sendText } from "@/lib/manychat";
import type { TurnResult } from "@/lib/types";

// ManyChat calls this from a Dynamic Block in the creator's flow, once per
// follower message (keyword comment or DM). URL: /api/manychat/<creator inbound_secret>
// Body (set in the ManyChat request): { "subscriber_id": "{{contact id}}",
//   "username": "{{ig username}}", "message": "{{last text input}}", "source": "dm" | "comment" }

export const maxDuration = 60;
const SYNC_BUDGET_MS = 8000; // ManyChat hard-times-out at 10s

const EMPTY = dynamicBlock([]);

export async function POST(req: Request, ctx: RouteContext<"/api/manychat/[secret]">) {
  const { secret } = await ctx.params;
  const creator = await getCreatorBySecret(secret);
  if (!creator) return Response.json({ error: "unknown creator" }, { status: 404 });

  const body = (await req.json()) as { subscriber_id?: string | number; username?: string; message?: string; source?: string };
  const subscriberId = String(body.subscriber_id ?? "");
  const message = (body.message ?? "").trim();
  if (!subscriberId || !message) return Response.json(EMPTY);

  const convo = await getOrCreateConversation(creator.id, subscriberId, body.username);
  const thread = await getThread(convo.id);
  await addMessage({ conversation_id: convo.id, sender: "follower", text: message });

  // Bot off, or a person has taken this thread: log it and stay out.
  if (!creator.bot_enabled || convo.status === "handed_off" || convo.status === "paused") return Response.json(EMPTY);

  const campaigns = await getCampaigns(creator.campaign_ids);
  if (!campaigns.length) return Response.json(EMPTY);

  const work = runTurn({
    message,
    thread,
    campaigns,
    voice: creator.voice,
    approvalMode: creator.approval_mode,
    makeLink: async (c) => {
      const slug = await createLink({ creator_id: creator.id, campaign_id: c.id, conversation_id: convo.id, destination: c.link });
      return `${process.env.APP_URL}/l/${slug}`;
    },
  });

  const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), SYNC_BUDGET_MS));
  const first = await Promise.race([work, timeout]);

  if (first === "timeout") {
    // Too slow for ManyChat's window: answer empty now, deliver via the API after.
    after(async () => {
      const result = await work;
      const bubbles = await finalize(result, creator, convo);
      if (bubbles.length && creator.manychat_api_key) await sendText(creator.manychat_api_key, subscriberId, bubbles);
    });
    return Response.json(EMPTY);
  }

  const bubbles = await finalize(first, creator, convo);
  return Response.json(dynamicBlock(bubbles));
}

// Persists the turn and applies side effects. Returns bubbles to send now (empty if none).
async function finalize(result: TurnResult, creator: Creator, convo: Conversation): Promise<string[]> {
  const base = { conversation_id: convo.id, sender: "agent" as const, action: result.action, reason: result.reason, trace: result.trace };
  if (result.campaignId && result.campaignId !== convo.campaign_id) await updateConversation(convo.id, { campaign_id: result.campaignId });

  switch (result.action) {
    case "reply":
      await addMessage({ ...base, text: result.bubbles.join("\n"), status: "sent" });
      return result.bubbles;
    case "needs_approval":
      await addMessage({ ...base, text: result.bubbles.join("\n"), status: "pending_approval" });
      return [];
    case "handoff":
    case "crisis":
      await addMessage({ ...base, text: "", status: "rejected" });
      await updateConversation(convo.id, { status: "handed_off" });
      if (creator.manychat_api_key) {
        await addTag(creator.manychat_api_key, convo.follower_key, result.action === "crisis" ? "dm-agent-crisis" : "dm-agent-handoff").catch(() => {});
      }
      // TODO(pilot): notify the campaign manager (Slack) on crisis.
      return [];
    case "silent":
      return [];
  }
}
