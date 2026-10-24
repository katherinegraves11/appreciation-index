"use client";

import { useEffect, useRef, useState } from "react";
import type { BriefResult } from "@/lib/schema";
import type { QuickNumbers } from "@/lib/tracker";
import Answer from "./Answer";
import { Dial, useHorizon } from "./Horizon";
import PhotoDrop from "./PhotoDrop";
import { COVERED_HOUSES } from "@/lib/houses";

const EXAMPLES = [
  "My sourcer quoted me $48,000 for a Hermès Kelly Cut in suede. Is that worth it?",
  "Will a Birkin 30 be worth more in ten years?",
  "Is the Alaïa Le Teckel still worth it now the designer is leaving?",
  "Is the Chanel pony hair bag worth buying right now?",
];

export type Done = { result: BriefResult; id: string; bagName: string; numbers: QuickNumbers | null; cached?: boolean; answeredAt?: string };

export default function Ask({ initial = null }: { initial?: Done | null }) {
  const { h } = useHorizon();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(initial);
  const [photo, setPhoto] = useState<string | null>(null);
  const started = useRef(false);
  const retried = useRef(false);

  // ?q=… lets another page (or the design preview) hand a question straight to the tool.
  useEffect(() => {
    if (started.current) return;
    const pre = new URLSearchParams(window.location.search).get("q");
    if (pre && pre.trim()) { started.current = true; setQ(pre); void ask(pre); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Apply one event from the job to the screen. Returns true when the job is finished. */
  function apply(evt: { status?: string; error?: string; clarification?: string; done?: boolean; id?: string; result?: BriefResult; input?: { house: string; bag: string; spec: string }; numbers?: QuickNumbers | null; cached?: boolean; answered_at?: string }): boolean {
    if (evt.status) setStatus(evt.status);
    if (evt.error) { setError(evt.error); return true; }
    if (evt.clarification) { setError(evt.clarification); return true; }
    if (evt.done && evt.result && evt.input && evt.id) {
      try { localStorage.setItem("ai-last", evt.id); window.history.replaceState(null, "", `/?brief=${evt.id}`); } catch { /* the address is cosmetic */ }
      setDone({ result: evt.result, id: evt.id, bagName: `${evt.input.house} · ${evt.input.bag}${evt.input.spec ? ` · ${evt.input.spec}` : ""}`, numbers: evt.numbers ?? null, cached: !!evt.cached, answeredAt: evt.answered_at });
      return true;
    }
    return false;
  }

  /** Poll a server-side job until it finishes; the job keeps running if this page is left. */
  async function follow(jobId: string) {
    let since = 0;
    for (;;) {
      let res: Response;
      try { res = await fetch(`/api/ask?job=${encodeURIComponent(jobId)}&since=${since}`, { cache: "no-store" }); }
      catch { await new Promise((r) => setTimeout(r, 3000)); continue; }
      if (res.status === 404) { // the server lost it (restarted): ask it again once, quietly
        const again = (() => { try { return (JSON.parse(localStorage.getItem("ai-job") || "null") as { q?: string } | null)?.q ?? ""; } catch { return ""; } })();
        try { localStorage.removeItem("ai-job"); } catch {}
        if (again && !retried.current) { retried.current = true; setBusy(false); setTimeout(() => { void ask(again, false, true); }, 0); return; }
        break;
      }
      const j = (await res.json()) as { done: boolean; events: Parameters<typeof apply>[0][]; total: number };
      let finished = false;
      for (const e of j.events) { if (apply(e)) finished = true; }
      since = j.total;
      if (finished || j.done) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    try { localStorage.removeItem("ai-job"); } catch {}
    setBusy(false); setStatus(null);
  }

  async function ask(question: string, fresh = false, force = false) {
    if (!question.trim() || (busy && !force)) return;
    setBusy(true); setError(null); setDone(null); setStatus("Reading your question…");
    try { window.history.replaceState(null, "", "/"); } catch { /* the address is cosmetic */ }
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, horizon: h, fresh }) });
      const j = (await res.json().catch(() => ({}))) as { job?: string; error?: string };
      if (!res.ok || !j.job) throw new Error(j.error || `Request failed (${res.status}).`);
      try { localStorage.setItem("ai-job", JSON.stringify({ id: j.job, q: question, at: Date.now() })); } catch {}
      await follow(j.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong."); setBusy(false); setStatus(null);
    }
  }

  // Coming back to Ask while a question is still running: pick it up where it is.
  useEffect(() => {
    if (initial) { try { localStorage.setItem("ai-last", initial.id); } catch {} return; }
    try {
      const raw = localStorage.getItem("ai-job");
      if (!raw) {
        const last = localStorage.getItem("ai-last");
        const params = new URLSearchParams(window.location.search);
        if (last && !params.get("q") && !params.get("brief")) window.location.replace(`/?brief=${encodeURIComponent(last)}`);
        return;
      }
      const saved = JSON.parse(raw) as { id: string; q: string; at: number };
      if (Date.now() - saved.at > 20 * 60 * 1000) { localStorage.removeItem("ai-job"); return; }
      setQ(saved.q); setBusy(true); setStatus("Still working on it…"); void follow(saved.id);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <form className="ask" onSubmit={(e) => { e.preventDefault(); setPhoto(null); ask(q); }}>
          <input id="q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Describe the bag in your own words" autoComplete="off" aria-label="Your question" disabled={busy} />
          <button type="submit" disabled={busy || !q.trim()}>{busy ? "thinking" : "appreciate"}</button>
        </form>
        {done && !busy && <p className="clearask"><button type="button" onClick={() => { try { localStorage.removeItem("ai-last"); window.history.replaceState(null, "", "/"); } catch {} setDone(null); setQ(""); setPhoto(null); }}>clear this search</button></p>}
        {!busy && <PhotoDrop horizon={h} disabled={busy} onAsk={(question, preview) => { setPhoto(preview ?? null); setQ(question); ask(question); }} />}
        {!done && !busy && (
          <>
            <p className="hint"><span className="h1txt">Ask about any bag. We say whether to buy it now, and why.</span><span className="h5h10txt">Ask about any bag. We say whether it will be worth more, and why.</span> <a href="/about">How we decide</a></p>
            <p className="houses">We cover 16 houses for now: {COVERED_HOUSES.join(" · ")}.</p>
            <div className="chips">{EXAMPLES.map((ex) => <button key={ex} type="button" className="chip" onClick={() => { setPhoto(null); setQ(ex); ask(ex); }}>{ex}</button>)}</div>
          </>
        )}
      </section>

      {busy && (
        <div className="thinking" aria-live="polite">
          <div className="dots"><span /><span /><span /></div>
          <p>{status}</p>
          <p className="k">about three minutes · checking what this bag sells for, what sellers are asking, and where it is heading</p>
        </div>
      )}
      {error && <div className="status error" role="alert">{error}</div>}
      {done?.cached && (
        <p className="cachedline">Answered {done.answeredAt ? new Date(done.answeredAt).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "recently"}. <button type="button" className="linkbtn" onClick={() => ask(q || done.bagName, true)}>Run a fresh read</button> (about three minutes).</p>
      )}
      {done && <Answer result={done.result} bagName={done.bagName} briefId={done.id} numbers={done.numbers} photo={photo} />}
    </>
  );
}
