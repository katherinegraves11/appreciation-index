"use client";

import { useState } from "react";
import type { BriefResult } from "@/lib/schema";
import type { QuickNumbers } from "@/lib/tracker";
import { toCards, toSignals, INTENT_LABEL } from "@/lib/cards";

const WORD: Record<string, string> = { yes: "Buy", no: "Don't", wait: "Wait" };
const CLS: Record<string, string> = { yes: "buy", no: "dont", wait: "wait" };
const DEF: Record<string, string> = {
  flip_1y: "Buy now, sell by this time next year.",
  hold_5y: "Buy now, sell around 2031.",
  hold_10y: "Buy now and keep. Only true icons earn this.",
  wear: "Buy to use. Value comes second.",
};
const GLYPH: Record<string, React.ReactNode> = {
  flip_1y: <><path d="M8 20h32l-3 20H11z" /><path d="M16 20c0-8 16-8 16 0" /><path d="M36 10l4 4-4 4" /><path d="M8 14h32" /></>,
  hold_5y: <><circle cx="24" cy="24" r="16" /><path d="M24 12v12l8 5" /></>,
  hold_10y: <><path d="M10 40V18l14-10 14 10v22z" /><path d="M20 40V28h8v12" /></>,
  wear: <><path d="M14 44V22l-6 2 4-10 12-4 12 4 4 10-6-2v22z" /><path d="M18 10c0 6 12 6 12 0" /></>,
};
const money = (v: number | null | undefined) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`);

export default function Answer({ result, bagName, briefId, numbers }: { result: BriefResult; bagName: string; briefId?: string; numbers: QuickNumbers | null }) {
  const [open, setOpen] = useState(false);
  const signals = toSignals(result);
  const cards = toCards(result);
  const n = numbers;
  const plain = result.plain_answer || result.one_line;
  const [first, ...rest] = plain.split(/(?<=\.)\s+/);
  return (
    <div className="answer">
      <section className="verdict">
        <p className="lab who">{bagName.toLowerCase()}</p>
        <h2>{first} {rest.length > 0 && <i>{rest.join(" ")}</i>}</h2>
        {result.timing && <p className="timing">{result.timing}</p>}
        <div className="stamps"><span className="stamp">{result.call}</span><span className="stamp">confidence {result.confidence.toLowerCase()}</span></div>
      </section>

      <div className="tiles" aria-label="What to do">
        {signals.map((s) => (
          <section key={s.intent} className={`tile ${CLS[s.verdict]}`} data-intent={s.intent}>
            <svg className="frame" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" stroke="currentColor"><rect x="1.5" y="1.5" width="97" height="97" rx="3" strokeWidth=".6" /><rect x="4" y="4" width="92" height="92" rx="2" strokeWidth=".3" /></svg>
            <svg className="glyph" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">{GLYPH[s.intent]}</svg>
            <p className="lab intent">{(INTENT_LABEL[s.intent]?.title ?? s.intent).toLowerCase()}</p>
            <p className="def">{DEF[s.intent]}</p>
            <p className="word">{WORD[s.verdict]}</p>
            <p className="why">{s.why}</p>
          </section>
        ))}
      </div>

      {n && (n.retail_now || n.sold_median || n.ask_median) && (
        <>
          <p className="lab stripcap"><span className="h1txt">right now · from the tracker</span><span className="h5h10txt">the long view · from the tracker</span></p>
          <div className="strip">
            <span className="h1txt" style={{ display: "contents" }}>
              <div><div className="lab">asking vs new</div><div className="v">{n.ask_median && n.retail_now ? `${Math.round((100 * n.ask_median) / n.retail_now)}%` : "—"}</div><div className="l">Sellers ask {money(n.ask_median)}. New is {money(n.retail_now)}.</div></div>
              <div><div className="lab">heat</div><div className="v">{n.saves_avg ?? "—"}</div><div className="l">Saves per listing on The RealReal. More saves, more buyers watching.</div></div>
              <div><div className="lab">trend</div><div className="v">{n.trend_pct == null ? "—" : `${n.trend_pct > 0 ? "+" : ""}${n.trend_pct}%`}</div><div className="l">Where asking prices moved since the last snapshot.</div></div>
              <div><div className="lab">proven sales</div><div className="v">{n.sold_n || n.trr_sold_90d || 0}</div><div className="l">{n.sold_median ? `Median sold ${money(n.sold_median)}, ${n.sold_pct_of_retail}% of new.` : "Sales we can actually see. None yet."}</div></div>
            </span>
            <span className="h5h10txt" style={{ display: "contents" }}>
              <div><div className="lab">price when new</div><div className="v">{n.retail_launch && n.retail_now ? `${money(n.retail_launch)} → ${money(n.retail_now)}` : money(n.retail_now)}</div><div className="l">What the house charged at launch and today{n.retail_size ? ` (${n.retail_size})` : ""}.</div></div>
              <div><div className="lab">sold vs new</div><div className="v">{n.sold_pct_of_retail ? `${Math.round(n.sold_pct_of_retail)}%` : "—"}</div><div className="l">{n.sold_n ? `${n.sold_n} confirmed sales, median ${money(n.sold_median)}.` : "No confirmed sales in the tracker yet."}</div></div>
              <div><div className="lab">icon status</div><div className="v">{n.icon ? "Yes" : "Not yet"}</div><div className="l">A shape the house keeps making for decades. Icons hold; novelties fade.</div></div>
              <div><div className="lab">asking vs new</div><div className="v">{n.ask_median && n.retail_now ? `${Math.round((100 * n.ask_median) / n.retail_now)}%` : "—"}</div><div className="l">{n.ask_n} listings, median ask {money(n.ask_median)}.</div></div>
            </span>
          </div>
        </>
      )}

      <button type="button" className="why-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "hide the why" : "show me why"}</button>
      {open && (
        <div className="detail">
          {cards.map((c) => (
            <section key={c.key}>
              <h4>{c.title}</h4>
              <p className="mood">{c.mood === "strong" ? "good sign" : c.mood === "weak" ? "weak spot" : "mixed"}</p>
              <p>{c.headline}</p>
              {c.more && <p>{c.more}</p>}
              {c.bullets && c.bullets.length > 0 && <ul>{c.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
              {c.evidence.length > 0 && <ul>{c.evidence.slice(0, 4).map((e, i) => <li key={i}>{e.text} <span className="src">{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.source}</a> : e.source}</span></li>)}</ul>}
            </section>
          ))}
          <section>
            <h4>The two sides</h4>
            <p className="mood">why yes</p><ul>{result.bull_case.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}</ul>
            <p className="mood">why not</p><ul>{result.bear_case.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}</ul>
            <p className="mood">what would change this</p><ul>{result.what_would_change_this.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}</ul>
          </section>
        </div>
      )}

      <p className="disclaimer">{result.disclaimer}{briefId && <> · <a href={`/brief/${briefId}`}>Full brief with every source</a></>}</p>
    </div>
  );
}
