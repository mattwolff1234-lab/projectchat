import { isAdmin } from "@/lib/auth";
import { getCreator, getPendingMessage, setMessageStatus } from "@/lib/db";
import { sendText } from "@/lib/manychat";

// Approve (optionally edited) or reject a held draft. Approved drafts go out
// through ManyChat's API, so they must be sent inside Instagram's 24h window.
export async function POST(req: Request, ctx: RouteContext<"/api/approvals/[id]">) {
  if (!isAdmin(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const { decision, text } = (await req.json()) as { decision: "approve" | "reject"; text?: string };

  const msg = await getPendingMessage(id);
  if (msg.status !== "pending_approval") return Response.json({ error: "already handled" }, { status: 409 });

  if (decision === "reject") {
    await setMessageStatus(id, "rejected");
    return Response.json({ ok: true });
  }

  const creator = await getCreator(msg.conversation.creator_id);
  if (!creator.manychat_api_key) return Response.json({ error: "creator has no ManyChat API key" }, { status: 400 });
  const bubbles = (text ?? msg.text).split("\n").map((b) => b.trim()).filter(Boolean);
  try {
    await sendText(creator.manychat_api_key, msg.conversation.follower_key, bubbles);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
  await setMessageStatus(id, "sent");
  return Response.json({ ok: true });
}
