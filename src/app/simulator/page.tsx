"use client";

import { useState } from "react";
import { SAMPLE_VOICE, SHOPIFY_BRIEF } from "@/lib/seed";
import type { TurnResult, Turn } from "@/lib/types";
import s from "./simulator.module.css";

type Msg = Turn & { status?: string; result?: TurnResult };

const ACTION_LABEL: Record<string, string> = {
  reply: "Sent",
  needs_approval: "Held for approval",
  handoff: "Handed to creator",
  silent: "Bot stayed out",
  crisis: "Crisis: creator + manager alerted",
};

export default function Simulator() {
  const [briefText, setBriefText] = useState(JSON.stringify(SHOPIFY_BRIEF, null, 2));
  const [handle, setHandle] = useState(SAMPLE_VOICE.handle);
  const [notes, setNotes] = useState(SAMPLE_VOICE.notes);
  const [samples, setSamples] = useState(SAMPLE_VOICE.samples.join("\n"));
  const [approvalMode, setApprovalMode] = useState(false);
  const [password, setPassword] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<TurnResult | null>(null);
  const [error, setError] = useState("");

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    let brief;
    try {
      brief = JSON.parse(briefText);
    } catch {
      setError("Brief isn't valid JSON.");
      return;
    }
    setError("");
    setInput("");
    const thread: Turn[] = msgs
      .filter((m) => m.from === "follower" || m.status === "reply" || m.status === "needs_approval")
      .map(({ from, text }) => ({ from, text }));
    const next: Msg[] = [...msgs, { from: "follower", text }];
    setMsgs(next);
    setBusy(true);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-password": password },
        body: JSON.stringify({
          message: text,
          thread,
          brief,
          voice: { handle, notes, samples: samples.split("\n").map((l) => l.trim()).filter(Boolean) },
          approvalMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      const result = data as TurnResult;
      setSelected(result);
      const replies: Msg[] = result.bubbles.length
        ? result.bubbles.map((b) => ({ from: "agent", text: b, status: result.action, result }))
        : [{ from: "agent", text: "", status: result.action, result }];
      setMsgs([...next, ...replies]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={s.shell}>
      <section className={s.panel}>
        <h2>Setup</h2>
        <label>Creator handle<input value={handle} onChange={(e) => setHandle(e.target.value)} /></label>
        <label>Voice notes<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <label>Real captions / replies (one per line)<textarea rows={6} value={samples} onChange={(e) => setSamples(e.target.value)} /></label>
        <label>Campaign brief (JSON)<textarea rows={14} className={s.mono} value={briefText} onChange={(e) => setBriefText(e.target.value)} /></label>
        <label className={s.check}><input type="checkbox" checked={approvalMode} onChange={(e) => setApprovalMode(e.target.checked)} /> Approval mode</label>
        <label>Admin password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="only needed when deployed" /></label>
      </section>

      <section className={s.chat}>
        <header className={s.chatHead}>
          <span>@{handle || "creator"}</span>
          <button onClick={() => { setMsgs([]); setSelected(null); }}>Reset chat</button>
        </header>
        <div className={s.messages}>
          {msgs.length === 0 && <p className={s.empty}>Message the creator as a follower. Try the keyword, a product question, &ldquo;how much can i make&rdquo;, or something off-topic.</p>}
          {msgs.map((m, i) =>
            m.from === "follower" ? (
              <div key={i} className={`${s.bubble} ${s.follower}`}>{m.text}</div>
            ) : (
              <div key={i} className={s.agentRow} onClick={() => m.result && setSelected(m.result)}>
                {m.text && <div className={`${s.bubble} ${s.agent} ${m.status === "needs_approval" ? s.held : ""}`}>{linkify(m.text)}</div>}
                {(i === msgs.length - 1 || msgs[i + 1]?.from === "follower") && m.status && (
                  <span className={`${s.tag} ${s[m.status] ?? ""}`}>{ACTION_LABEL[m.status] ?? m.status}{m.result && m.status !== "reply" ? `: ${m.result.reason}` : ""}</span>
                )}
              </div>
            ),
          )}
          {busy && <div className={s.typing}>typing…</div>}
        </div>
        {error && <p className={s.error}>{error}</p>}
        <form className={s.composer} onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message as a follower…" disabled={busy} />
          <button disabled={busy || !input.trim()}>Send</button>
        </form>
      </section>

      <section className={s.panel}>
        <h2>What happened</h2>
        {!selected && <p className={s.muted}>Each step of the last turn shows here: Jev&rsquo;s judgments, the policy call, every draft, and why anything was blocked.</p>}
        {selected?.trace.map((t, i) => (
          <details key={i} open={t.engine !== "llm"} className={s.step}>
            <summary><b>{t.step}</b> <span className={`${s.engine} ${s[t.engine.replace("-", "_")] ?? ""}`}>{t.engine}</span></summary>
            <pre>{JSON.stringify(t.detail, null, 2)}</pre>
          </details>
        ))}
      </section>
    </main>
  );
}

function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a> : part,
  );
}
