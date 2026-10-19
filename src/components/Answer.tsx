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
        <p className="lab who">{bagName.split(" · ").slice(0, 2).join(" · ").toLowerCase()}</p>
        {bagName.split(" · ").length > 2 && <p className="spec">{bagName.split(" · ").slice(2).join(" · ")}</p>}
        <h2>{first} {rest.length > 0 && <i>{rest.join(" ")}</i>}</h2>
        {result.timing && <p className="timing">{result.timing}</p>}
        <div className="stamps"><span className="stamp">{result.call}</span><span className="stamp">confidence {result.confidence.toLowerCase()}</span></div>
      </section>

      {result.options && result.options.length > 0 && (
        <>
          <p className="lab stripcap">when to buy</p>
          <div className="tiles options" aria-label="When to buy">
            {result.options.slice(0, 3).map((o, i) => (
              <section key={i} className={`tile on ${CLS[o.verdict]}`}>
                <svg className="frame" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" stroke="currentColor"><rect x="1.5" y="1.5" width="97" height="97" rx="3" strokeWidth=".6" /><rect x="4" y="4" width="92" height="92" rx="2" strokeWidth=".3" /></svg>
                <p className="lab intent">{o.label.toLowerCase()}</p>
                <p className="word">{WORD[o.verdict]}</p>
                <p className="why">{o.why}</p>
              </section>
            ))}
          </div>
        </>
      )}

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

      <section className="buzz" aria-label="The buzz">
        <p className="lab stripcap">the buzz · what people are saying</p>
        {n?.buzz ? (
          <div className="buzzbox">
            <div className="bscore">
              <div className="bnum">{n.buzz.score ?? "—"}<small>/100</small></div>
              <div className="bdir">{n.buzz.direction ?? "no direction yet"}</div>
              <div className="bsub">{n.buzz.platforms} platform{n.buzz.platforms === 1 ? "" : "s"}{n.buzz.level === "house" ? " · read at house level; no bag-specific terms yet" : " · read for this bag"}</div>
            </div>
            <div className="bplat">
              {(n.buzz.detail ?? "").split(" ").filter(Boolean).map((d, i) => {
                const m = d.match(/^([a-z-]+):(\d+)(?:\(([+-]?\d+)%\))?/i);
                if (!m) return null;
                const name: Record<string, string> = { google: "Google search", instagram: "Instagram", tiktok: "TikTok", "tiktok-cc": "TikTok trends", youtube: "YouTube", reddit: "Reddit", pinterest: "Pinterest", "vogue-runway": "Vogue Runway" };
                return <div key={i} className="bchip"><b>{name[m[1]] ?? m[1]}</b><span>{m[2]}</span>{m[3] && <em>{Number(m[3]) > 0 ? "+" : ""}{m[3]}% this week</em>}</div>;
              })}
            </div>
            {n.buzz.movers.length > 0 && (
              <ul className="bmoves">
                {n.buzz.movers.slice(0, 4).map((m, i) => (
                  <li key={i}><b>“{m.term}”</b> on {m.platform.replace("-cc", " trends").replace("vogue-runway", "Vogue Runway")}: {m.metric === "growth_pct_7d" ? `${m.value > 0 ? "+" : ""}${Math.round(m.value)}% search interest this week` : m.metric === "posts_total" ? `${Math.round(m.value).toLocaleString()} posts` : m.metric === "most_viewed_rank_ss27" ? (m.value > 10 ? "outside the top 10 most-viewed SS27 shows on Vogue Runway" : `#${m.value} most-viewed SS27 show on Vogue Runway`) : m.metric === "interest_0_100" ? `search interest ${Math.round(m.value)}/100 this week` : m.metric.startsWith("fw_ss27_engagements") ? `${Math.round(m.value).toLocaleString()} fashion-month engagements` : m.metric === "posts_visible" ? `${m.value} posts visible on the tag page` : `${m.metric.replace(/_/g, " ")} ${m.value}`}</li>
                ))}
              </ul>
            )}
            {n.buzz.events.length > 0 && (
              <div className="bevents">
                <p className="lab">moments</p>
                <ul>{n.buzz.events.slice(0, 3).map((e, i) => <li key={i}><span className="when">{e.date}</span> {e.note}</li>)}</ul>
              </div>
            )}
            <p className="bnote">Score = 50 + week-over-week growth, plus a little for volume, averaged across the platforms we read. One platform is a weak read. Derived counts only; we store no posts or people.</p>
          </div>
        ) : (
          <div className="buzzbox empty"><p>No buzz read yet for this bag. The daily run adds its hashtags and search terms the day after it is first asked about.</p></div>
        )}
      </section>

      <button type="button" className="why-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "hide the why" : "show me why"}</button>
      {open && (
        <div className="edit">
          <section className="glance">
            <p className="lab">at a glance</p>
            <ol>{(result.takeaways && result.takeaways.length ? result.takeaways : cards.slice(0, 3).map((c) => c.headline)).slice(0, 3).map((t, i) => <li key={i}>{t}</li>)}</ol>
          </section>

          <div className="ecards">
            {cards.filter((c) => c.key !== "buy").map((c) => {
              const [proof, ...more] = c.evidence;
              return (
                <article key={c.key} className={`ecard ${c.mood}`}>
                  <header><h4>{c.title}</h4><span className="stamp">{c.mood === "strong" ? "good sign" : c.mood === "weak" ? "weak spot" : "mixed"}</span></header>
                  <p className="h">{c.headline}</p>
                  {c.soWhat && <p className="so">{c.soWhat}</p>}
                  {proof && <p className="proof">{proof.text} <span className="src">{proof.url ? <a href={proof.url} target="_blank" rel="noreferrer">{proof.source}</a> : proof.source}</span></p>}
                  {(more.length > 0 || c.more) && (
                    <details>
                      <summary>more</summary>
                      {c.more && <p>{c.more}</p>}
                      <ul>{more.slice(0, 5).map((e, i) => <li key={i}>{e.text} <span className="src">{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.source}</a> : e.source}</span></li>)}</ul>
                    </details>
                  )}
                </article>
              );
            })}
          </div>

          <div className="watch">
            {result.spec_guidance?.length > 0 && <section><p className="lab">if you buy</p><ul>{result.spec_guidance.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}</ul></section>}
            <section><p className="lab">for</p><ul>{result.bull_case.slice(0, 2).map((b, i) => <li key={i}>{b}</li>)}</ul></section>
            <section><p className="lab">against</p><ul>{result.bear_case.slice(0, 2).map((b, i) => <li key={i}>{b}</li>)}</ul></section>
            <section><p className="lab">what would change this</p><ul>{result.what_would_change_this.slice(0, 2).map((b, i) => <li key={i}>{b}</li>)}</ul></section>
          </div>
        </div>
      )}

      <p className="disclaimer">{result.disclaimer}{briefId && <> · <a href={`/brief/${briefId}`}>Full brief with every source</a></>}</p>
    </div>
  );
}
