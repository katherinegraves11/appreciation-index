"use client";

import { useState } from "react";
import type { BriefResult } from "@/lib/schema";
import type { QuickNumbers } from "@/lib/tracker";
import Answer from "./Answer";
import { Dial, useHorizon } from "./Horizon";

const EXAMPLES = [
  "Is the pony hair Chanel bag everyone's talking about worth buying right now?",
  "Will a Birkin 30 be worth more in ten years?",
  "Is the Alaïa Le Teckel still worth it now the designer is leaving?",
  "Should I buy the new Chanel everyone has, the big soft flap?",
];

export type Done = { result: BriefResult; id: string; bagName: string; numbers: QuickNumbers | null };

export default function Ask() {
  const { h } = useHorizon();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true); setError(null); setDone(null); setStatus("Reading your question…");
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, horizon: h }) });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Request failed (${res.status}).`); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { value, done: end } = await reader.read(); if (end) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as { status?: string; error?: string; clarification?: string; done?: boolean; id?: string; result?: BriefResult; input?: { house: string; bag: string; spec: string }; numbers?: QuickNumbers | null };
          if (evt.status) setStatus(evt.status);
          if (evt.clarification) { setError(evt.clarification); setBusy(false); setStatus(null); return; }
          if (evt.error) throw new Error(evt.error);
          if (evt.done && evt.result && evt.id && evt.input) {
            setDone({ result: evt.result, id: evt.id, bagName: `${evt.input.house} · ${evt.input.bag}${evt.input.spec ? ` · ${evt.input.spec}` : ""}`, numbers: evt.numbers ?? null });
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
    <>
      <section className={`askpanel ${done || busy ? "asked" : ""}`}>
        <p className="lab">ask about a bag</p>
        <h1 className="ask-h">
          <span className="h1txt">Is it worth buying <i>right now?</i></span>
          <span className="h5txt">Will it be worth more <i>in five years?</i></span>
          <span className="h10txt">Will it be worth more <i>in ten years?</i></span>
        </h1>
        <Dial />
        <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input id="q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Describe the bag in your own words" autoComplete="off" aria-label="Your question" disabled={busy} />
          <button type="submit" disabled={busy || !q.trim()}>{busy ? "thinking" : "appreciate"}</button>
        </form>
        {!done && !busy && (
          <>
            <p className="hint"><span className="h1txt">Ask about any bag. We say whether to buy it now, and why.</span><span className="h5h10txt">Ask about any bag. We say whether it will be worth more, and why.</span> <a href="/about">How we decide</a></p>
            <div className="chips">{EXAMPLES.map((ex) => <button key={ex} type="button" className="chip" onClick={() => { setQ(ex); ask(ex); }}>{ex}</button>)}</div>
          </>
        )}
      </section>

      {busy && (
        <div className="thinking" aria-live="polite">
          <div className="dots"><span /><span /><span /></div>
          <p>{status}</p>
          <p className="k">two to four minutes · it reads the resale market, the house, the designer and what people are saying</p>
        </div>
      )}
      {error && <div className="status error" role="alert">{error}</div>}
      {done && <Answer result={done.result} bagName={done.bagName} briefId={done.id} numbers={done.numbers} />}
    </>
  );
}
