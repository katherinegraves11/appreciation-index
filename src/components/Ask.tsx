"use client";

import { useState } from "react";
import type { BriefResult } from "@/lib/schema";
import Cards from "./Cards";

const EXAMPLES = [
  "Is the Chanel Souplissimo worth buying?",
  "Will a Birkin 30 hold its value for ten years?",
  "Should my client get a Bottega Andiamo or a Loewe Puzzle?",
  "Is the Alaïa Le Teckel a good buy?",
];

type Done = { result: BriefResult; id: string; bagName: string };

export default function Ask() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true); setError(null); setDone(null); setStatus("Reading your question…");
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Request failed (${res.status}).`); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { value, done: end } = await reader.read(); if (end) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as { status?: string; error?: string; clarification?: string; done?: boolean; id?: string; result?: BriefResult; input?: { house: string; bag: string; spec: string } };
          if (evt.status) setStatus(evt.status);
          if (evt.clarification) { setError(evt.clarification); setBusy(false); setStatus(null); return; }
          if (evt.error) throw new Error(evt.error);
          if (evt.done && evt.result && evt.id && evt.input) {
            setDone({ result: evt.result, id: evt.id, bagName: `${evt.input.house} ${evt.input.bag}${evt.input.spec ? ` · ${evt.input.spec}` : ""}` });
            setStatus(null); setBusy(false); return;
          }
        }
      }
      throw new Error("The connection closed early. Ask again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong."); setBusy(false); setStatus(null);
    }
  }

  return (
    <div className="ask">
      <form className="askbox" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label htmlFor="q" className="ask-label">Ask about a bag</label>
        <div className="ask-row">
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Is the Chanel Souplissimo worth buying?" maxLength={600} autoComplete="off" disabled={busy} />
          <button className="primary" type="submit" disabled={busy || !q.trim()}>{busy ? "Thinking…" : "Appreciate"}</button>
        </div>
        {!done && !busy && (
          <div className="chips">{EXAMPLES.map((ex) => <button key={ex} type="button" className="chip" onClick={() => { setQ(ex); ask(ex); }}>{ex}</button>)}</div>
        )}
      </form>

      {busy && (
        <div className="thinking" aria-live="polite">
          <div className="dots"><span /><span /><span /></div>
          <p>{status}</p>
          <p className="k">Two to four minutes. It reads the resale market, the house, the designer and what people are saying, then answers.</p>
        </div>
      )}
      {error && <div className="status error" role="alert">{error}</div>}
      {done && <Cards result={done.result} bagName={done.bagName} briefId={done.id} />}
    </div>
  );
}
