"use client";

import { useState } from "react";

interface Pending {
  id: string;
  text: string;
  reason: string;
  created_at: string;
  conversation: { follower_username: string | null; follower_key: string; creator: { handle: string } };
}

// Approval queue for held drafts (approval mode, borderline checks, Jev fallback).
export default function Approvals() {
  const [password, setPassword] = useState("");
  const [items, setItems] = useState<Pending[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function load(pw = password) {
    setError("");
    const res = await fetch("/api/approvals", { headers: { "x-admin-password": pw } });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? res.statusText);
    setItems(data);
  }

  async function decide(id: string, decision: "approve" | "reject") {
    const res = await fetch(`/api/approvals/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ decision, text: edits[id] }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? res.statusText);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif", color: "var(--fg)" }}>
      <h1 style={{ fontSize: 20, margin: "8px 0 16px" }}>Held drafts</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input type="password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
        <button onClick={() => load()} style={btn}>Load</button>
      </div>
      {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
      {items.length === 0 && !error && <p style={{ color: "var(--muted)" }}>Nothing waiting.</p>}
      {items.map((m) => (
        <div key={m.id} style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
            @{m.conversation.creator.handle} → {m.conversation.follower_username ?? m.conversation.follower_key} · held because: {m.reason}
          </div>
          <textarea rows={3} defaultValue={m.text} onChange={(e) => setEdits({ ...edits, [m.id]: e.target.value })} style={{ ...input, width: "100%" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => decide(m.id, "approve")} style={{ ...btn, background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}>Send</button>
            <button onClick={() => decide(m.id, "reject")} style={btn}>Discard</button>
          </div>
        </div>
      ))}
    </main>
  );
}

const input: React.CSSProperties = { font: "inherit", color: "var(--fg)", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: 8 };
const btn: React.CSSProperties = { font: "inherit", color: "var(--fg)", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" };
