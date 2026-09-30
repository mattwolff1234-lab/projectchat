// ManyChat bridge. ManyChat owns the Meta-approved Instagram connection; we are
// the brain. Two ways out:
//   1. Dynamic Block response (synchronous, must finish inside ManyChat's 10s limit)
//   2. sendContent API (async, for anything slower, and for approved drafts)
// Both use the same v2 JSON with content.type "instagram".

const API = "https://api.manychat.com";

export function dynamicBlock(bubbles: string[]) {
  return {
    version: "v2",
    content: { type: "instagram", messages: bubbles.map((text) => ({ type: "text", text })) },
  };
}

async function call(apiKey: string, path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
  if (!res.ok || json.status === "error") throw new Error(`ManyChat ${path} failed: ${res.status} ${json.message ?? ""}`);
  return json;
}

export function sendText(apiKey: string, subscriberId: string, bubbles: string[]) {
  return call(apiKey, "/fb/sending/sendContent", { subscriber_id: subscriberId, data: dynamicBlock(bubbles) });
}

// Tags make handoffs visible in the creator's ManyChat Live Chat. Create these
// tags once in each ManyChat account: dm-agent-handoff, dm-agent-crisis.
export function addTag(apiKey: string, subscriberId: string, tag: string) {
  return call(apiKey, "/fb/subscriber/addTagByName", { subscriber_id: subscriberId, tag_name: tag });
}
