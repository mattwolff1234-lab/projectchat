import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Action, CampaignBrief, TraceStep, Turn, VoiceProfile } from "./types";

// Server-only data access. Uses the Supabase service role key, never exposed
// to the browser. Schema: supabase/schema.sql.

let sb: SupabaseClient | null = null;
function db() {
  if (!sb) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    sb = createClient(url, key, { auth: { persistSession: false } });
  }
  return sb;
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export interface Creator {
  id: string;
  handle: string;
  manychat_api_key: string | null;
  voice: VoiceProfile;
  campaign_ids: string[];
  bot_enabled: boolean;
  approval_mode: boolean;
}

export interface Conversation {
  id: string;
  creator_id: string;
  follower_key: string;
  campaign_id: string | null;
  status: "active" | "paused" | "handed_off" | "closed";
}

export async function getCreatorBySecret(secret: string): Promise<Creator | null> {
  const { data } = await db().from("creators").select("*").eq("inbound_secret", secret).maybeSingle();
  return data as Creator | null;
}

export async function getCreator(id: string): Promise<Creator> {
  return must(await db().from("creators").select("*").eq("id", id).single()) as Creator;
}

export async function getCampaigns(ids: string[]): Promise<CampaignBrief[]> {
  if (!ids.length) return [];
  const rows = must(await db().from("campaigns").select("brief").in("id", ids).eq("active", true)) as { brief: CampaignBrief }[];
  return rows.map((r) => r.brief);
}

export async function getOrCreateConversation(creatorId: string, followerKey: string, username?: string): Promise<Conversation> {
  const row = must(
    await db()
      .from("conversations")
      .upsert(
        { creator_id: creatorId, follower_key: followerKey, follower_username: username ?? null, last_inbound_at: new Date().toISOString() },
        { onConflict: "creator_id,follower_key" },
      )
      .select("*")
      .single(),
  );
  return row as unknown as Conversation;
}

export async function updateConversation(id: string, patch: Partial<Pick<Conversation, "status" | "campaign_id">>) {
  must(await db().from("conversations").update(patch).eq("id", id).select("id"));
}

export async function getThread(conversationId: string, limit = 30): Promise<Turn[]> {
  const rows = must(
    await db()
      .from("messages")
      .select("sender,text,status")
      .eq("conversation_id", conversationId)
      .eq("status", "sent")
      .order("created_at", { ascending: true })
      .limit(limit),
  ) as { sender: Turn["from"]; text: string }[];
  return rows.map((r) => ({ from: r.sender, text: r.text }));
}

export async function addMessage(m: {
  conversation_id: string;
  sender: Turn["from"];
  text: string;
  action?: Action;
  reason?: string;
  trace?: TraceStep[];
  status?: "sent" | "pending_approval" | "rejected";
}) {
  return must(await db().from("messages").insert(m).select("id").single()) as { id: string };
}

export async function listPendingApprovals() {
  return must(
    await db()
      .from("messages")
      .select("id,text,reason,created_at,conversation:conversations(id,follower_username,follower_key,creator:creators(handle))")
      .eq("status", "pending_approval")
      .order("created_at", { ascending: true }),
  );
}

export async function getPendingMessage(id: string) {
  return must(
    await db()
      .from("messages")
      .select("id,text,status,conversation_id,conversation:conversations(follower_key,creator_id)")
      .eq("id", id)
      .single(),
  ) as unknown as { id: string; text: string; status: string; conversation_id: string; conversation: { follower_key: string; creator_id: string } };
}

export async function setMessageStatus(id: string, status: "sent" | "rejected") {
  must(await db().from("messages").update({ status }).eq("id", id).select("id"));
}

export async function createLink(l: { creator_id: string; campaign_id: string; conversation_id: string; destination: string }) {
  const slug = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  must(await db().from("links").insert({ slug, ...l }).select("slug"));
  return slug;
}

export async function resolveLink(slug: string, meta: { user_agent?: string; referrer?: string }): Promise<string | null> {
  const { data } = await db().from("links").select("destination").eq("slug", slug).maybeSingle();
  if (!data) return null;
  await db().from("clicks").insert({ slug, user_agent: meta.user_agent ?? null, referrer: meta.referrer ?? null });
  return (data as { destination: string }).destination;
}
