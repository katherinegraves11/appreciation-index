"use client";

import { useState } from "react";
import type { BriefResult } from "@/lib/schema";
import type { QuickNumbers } from "@/lib/tracker";
import { toCards, toSignals, INTENT_LABEL } from "@/lib/cards";
import BagPlate, { seeItLinks } from "./BagPlate";

const WORD: Record<string, string> = { yes: "Yes", no: "No", wait: "Not yet" };
const CLS: Record<string, string> = { yes: "buy", no: "dont", wait: "wait" };
const DEF: Record<string, string> = {
  flip_1y: "If you sold it within a year.",
  hold_5y: "If you kept it about five years.",
  hold_10y: "If you kept it ten years or more.",
  wear: "If you bought it to use.",
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
  [/\s*\[\[ask-link\]\]/g, ""],
];
export function plain(t: string | undefined | null): string { let x = t ?? ""; for (const [re, to] of PLAIN) x = x.replace(re, to); return x; }
/** Bold the lead: the words up to the first comma, colon or semicolon (five at most), so a scanning eye gets the verdict before the fact. */
function Lead({ text }: { text: string }) {
  const m = text.match(/^([^,:;.]{1,60}?)([,:;])\s*([\s\S]*)$/);
  if (m && m[1].split(/\s+/).length <= 5) return <><b>{m[1]}{m[2]}</b> {m[3]}</>;
  const w = text.split(" ");
  if (w.length <= 4) return <b>{text}</b>;
  return <><b>{w.slice(0, 3).join(" ")}</b> {w.slice(3).join(" ")}</>;
}
/** Client-facing text with the [[ask-link]] token turned into a quiet link to the listing the asking price came from. */
function Rich({ text, link, lead }: { text: string; link?: { href: string; label: string } | null; lead?: boolean }) {
  const parts = (text ?? "").split("[[ask-link]]");
  return <>{parts.map((p, i) => <span key={i}>{i === 0 && lead ? <Lead text={plain(p).trim()} /> : plain(p)}{i < parts.length - 1 && link ? <> <a className="asklink" href={link.href} target="_blank" rel="noreferrer">{link.label}</a></> : null}</span>)}</>;
}
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
  const askLink = n?.asks?.link ? { href: n.asks.link, label: n.asks.link_label } : null;
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
          </section>
        ))}
      </div>

      {n?.forward && n.forward.signals.length > 0 && (() => { const f = n.forward; const b5 = f.bands?.find((b) => b.y === 5); const LEAN: Record<string, string> = { rising: "Trends point up", cooling: "Trends point down", mixed: "Trends pull both ways", steady: "Trends are flat" }; return (
        <p className="anchor ahead"><span className="lab"><Glyph kind="anchor" />looking ahead</span> <b>{LEAN[f.lean]}{f.confidence === "low" ? ", an early read" : ""}.</b> {f.signals.map((s) => `${s.name} ${s.dir}`).join(" · ")}.{f.nextBoutique ? ` On its current pace the boutique price reaches about ${money(f.nextBoutique.price)} by ${f.nextBoutique.date}.` : ""}{b5 ? ` In five years, resale on current trends: ${money(b5.lo)} to ${money(b5.hi)}${n.sell?.plain ? ", any leather" : ""}.` : ""} A forecast, not a promise.</p>
      ); })()}

      {n && (n.retail_now || n.sold_median || n.ask_median || n.sell || n.asks) && (
        <>
          <p className="lab stripcap"><Glyph kind="ledger" /><span className="h1txt">the three prices · boutique, websites, sourcers</span><span className="h5h10txt">the long receipts · what has held</span></p>
          <div className="strip">
            {n.sell && (() => { const sl = n.sell; const rate = payoutRate(sl.median_sold); const net = Math.round(sl.median_sold * rate - sl.retail); return sl.plain ? null : (
              <div className={`sell ${net >= 0 ? "up" : "down"}`}><div className="lab">buy at the boutique, resell now</div><div className="v">{net >= 0 ? "+" : "−"}{money(Math.abs(net))}</div><div className="l"><b>Pay {money(sl.retail)}.</b> {sl.plain ? "Plain ones, not this leather," : "Ones in excellent condition or better"} sold for {money(sl.median_sold)} ({sl.n} sold listings seen on The RealReal, {money(sl.lo)} to {money(sl.hi)}). After The RealReal&apos;s {Math.round((1 - rate) * 100)}%, you keep about {money(Math.abs(net))} {net >= 0 ? "more" : "less"} than you paid. {/(hermès|hermes|chanel)/i.test(bagName) ? "Getting one is the hard part." : ""}</div></div>
            ); })()}
            {n.sell ? (
              <div><div className="lab">sold, on average</div><div className="v">{money(n.sell.mean_sold ?? n.sell.median_sold)}</div><div className="l"><b>{n.sell.plain ? "Any leather, not matched to yours. " : ""}{n.sell.n} sold listings, excellent or better.</b> Middle price {money(n.sell.median_sold)}; {money(n.sell.lo)} to {money(n.sell.hi)}. The RealReal shows no sale dates.</div></div>
            ) : n.sold_n > 0 && n.sold_median ? (
              <div><div className="lab">sold for</div><div className="v">{money(n.sold_median)}</div><div className="l"><b>{n.sold_n} sales, same size, any condition.</b>{n.retail_now ? ` ${Math.round(n.sold_pct_of_retail ?? 0)}% of the store price.` : ""}</div></div>
            ) : n.asks && !n.tiers?.sites_asks ? (
              <div><div className="lab">sellers want</div><div className="v">{money(n.asks.median_ask)}</div><div className="l"><b>{n.asks.n} listing{n.asks.n === 1 ? "" : "s"} on {n.asks.venue}.</b> An ask, not a sale. {n.asks.sold > 0 ? `${n.asks.sold} of this model sold, all colours and sizes; none we can see in this exact colour and finish.` : "None of this model sold in our recent reads."}{n.asks.link ? <> <a className="asklink" href={n.asks.link} target="_blank" rel="noreferrer">{n.asks.link_label}</a></> : null}</div></div>
            ) : n.trr_sold_90d > 0 ? (
              <div><div className="lab">sales seen</div><div className="v">{n.trr_sold_90d}</div><div className="l"><b>Sizes and finishes mixed.</b> No same-size sale yet.</div></div>
            ) : null}
            {n.tiers?.sites_asks && (() => { const t = n.tiers.sites_asks; return <div><div className="lab">websites ask, on average</div><div className="v">{money(t.mean)}</div><div className="l"><b>{t.n} listing{t.n === 1 ? "" : "s"}, {t.matched}.</b> Asks, not sales, from {t.sources.join(", ")}. {t.n > 1 ? `${money(t.lo)} to ${money(t.hi)}.` : ""}{n.asks?.link && t.sources.includes("The RealReal") ? <> <a className="asklink" href={n.asks.link} target="_blank" rel="noreferrer">{n.asks.link_label}</a></> : null}</div></div>; })()}
            {n.tiers?.private_quotes && (() => { const p = n.tiers.private_quotes; return <div><div className="lab">private sourcers, on average</div><div className="v">{money(p.mean)}</div><div className="l"><b>{p.n} quote{p.n === 1 ? "" : "s"} logged{p.n < 3 ? ", too few to call an average" : ""}.</b> Sourcers set their own price, so buyers pay more here.</div></div>; })()}
            {n.retail_now && <div><div className="lab">new, from the boutique</div><div className="v">{money(n.retail_now)}</div><div className="l"><b>The one fixed price{n.retail_size ? `, ${n.retail_size}` : ""}.</b>{n.retail_launch && n.retail_launch !== n.retail_now ? ` Was ${money(n.retail_launch)} at launch.` : ""}</div></div>}
            {!n.tiers?.sites_asks && n.asks?.fwrd_n && n.asks.fwrd_median ? <div><div className="lab">the FWRD Renew shelf</div><div className="v">{money(n.asks.fwrd_median)}</div><div className="l"><b>{n.asks.fwrd_n} vetted pre-owned listing{n.asks.fwrd_n === 1 ? "" : "s"} this week.</b> An asking price, not a sale, from a seller whose pricing we trust.</div></div> : null}
            {n.ask_median && n.retail_now && !n.sell && !n.tiers?.sites_asks && <div><div className="lab">sellers want</div><div className="v">{Math.round((100 * n.ask_median) / n.retail_now)}%</div><div className="l"><b>of the store price,</b> across {n.ask_n} listings.</div></div>}
            <span className="longonly">
              {(() => { const fam = bagName.match(/\b(kelly|birkin)\b(?=.*\b(cut|pochette|danse|elan|moove|depeches|longue|doll|shopper)\b)/i); return fam
                ? <div><div className="lab">made for decades?</div><div className="v">Partly</div><div className="l"><b>The {fam[1][0].toUpperCase() + fam[1].slice(1).toLowerCase()} is.</b> This version is younger, so we do not count it as one.</div></div>
                : <div><div className="lab">made for decades?</div><div className="v">{n.icon ? "Yes" : "Not yet"}</div><div className="l"><b>{n.icon ? "A shape the house keeps making." : "A new shape."}</b> {n.icon ? "These hold." : "Novelties fade."}</div></div>; })()}
            </span>
          </div>
          {n.path && (
            <p className="anchor"><span className="lab"><Glyph kind="anchor" />the price creep</span> <b>{bagName.split(" · ")[0]} raised it from {money(n.path.from_price)} to {money(n.path.to_price)}</b> ({fmtDate(n.path.from_date)} to {fmtDate(n.path.to_date)}), up {Math.round(((n.path.to_price - n.path.from_price) / n.path.from_price) * 100)}% over that time{n.path.steps && n.path.steps > 1 ? `, in ${n.path.steps} rises` : ""}.</p>
          )}
        </>
      )}

      <button type="button" className="why-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "hide the why" : "show me why"}</button>
      {open && (
        <div className="edit">
          <section className="glance">
            <p className="lab">if you read nothing else</p>
            <ol>{(result.takeaways && result.takeaways.length ? result.takeaways : cards.slice(0, 3).map((c) => c.headline)).slice(0, 3).map((t, i) => <li key={i}><Rich text={t} link={askLink} /></li>)}</ol>
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
            const bagWord = bagShort.toLowerCase().split(/\s+/).find((w) => w.length > 2 && !/^\d+$/.test(w) && !house.toLowerCase().includes(w)) ?? "";
            const growth = (b?.movers ?? []).find((m) => m.platform === "google" && m.metric === "growth_pct_7d" && !!bagWord && m.term.toLowerCase().includes(bagWord) && Number((m.note ?? "").match(/last week (\d+)/)?.[1] ?? 0) >= 5);
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
                <header><h4><Glyph kind="chat" />What people are saying</h4><span className="stamp">{mood}</span></header>
                <p className="h"><b>{b ? (over ? `Some posts say ${bagShort} has peaked.` : growth && growth.value > 15 ? `Searches for “${growth.term}” up ${Math.round(growth.value)}% this week, against the month before.` : `A quiet week for ${house}.`) : `Nobody's said a word about ${house} yet.`}</b></p>
                {cult && <p className="so">{plain(cult.soWhat ?? cult.headline)}</p>}
                {b && (
                  <details>
                    <summary><Glyph kind="chat" />the chat</summary>
                    <dl className="bz-lines">
                      <div><dt>Fading?</dt><dd>{over ? pick(over.note, /deinfluenc|moved on|had its moment|backlash|over\b/i) : trendsForHouse.length ? `Not that we can see. ${pick(trendsForHouse[0].note, new RegExp(house.split(" ")[0], "i"))}` : `No one is calling ${house} over this week.`}</dd></div>
                      <div><dt>Who&apos;s carrying it</dt><dd>{carrying && new RegExp(house.split(" ")[0], "i").test(carrying.note) ? `${pick(carrying.note, new RegExp(house.split(" ")[0], "i"), 160)} One feed, not a survey.` : "We don't track who is carrying this bag yet."}</dd></div>
                      <div><dt>Dupes</dt><dd>{dupe ? (new RegExp(house.split(" ")[0], "i").test(pick(dupe.note, /dupe|inspired by|boujee|deinfluenc/i, 160)) ? pick(dupe.note, /dupe|inspired by|boujee|deinfluenc/i, 160) : `Dupes and deinfluencing are circulating among younger buyers. Nothing aimed at ${house} this week.`) : "No dupe or deinfluencing wave touching this house this week."}</dd></div>
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

          {/* The close, the way a buying committee ends: the instruction first and largest, against before for, and the turn-our-mind line as one quiet italic. Lead words bold; no sentiment colours. */}
          <div className="watch">
            {result.spec_guidance?.length > 0 && <section className="do"><p className="lab">if you do buy</p><ul>{result.spec_guidance.slice(0, 2).map((b, i) => <li key={i}><Rich text={b} link={askLink} lead /></li>)}</ul></section>}
            <div className="forag">
              <section><p className="lab">the case against</p><ul>{result.bear_case.slice(0, 2).map((b, i) => <li key={i}><Rich text={b} link={askLink} lead /></li>)}</ul></section>
              <section><p className="lab">the case for</p><ul>{result.bull_case.slice(0, 2).map((b, i) => <li key={i}><Rich text={b} link={askLink} lead /></li>)}</ul></section>
            </div>
            {result.what_would_change_this?.length > 0 && <section className="turn"><p className="lab">what would change our mind</p><p className="one"><Rich text={result.what_would_change_this[0]} link={askLink} lead /></p></section>}
          </div>
        </div>
      )}

      <p className="disclaimer">{result.disclaimer}{briefId && <> · <a href={`/brief/${briefId}`}>Full brief with every source</a></>}</p>
    </div>
  );
}
