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
  [/\basks? (typically |usually )?eases? after the first season\b/gi, "sellers drop the price after the first season"],
  [/\basks? (typically |usually )?eases?\b/gi, "sellers drop the price after the first season"],
  [/\ban archive code\b/gi, "a shape the house has made for decades"],
  [/\barchive codes?\b/gi, "shapes the house has made for decades"],
  [/\ban era premium\b/gi, "a bump after the designer leaves"],
  [/\bera premium\b/gi, "the bump a designer's bags get after they leave"],
  [/\bclears? at\b/gi, "sells for about"],
  [/\bsell-through\b/gi, "how fast they sell"],
  [/\bliquidity default\b/gi, "the easiest to resell"],
  [/\bliquid(ity)?\b/gi, "easy to resell"],
  [/\bcomposite\b/gi, "overall score"],
  [/\brealised\b/gi, "actual"],
];
export function plain(t: string | undefined | null): string { let x = t ?? ""; for (const [re, to] of PLAIN) x = x.replace(re, to); return x; }
/** Small engraved glyphs that give each section a face: a speech bubble for the culture board, a ledger for the numbers, a bell for moments. */
const Glyph = ({ kind }: { kind: "chat" | "ledger" | "bell" | "anchor" | "proof" }) => (
  <svg className="sg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "chat" && <><path d="M4 6h16v9H9l-4 3v-3H4z" /><path d="M8 10.5h8M8 13h5" opacity=".7" /></>}
    {kind === "ledger" && <><rect x="5" y="4" width="14" height="16" rx="1.5" /><path d="M8 9h8M8 12h8M8 15h5" opacity=".7" /></>}
    {kind === "bell" && <><path d="M7 16V11a5 5 0 0 1 10 0v5l1.5 2h-13z" /><path d="M10 20a2 2 0 0 0 4 0" /></>}
    {kind === "anchor" && <><circle cx="12" cy="5" r="2" /><path d="M12 7v13M6 13a6 6 0 0 0 12 0M4 12l2 1M20 12l-2 1" /></>}
    {kind === "proof" && <><path d="M6 4h9l3 3v13H6z" /><path d="M9 11h6M9 14h6M9 17h4" opacity=".7" /></>}
  </svg>
);

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
        {result.timing && (() => { const t = plain(result.timing); const [a, ...r] = t.split(/(?<=[.;:])\s+/); return <p className="timing"><b>{a}</b>{r.length ? " " + r.join(" ") : ""}</p>; })()}
        <div className="stamps"><span className="stamp">{result.call}</span><span className="stamp">confidence {result.confidence.toLowerCase()}</span></div>
        <p className="seeit"><span className="lab">go look at it</span>{seeItLinks(bagName.split(" · ")[0] ?? "", bagName.split(" · ")[1] ?? "", n?.links).map((l, i) => <a key={i} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}</p>
      </section>

      {result.options && result.options.length > 0 && (
        <>
          <p className="lab stripcap">the timing question</p>
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
            <p className="word">{WORD[s.verdict]}</p>
            <p className="lab intent">{(INTENT_LABEL[s.intent]?.title ?? s.intent).toLowerCase()}</p>
            <p className="why">{plain(s.why)}</p>
            <p className="def">{DEF[s.intent]}</p>
          </section>
        ))}
      </div>

      {n && (n.retail_now || n.sold_median || n.ask_median || n.sell || n.asks) && (
        <>
          <p className="lab stripcap"><Glyph kind="ledger" /><span className="h1txt">the receipts · what actually changed hands</span><span className="h5h10txt">the long receipts · what has held</span></p>
          <div className="strip">
            {n.sell && (() => { const sl = n.sell; const rate = payoutRate(sl.median_sold); const net = Math.round(sl.median_sold * rate - sl.retail); return (
              <div className={`sell ${net >= 0 ? "up" : "down"}`}><div className="lab">buy at the boutique, resell now</div><div className="v">{net >= 0 ? "+" : "−"}{money(Math.abs(net))}</div><div className="l"><b>Pay {money(sl.retail)}.</b> Pristine ones sold for {money(sl.median_sold)} ({sl.n} sold listings seen on The RealReal in the last {sl.window_days} days). After The RealReal&apos;s {Math.round((1 - rate) * 100)}%, you keep about {money(Math.abs(net))} {net >= 0 ? "more" : "less"} than you paid. {/(hermès|hermes|chanel)/i.test(bagName) ? "Getting one is the hard part." : ""}</div></div>
            ); })()}
            {n.sell ? (
              <div><div className="lab">sold for</div><div className="v">{money(n.sell.median_sold)}</div><div className="l"><b>Pristine. {n.sell.n} sold listings seen in the last {n.sell.window_days} days.</b> The RealReal shows no sale dates. {n.sold_n > 0 && n.sold_median ? `All conditions, all time: ${money(n.sold_median)} (${n.sold_n}).` : ""}</div></div>
            ) : n.sold_n > 0 && n.sold_median ? (
              <div><div className="lab">sold for</div><div className="v">{money(n.sold_median)}</div><div className="l"><b>{n.sold_n} sales, same size, any condition.</b>{n.retail_now ? ` ${Math.round(n.sold_pct_of_retail ?? 0)}% of the store price.` : ""}</div></div>
            ) : n.asks ? (
              <div><div className="lab">sellers want</div><div className="v">{money(n.asks.median_ask)}</div><div className="l"><b>{n.asks.n} listing{n.asks.n === 1 ? "" : "s"}{n.asks.fwrd_n ? " across The RealReal and FWRD Renew" : ""}, none sold yet.</b> Wanting is not getting.</div></div>
            ) : n.trr_sold_90d > 0 ? (
              <div><div className="lab">sales seen</div><div className="v">{n.trr_sold_90d}</div><div className="l"><b>Sizes and finishes mixed.</b> No same-size sale yet.</div></div>
            ) : null}
            {n.retail_now && <div><div className="lab">new, today</div><div className="v">{money(n.retail_now)}</div><div className="l"><b>Boutique price.</b>{n.retail_launch && n.retail_launch !== n.retail_now ? ` Was ${money(n.retail_launch)} at launch.` : ""}</div></div>}
            {n.asks?.fwrd_n && n.asks.fwrd_median ? <div><div className="lab">the FWRD Renew shelf</div><div className="v">{money(n.asks.fwrd_median)}</div><div className="l"><b>{n.asks.fwrd_n} vetted pre-owned listing{n.asks.fwrd_n === 1 ? "" : "s"} this week.</b> An asking price, not a sale, from a seller whose pricing we trust.</div></div> : null}
            {n.ask_median && n.retail_now && !n.sell && <div><div className="lab">sellers want</div><div className="v">{Math.round((100 * n.ask_median) / n.retail_now)}%</div><div className="l"><b>of the store price,</b> across {n.ask_n} listings.</div></div>}
            <span className="longonly">
              <div><div className="lab">made for decades?</div><div className="v">{n.icon ? "Yes" : "Not yet"}</div><div className="l"><b>{n.icon ? "A shape the house keeps making." : "A new shape."}</b> {n.icon ? "These hold." : "Novelties fade."}</div></div>
            </span>
          </div>
          {n.path && (
            <p className="anchor"><span className="lab"><Glyph kind="anchor" />the price creep</span> <b>{bagName.split(" · ")[0]} raised it from {money(n.path.from_price)} to {money(n.path.to_price)}</b> ({fmtDate(n.path.from_date)} to {fmtDate(n.path.to_date)}). Last year&apos;s price now looks like a deal.</p>
          )}
        </>
      )}

      <button type="button" className="why-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "hide the why" : "show me why"}</button>
      {open && (
        <div className="edit">
          <section className="glance">
            <p className="lab">if you read nothing else</p>
            <ol>{(result.takeaways && result.takeaways.length ? result.takeaways : cards.slice(0, 3).map((c) => c.headline)).slice(0, 3).map((t, i) => <li key={i}>{plain(t)}</li>)}</ol>
          </section>

          {(() => {
            const b = n?.buzz;
            const house = bagName.split(" · ")[0] ?? "";
            const bagShort = bagName.split(" · ")[1] ?? "this bag";
            const name: Record<string, string> = { google: "Google", instagram: "Instagram", tiktok: "TikTok", "tiktok-cc": "TikTok", youtube: "YouTube", reddit: "Reddit", pinterest: "Pinterest", "vogue-runway": "Vogue Runway" };
            const plat = (b?.detail ?? "").split(" ").map((d) => d.match(/^([a-z-]+):/i)?.[1]).filter(Boolean).map((k) => name[k as string] ?? k) as string[];
            const readFrom = Array.from(new Set(plat));
            const tiktokRead = readFrom.includes("TikTok");
            // a search rise counts only when it is more than a handful of searches (the note carries "last week N")
            const growth = (b?.movers ?? []).find((m) => m.platform === "google" && m.metric === "growth_pct_7d" && Number((m.note ?? "").match(/last week (\d+)/)?.[1] ?? 0) >= 5);
            const trendsForHouse = (b?.trends ?? []).filter((t) => new RegExp(house.split(" ")[0], "i").test(t.note) && !/engagement, \d+ brands|most-viewed/i.test(t.note));
            const over = trendsForHouse.find((t) => /deinfluenc|moved on|had its moment|backlash|over\b/i.test(t.note));
            const carrying = (b?.trends ?? []).find((t) => /whatsinmybag|what's in my bag/i.test(t.note)) ?? (b?.trends ?? []).find((t) => /carr(y|ied)|rotation|most-shown/i.test(t.note));
            const dupe = (b?.trends ?? []).find((t) => /dupe|inspired by|boujee on a budget/i.test(t.note));
            const recentEvent = (b?.events ?? []).find((e) => !/fashion month on Instagram/i.test(e.note));
            const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const allTags = (b?.movers ?? []).filter((m) => (m.platform === "instagram" || m.platform.startsWith("tiktok")) && m.metric.startsWith("posts"));
            const bagTags = b?.level === "family" ? allTags : [];
            const houseTags = b?.level === "family" ? [] : allTags;
            const tiktokTrends = (b?.trends ?? []).some((t) => /tiktok|#bagtok|#whatsinmybag/i.test(t.note + t.source));
            const strip = (t: string) => { const i = t.indexOf(": "); return (i > 0 && i < 60 ? t.slice(i + 2) : t).replace(/\s*\(top ~?\d+ visible posts, logged out\)/i, ""); };
            const sentence = (t: string) => strip(t);
            /** The one or two sentences of a note that answer the line, not the whole paragraph. */
            const pick = (t: string, re: RegExp, max = 200) => { const parts = strip(t).split(/(?<=[.;])\s+/); const hit = parts.filter((x) => re.test(x)); const list = hit.length ? hit : parts; let out = list[0] ?? ""; if (list[1] && (out + " " + list[1]).length <= max) out += " " + list[1]; return out; };
            const cult = cards.find((c) => c.key === "culture");
            const mood = !b ? "no read yet" : over ? "turning" : growth && growth.value > 15 ? "rising" : "quiet";
            const cultureCard = (
              <article className={`ecard culture ${!b ? "mixed" : over ? "weak" : growth && growth.value > 15 ? "strong" : "mixed"}`}>
                <header><h4><Glyph kind="chat" />The group chat</h4><span className="stamp">{mood}</span></header>
                <p className="h"><b>{b ? (over ? `The feeds have thoughts. Is ${bagShort} over?` : growth && growth.value > 15 ? `Everyone's suddenly searching “${growth.term}”: up ${Math.round(growth.value)}% this week.` : `Quiet week. ${house} is minding its own business.`) : `Nobody's said a word about ${house} yet.`}</b></p>
                {cult && <p className="so">{plain(cult.soWhat ?? cult.headline)}</p>}
                {b && (
                  <details>
                    <summary><Glyph kind="chat" />the chat</summary>
                    <dl className="bz-lines">
                      <div><dt>Is it over?</dt><dd>{over ? pick(over.note, /deinfluenc|moved on|had its moment|backlash|over\b/i) : trendsForHouse.length ? `Not that we can see. ${pick(trendsForHouse[0].note, new RegExp(house.split(" ")[0], "i"))}` : `No one is calling ${house} over this week.`}</dd></div>
                      <div><dt>Who&apos;s carrying it</dt><dd>{carrying && new RegExp(house.split(" ")[0], "i").test(carrying.note) ? `${pick(carrying.note, new RegExp(house.split(" ")[0], "i"), 160)} That is a Gen Z feed; nothing on women over 35 yet.` : "Nothing on women over 35 yet. The Gen Z feeds show Coach and mid-range labels, with luxury as the occasional treat."}</dd></div>
                      <div><dt>The dupe situation</dt><dd>{dupe ? (new RegExp(house.split(" ")[0], "i").test(pick(dupe.note, /dupe|inspired by|boujee|deinfluenc/i, 160)) ? pick(dupe.note, /dupe|inspired by|boujee|deinfluenc/i, 160) : `Dupes and deinfluencing are circulating among younger buyers. Nothing aimed at ${house} this week.`) : "No dupe or deinfluencing wave touching this house this week."}</dd></div>
                      <div><dt>Where it lives online</dt><dd>{bagTags.length ? bagTags.slice(0, 3).map((t) => `#${t.term} (${Math.round(t.value).toLocaleString()} posts)`).join(", ") : houseTags.length ? `No tag of its own yet. The house's: ${houseTags.slice(0, 2).map((t) => `#${t.term} (${Math.round(t.value) >= 1e6 ? (t.value / 1e6).toFixed(1) + "M" : Math.round(t.value / 1000) + "K"})`).join(", ")}.` : `No hashtag of its own yet; ${house}'s tags carry it.`}</dd></div>
                    </dl>
                    {b.events.filter((e) => !/fashion month on Instagram/i.test(e.note)).length > 0 && (
                      <div className="bz-moments"><p className="lab"><Glyph kind="bell" />moments worth knowing</p>
                        <ol>{b.events.filter((e) => !/fashion month on Instagram/i.test(e.note)).slice(0, 2).map((e, i) => <li key={i}><span className="when">{fmt(e.date)}</span><span className="what">{e.note}</span></li>)}</ol></div>
                    )}
                    <p className="bz-read">Read from {[...readFrom, ...(tiktokTrends && !tiktokRead ? ["TikTok tag pages"] : [])].join(", ") || "the tracker"}{b.read_date ? ` on ${fmt(b.read_date)}` : ""}. Counts only; no posts or people are stored.</p>
                  </details>
                )}
              </article>
            );
            return (
              <div className="ecards">
                {cultureCard}
                {cards.filter((c) => c.key !== "buy" && c.key !== "culture").map((c) => {
              const [proof, ...more] = c.evidence;
              return (
                <article key={c.key} className={`ecard ${c.mood}`}>
                  <header><h4>{c.title}</h4><span className="stamp">{c.mood === "strong" ? "good sign" : c.mood === "weak" ? "weak spot" : "mixed"}</span></header>
                  <p className="h"><b>{plain(c.soWhat ?? c.headline).replace(/\.$/, "")}.</b></p>
                  {c.soWhat && <p className="so">{plain(c.headline)}</p>}
                  {(proof || more.length > 0 || c.more) && (
                    <details>
                      <summary><Glyph kind="proof" />receipts</summary>
                      <ul>{[...(proof ? [proof] : []), ...more].slice(0, 4).map((e, i) => <li key={i}>{e.text} <span className="src">{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.source}</a> : e.source}</span></li>)}</ul>
                    </details>
                  )}
                </article>
              );
            })}
              </div>
            );
          })()}

          <div className="watch">
            {result.spec_guidance?.length > 0 && <section><p className="lab">if you do buy</p><ul>{result.spec_guidance.slice(0, 2).map((b, i) => <li key={i}>{plain(b)}</li>)}</ul></section>}
            <section><p className="lab">the case for</p><ul>{result.bull_case.slice(0, 2).map((b, i) => <li key={i}>{plain(b)}</li>)}</ul></section>
            <section><p className="lab">the case against</p><ul>{result.bear_case.slice(0, 2).map((b, i) => <li key={i}>{plain(b)}</li>)}</ul></section>
            <section><p className="lab">what would change our mind</p><ul>{result.what_would_change_this.slice(0, 1).map((b, i) => <li key={i}>{plain(b)}</li>)}</ul></section>
          </div>
        </div>
      )}

      <p className="disclaimer">{result.disclaimer}{briefId && <> · <a href={`/brief/${briefId}`}>Full brief with every source</a></>}</p>
    </div>
  );
}
