"use client";

import { useState } from "react";
import type { BriefResult } from "@/lib/schema";
import type { QuickNumbers } from "@/lib/tracker";
import { toCards, toSignals, INTENT_LABEL } from "@/lib/cards";
import BagPlate, { seeItLinks } from "./BagPlate";

const WORD: Record<string, string> = { yes: "Buy", no: "Don't", wait: "Wait" };
const CLS: Record<string, string> = { yes: "buy", no: "dont", wait: "wait" };
const DEF: Record<string, string> = {
  flip_1y: "Buy now, sell by this time next year.",
  hold_5y: "Buy now, sell around 2031.",
  hold_10y: "Buy now and keep. Only shapes the house has made for decades earn this.",
  wear: "Buy to use. Value comes second.",
};
const GLYPH: Record<string, React.ReactNode> = {
  flip_1y: <><path d="M8 20h32l-3 20H11z" /><path d="M16 20c0-8 16-8 16 0" /><path d="M36 10l4 4-4 4" /><path d="M8 14h32" /></>,
  hold_5y: <><circle cx="24" cy="24" r="16" /><path d="M24 12v12l8 5" /></>,
  hold_10y: <><path d="M10 40V18l14-10 14 10v22z" /><path d="M20 40V28h8v12" /></>,
  wear: <><path d="M14 44V22l-6 2 4-10 12-4 12 4 4 10-6-2v22z" /><path d="M18 10c0 6 12 6 12 0" /></>,
};
const money = (v: number | null | undefined) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`);

/** Words a buyer should never have to decode. The scorer is told the same list; this is the net. */
const PLAIN: [RegExp, string][] = [
  [/\barchive codes?\b/gi, "shapes the house has made for decades"],
  [/\bera premium\b/gi, "the bump a designer's bags get after they leave"],
  [/\basks? (typically |usually )?eases?\b/gi, "sellers drop the price after the first season"],
  [/\bclears? at\b/gi, "sells for about"],
  [/\bsell-through\b/gi, "how fast they sell"],
  [/\bliquidity default\b/gi, "easiest to resell"],
  [/\bliquid(ity)?\b/gi, "easy to resell"],
  [/\bretention\b/gi, "value kept"],
  [/\bcomposite\b/gi, "overall score"],
  [/\basking prices?\b/gi, "what sellers want"],
  [/\brealised\b/gi, "actual"],
];
export function plain(t: string | undefined | null): string { let x = t ?? ""; for (const [re, to] of PLAIN) x = x.replace(re, to); return x; }
/** What a consignor keeps on The RealReal at a given sale price (published tiers, rounded; an estimate, not a quote). */
const payoutRate = (price: number) => price >= 10000 ? 0.85 : price >= 5000 ? 0.8 : price >= 2500 ? 0.75 : price >= 1500 ? 0.7 : price >= 750 ? 0.6 : 0.55;
const fmtDate = (d: string) => { const [y, m] = d.split("-"); const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return m ? `${M[Number(m) - 1]} ${y}` : y; };

export default function Answer({ result, bagName, briefId, numbers, photo }: { result: BriefResult; bagName: string; briefId?: string; numbers: QuickNumbers | null; photo?: string | null }) {
  const [open, setOpen] = useState(false);
  const signals = toSignals(result);
  const cards = toCards(result);
  const n = numbers;
  const plainAnswer = plain(result.plain_answer || result.one_line);
  const [first, ...rest] = plainAnswer.split(/(?<=\.)\s+/);
  return (
    <div className="answer">
      <section className="verdict">
        {photo ? <img src={photo} alt="" className="vphoto" /> : <BagPlate name={bagName} size={132} className="vplate" />}
        <p className="lab who">{bagName.split(" · ").slice(0, 2).join(" · ").toLowerCase()}</p>
        {bagName.split(" · ").length > 2 && <p className="spec">{bagName.split(" · ").slice(2).join(" · ")}</p>}
        <h2>{first} {rest.length > 0 && <i>{rest.join(" ")}</i>}</h2>
        {result.timing && <p className="timing">{plain(result.timing)}</p>}
        <div className="stamps"><span className="stamp">{result.call}</span><span className="stamp">confidence {result.confidence.toLowerCase()}</span></div>
        <p className="seeit"><span className="lab">see it</span>{seeItLinks(bagName.split(" · ")[0] ?? "", bagName.split(" · ")[1] ?? "", n?.links).map((l, i) => <a key={i} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}</p>
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
                <p className="why">{plain(o.why)}</p>
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
            <p className="why">{plain(s.why)}</p>
          </section>
        ))}
      </div>

      {n && (n.retail_now || n.sold_median || n.ask_median) && (
        <>
          <p className="lab stripcap"><span className="h1txt">right now · from the tracker</span><span className="h5h10txt">the long view · from the tracker</span></p>
          <div className="strip">
            {n.sell && (() => { const sl = n.sell; const rate = payoutRate(sl.median_sold); const net = Math.round(sl.median_sold * rate - sl.retail); return (
              <div className={`sell ${net >= 0 ? "up" : "down"}`}><div className="lab">buy at the boutique, resell now</div><div className="v">{net >= 0 ? "+" : "−"}{money(Math.abs(net))}</div><div className="l">Pay {money(sl.retail)} at the boutique{sl.retail_spec ? ` (${sl.retail_spec})` : ""}, before sales tax. Resale buyers paid {money(sl.median_sold)} in the last {sl.window_days} days for the same edition in pristine or tagged condition: actual sales, not asking prices. The RealReal keeps about {Math.round((1 - rate) * 100)}% at that price, so that is {net >= 0 ? "profit after fees" : "a loss after fees"}. {sl.n} sale{sl.n === 1 ? "" : "s"} behind it{sl.n < 10 ? ", which is thin" : sl.n < 30 ? ", a fair sample" : ", a solid sample"}. {/(hermès|hermes|chanel)/i.test(bagName) ? "Getting one is the hard part: these are allocated, and selling a new bag can cost you the access that got it." : "Check the boutique will sell you one at that price."}</div></div>
            ); })()}
            {n.sold_n > 0 && n.sold_median && <div><div className="lab">sold for</div><div className="v">{money(n.sold_median)}</div><div className="l">{n.retail_now ? `against ${money(n.retail_now)} new, so ${Math.round(n.sold_pct_of_retail ?? 0)}% of the store price.` : "actual sales, same size."} {n.sold_n} sale{n.sold_n === 1 ? "" : "s"} we can see.</div></div>}
            {!n.sold_n && n.trr_sold_90d > 0 && <div><div className="lab">sales seen</div><div className="v">{n.trr_sold_90d}</div><div className="l">sold on The RealReal in 90 days, sizes and finishes mixed. No same-size sale yet.</div></div>}
            {n.retail_now && <div><div className="lab">new, today</div><div className="v">{money(n.retail_now)}</div><div className="l">{n.retail_launch && n.retail_launch !== n.retail_now ? `Was ${money(n.retail_launch)} at launch.` : "Boutique price."}{n.retail_size ? ` ${n.retail_size}.` : ""}</div></div>}
            {n.ask_median && n.retail_now && <div><div className="lab">sellers want</div><div className="v">{Math.round((100 * n.ask_median) / n.retail_now)}%</div><div className="l">of new: {money(n.ask_median)} across {n.ask_n} listings. Wanting is not getting.</div></div>}
            {n.trend_pct != null && <div><div className="lab">asking trend</div><div className="v">{n.trend_pct > 0 ? "+" : ""}{n.trend_pct}%</div><div className="l">where what sellers want moved since the last snapshot.</div></div>}
            <span className="longonly">
              <div><div className="lab">made for decades?</div><div className="v">{n.icon ? "Yes" : "Not yet"}</div><div className="l">Shapes the house keeps making hold value; novelties fade.</div></div>
            </span>
          </div>
          {n.path && (
            <p className="anchor"><span className="lab">the anchor</span> {bagName.split(" · ")[0]} raised the {bagName.split(" · ")[1] ?? "bag"} from {money(n.path.from_price)} ({fmtDate(n.path.from_date)}) to {money(n.path.to_price)} ({fmtDate(n.path.to_date)}). A bag bought at the old price now looks like a deal{n.sold_pct_of_retail ? `, and resale has followed to ${Math.round(n.sold_pct_of_retail)}% of today's price` : ""}.</p>
          )}
        </>
      )}

      <button type="button" className="why-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "hide the why" : "show me why"}</button>
      {open && (
        <div className="edit">
          <section className="glance">
            <p className="lab">at a glance</p>
            <ol>{(result.takeaways && result.takeaways.length ? result.takeaways : cards.slice(0, 3).map((c) => c.headline)).slice(0, 3).map((t, i) => <li key={i}>{plain(t)}</li>)}</ol>
          </section>

          {(() => {
            const b = n?.buzz;
            const mood = !b || b.direction == null ? "quiet" : b.direction === "rising" ? (b.score != null && b.score >= 70 ? "on fire" : "warming up") : b.direction === "fading" ? "cooling off" : "steady";
            const plat = (b?.detail ?? "").split(" ").filter(Boolean).map((d) => { const m = d.match(/^([a-z-]+):(\d+)(?:\(([+-]?\d+)%\))?/i); return m ? { key: m[1], score: Number(m[2]), growth: m[3] ? Number(m[3]) : null } : null; }).filter(Boolean) as { key: string; score: number; growth: number | null }[];
            const name: Record<string, string> = { google: "Google search", instagram: "Instagram", tiktok: "TikTok", "tiktok-cc": "TikTok trends", youtube: "YouTube", reddit: "Reddit", pinterest: "Pinterest", "vogue-runway": "Vogue Runway" };
            const missing = ["tiktok", "instagram", "google"].filter((k) => !plat.some((p) => p.key === k || (k === "tiktok" && p.key === "tiktok-cc")));
            const tags = (b?.movers ?? []).filter((m) => (m.platform === "instagram" || m.platform === "tiktok" || m.platform === "tiktok-cc") && (m.metric === "posts_total" || m.metric === "posts_7d" || m.metric === "views_7d" || m.metric === "posts_visible"));
            const searches = (b?.movers ?? []).filter((m) => m.platform === "google" && m.metric === "growth_pct_7d");
            const fmt = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : `${Math.round(v)}`;
            const why = plat.map((p) => `${name[p.key] ?? p.key} ${p.score}${p.growth != null ? ` (${p.growth > 0 ? "+" : ""}${p.growth}% this week)` : ""}`).join(" · ");
            return (
              <section className="buzz2">
                <header className="bz-head">
                  <div><p className="lab">the buzz · what the internet is saying</p><h4>{b ? <>The crowd is <i>{mood}</i>.</> : <>No crowd read <i>yet</i>.</>}</h4></div>
                  {b && <div className="bz-score"><b>{b.score ?? "—"}</b><span>/100 · {b.direction ?? "no direction"}</span></div>}
                </header>
                {b ? (
                  <>
                    <p className="bz-why">Where the {b.score} comes from: {why || "one platform"}.{missing.length ? ` ${missing.map((k) => name[k]).join(" and ")} not read yet${missing.includes("tiktok") ? " (needs the TikTok trends sign-in)" : ""}.` : ""}{b.level === "house" ? " Read at house level; no hashtags for this exact bag yet." : ""}</p>
                    {tags.length > 0 && (<p className="lab bz-lab">hashtags people are posting</p>)}
                    {tags.length > 0 && (
                      <div className="bz-tags">
                        {tags.slice(0, 8).map((t, i) => <span key={i} className="htag"><b>#{t.term}</b><span>{fmt(t.value)} {t.metric === "views_7d" ? "views" : "posts"}</span><em>{name[t.platform] ?? t.platform}</em></span>)}
                      </div>
                    )}
                    {searches.length > 0 && (
                      <p className="bz-search">{searches.slice(0, 3).map((m, i) => <span key={i} className={`srch ${m.value > 0 ? "up" : "down"}`}>“{m.term}” {m.value > 0 ? "↑" : "↓"} {Math.abs(Math.round(m.value))}% in search this week</span>)}</p>
                    )}
                    {b.trends.length > 0 && (
                      <div className="bz-moments viral">
                        <p className="lab">going viral · what the feeds are on about</p>
                        <ol>{b.trends.slice(0, 4).map((t, i) => <li key={i}><span className="when">{new Date(t.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span><span className="what">{t.note.length > 260 ? t.note.slice(0, 257).replace(/\s+\S*$/, "") + "…" : t.note} <span className="src">{t.source}</span></span></li>)}</ol>
                      </div>
                    )}
                    {b.events.length > 0 && (
                      <div className="bz-moments">
                        <p className="lab">events people are talking about</p>
                        <ol>{b.events.slice(0, 4).map((e, i) => <li key={i}><span className="when">{new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span><span className="what">{e.note}</span></li>)}</ol>
                      </div>
                    )}
                    <p className="bnote">Score = 50 + week-over-week growth, plus a little for volume, averaged across the platforms we read. Derived counts only; no posts or people are stored.</p>
                  </>
                ) : <p className="bz-why">The daily run adds this bag&apos;s hashtags and search terms the day after it is first asked about.</p>}
              </section>
            );
          })()}

          <div className="ecards">
            {cards.filter((c) => c.key !== "buy").map((c) => {
              const [proof, ...more] = c.evidence;
              return (
                <article key={c.key} className={`ecard ${c.mood}`}>
                  <header><h4>{c.title}</h4><span className="stamp">{c.mood === "strong" ? "good sign" : c.mood === "weak" ? "weak spot" : "mixed"}</span></header>
                  <p className="h">{plain(c.headline)}</p>
                  {c.soWhat && <p className="so">{plain(c.soWhat)}</p>}
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
