"use client";

import { useState } from "react";
import type { BriefResult } from "@/lib/schema";
import type { QuickNumbers } from "@/lib/tracker";
import { toCards, toSignals, INTENT_LABEL, SECTION_SOURCES } from "@/lib/cards";
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
  const [way, setWay] = useState<"new" | "used">(numbers?.paths?.buy.isQuote || !numbers?.paths?.boutique ? "used" : "new");
  const signals = toSignals(result);
  const cards = toCards(result);
  const n = numbers;
  const askLink = n?.asks?.link ? { href: n.asks.link, label: n.asks.link_label } : null;
  const plainAnswer = plain(result.plain_answer || result.one_line);
  const [first, ...rest] = plainAnswer.split(/(?<=\.)\s+/);
  return (
    <div className="answer">
      {n?.paths && (() => { const p = n.paths; const keepOf = (v: number) => Math.round(v * payoutRate(v));
        const isHard = /(hermès|hermes|chanel)/i.test(bagName);
        const keepNow = p.boutique ? keepOf(p.band.mid) - p.boutique.price : 0;
        const later = p.growthPct != null ? p.horizons[2] : { lo: p.band.lo, mid: p.band.mid, hi: p.band.hi };
        const net5 = keepOf(later.mid) - p.buy.price;
        const usedWord = keepOf(later.lo) > p.buy.price ? "Likely" : Math.abs(net5) <= p.buy.price * 0.05 || net5 > 0 ? "Maybe" : "Unlikely";
        const range = (lo: number, hi: number) => (lo === hi ? money(lo) : `${money(lo)} to ${money(hi)}`);
        return (
        <section className="wayask">
          <p className="lab">how are you buying it?</p>
          <div className="dial waypick" role="radiogroup" aria-label="How you are buying it">
            {p.boutique && <button type="button" role="radio" aria-checked={way === "new"} onClick={() => setWay("new")}>new<small>at the boutique, {money(p.boutique.price)}</small></button>}
            <button type="button" role="radio" aria-checked={way === "used"} onClick={() => setWay("used")}>secondhand<small>at {money(p.buy.price)}{p.buy.isQuote ? ", your quote" : ""}</small></button>
          </div>
          {way === "new" && p.boutique ? (
            <div className={`waypanel ${keepNow >= 0 ? "buy" : "dont"}`}>
              <p className="word">{keepNow >= 0 ? "Yes" : "No"}</p>
              <p className="why"><b>{keepNow >= 0 ? "Worth more than you pay, the day you leave." : "Worth less than you pay once it is secondhand."}</b> Secondhand buyers pay about {range(p.band.lo, p.band.hi)}; after a typical resale fee you would keep about {money(Math.abs(keepNow))} {keepNow >= 0 ? "more" : "less"} than {money(p.boutique.price)}.{isHard && keepNow >= 0 ? " Getting one is the hard part." : ""}</p>
            </div>
          ) : (
            <div className={`waypanel ${usedWord === "Likely" ? "buy" : usedWord === "Maybe" ? "wait" : "dont"}`}>
              <p className="word">{usedWord}</p>
              <p className="why"><b>{usedWord === "Likely" ? "Likely to keep going up." : usedWord === "Maybe" ? "Roughly holds its value." : "Unlikely to keep going up from here."}</b> {p.growthPct != null ? `In five years, on current trends, about ${range(later.lo, later.hi)}` : `If prices hold, about ${range(later.lo, later.hi)}`}; after fees, about {money(Math.abs(net5))} {net5 >= 0 ? "more" : "less"} than {money(p.buy.price)}.</p>
            </div>
          )}
          <p className="twonote">Based on {p.basisNote}. A read on today&apos;s prices, not a promise.</p>
        </section>
      ); })()}

      <section className="verdict">
        {photo ? <img src={photo} alt="" className="vphoto" /> : <BagPlate name={bagName} size={132} className="vplate" />}
        <p className="lab who">{bagName.split(" · ").slice(0, 2).join(" · ").toLowerCase()}</p>
        {bagName.split(" · ").length > 2 && <p className="spec">{bagName.split(" · ").slice(2).join(" · ")}</p>}
        <h2>{first} {rest.length > 0 && <i>{rest.join(" ")}</i>}</h2>
        {result.timing && (() => { const t = plain(result.timing); const [a, ...r] = t.split(/(?<=[.;:])\s+/); return <p className="timing"><b>{a}</b>{r.length ? " " + r.join(" ") : ""}</p>; })()}
        <div className="stamps"><span className="stamp">{result.call}</span><span className="stamp">confidence {result.confidence.toLowerCase()}</span></div>
        <p className="seeit"><span className="lab">go look at it</span>{seeItLinks(bagName.split(" · ")[0] ?? "", bagName.split(" · ")[1] ?? "", n?.links).map((l, i) => <a key={i} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}</p>
      </section>

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

      {n?.paths && (() => { const p = n.paths; return (
        <>
          <p className="lab stripcap"><Glyph kind="ledger" />the receipts · what it sells for</p>
          <div className="strip">
            <div><div className="lab">{p.basis === "same-material asks" ? "sellers ask" : "sells for"}</div><div className="v">{p.band.lo === p.band.hi ? money(p.band.mid) : `${money(p.band.lo)} to ${money(p.band.hi)}`}</div><div className="l"><b>{p.basisNote}.</b>{p.basis === "same-material asks" ? " Asking prices, not sales." : ""}</div></div>
            {p.boutique && <div><div className="lab">new, from the boutique</div><div className="v">{money(p.boutique.price)}</div><div className="l"><b>The one fixed price{p.boutique.label ? `, ${p.boutique.label}` : ""}.</b></div></div>}
          </div>
        </>
      ); })()}

      <button type="button" className="why-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "hide the why" : "show me why"}</button>
      {open && (
        <div className="edit">



          {n && (() => { const t = n.tiers; const items: string[] = [];
            if (n.retail_now) items.push(`Boutique ${money(n.retail_now)}${n.retail_size ? ` (${n.retail_size})` : ""}`);
            if (t?.sourcer_sold) items.push(`Sold by secondhand sourcers ${t.sourcer_sold.ranges[0] ? t.sourcer_sold.ranges[0].replace(/\s*[–-]\s*/, " to ") : money(t.sourcer_sold.mean)} (${t.sourcer_sold.n})`);
            if (n.sell) items.push(`Sold on The RealReal ${money(n.sell.mean_sold ?? n.sell.median_sold)} on average (${n.sell.n}${n.sell.plain ? ", any leather" : ""})`);
            if (t?.sites_asks) items.push(`Asking online ${t.sites_asks.n > 1 ? `${money(t.sites_asks.lo)} to ${money(t.sites_asks.hi)}` : money(t.sites_asks.mean)} (${t.sites_asks.n})`);
            if (t?.private_quotes) items.push(`Your sourcer ${money(t.private_quotes.mean)}`);
            return items.length ? <p className="pricesline"><span className="lab">the prices</span> {items.join(" · ")}.{n.path ? ` The boutique price went from ${money(n.path.from_price)} to ${money(n.path.to_price)} (${fmtDate(n.path.from_date)} to ${fmtDate(n.path.to_date)}).` : ""}</p> : null; })()}
          <section className="glance">
            <p className="lab">if you read nothing else</p>
            <ol>{(result.takeaways && result.takeaways.length ? result.takeaways.filter((t) => !/cohort|generational adjustment|not stated|dossier|tracker/i.test(t)) : cards.slice(0, 3).map((c) => c.headline)).slice(0, 3).map((t, i) => <li key={i}><Rich text={t} link={askLink} /></li>)}</ol>
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
            const mood = !b ? "no gossip yet" : over ? "cooling off" : growth && growth.value > 15 ? "buzzing" : "quiet";
            const cultureCard = (
              <article className={`ecard culture ${!b ? "mixed" : over ? "weak" : growth && growth.value > 15 ? "strong" : "mixed"}`}>
                <header><h4><Glyph kind="chat" />The group chat</h4><span className="stamp">{mood}</span></header>
                <p className="from"><b>{SECTION_SOURCES.culture.about}</b> From {SECTION_SOURCES.culture.from.replace(/^./, (x) => x.toLowerCase())}</p>
                <p className="h"><b>{b ? (over ? `The chat says ${bagShort} might be having its moment, then moving on.` : growth && growth.value > 15 ? `Searches for “${growth.term}” up ${Math.round(growth.value)}% this week, against the month before.` : `Quiet week in the chat for ${house}.`) : `The chat hasn't found ${house} yet.`}</b></p>
                {cult && <p className="so">{plain(cult.soWhat ?? cult.headline)}</p>}
                {b && (
                  <details>
                    <summary><Glyph kind="chat" />read the chat</summary>
                    <dl className="bz-lines">
                      <div><dt>Is it over?</dt><dd>{over ? pick(over.note, /deinfluenc|moved on|had its moment|backlash|over\b/i) : trendsForHouse.length ? `Not that we can see. ${pick(trendsForHouse[0].note, new RegExp(house.split(" ")[0], "i"))}` : `No one is calling ${house} over this week.`}</dd></div>
                      <div><dt>Who&apos;s carrying it</dt><dd>{carrying && new RegExp(house.split(" ")[0], "i").test(carrying.note) ? `${pick(carrying.note, new RegExp(house.split(" ")[0], "i"), 160)} One feed, not a survey.` : "We don't track who is carrying this bag yet."}</dd></div>
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
            const f = n?.forward; const tr = n?.trend;
            const LEANW: Record<string, string> = { rising: "rising", cooling: "cooling", mixed: "mixed", steady: "flat" };
            const headingCard = f && f.signals.length > 0 ? (
              <article className={`ecard ${f.lean === "rising" ? "strong" : f.lean === "cooling" ? "weak" : "mixed"}`}>
                <header><h4><Glyph kind="anchor" />Where it&apos;s heading</h4><span className="stamp">{LEANW[f.lean]}</span></header>
                <p className="from"><b>Which way this bag&apos;s numbers are moving.</b> From five years of weekly Google searches, the boutique price history, resale asking-price snapshots, and auction results from Bonhams and Artcurial.</p>
                <p className="h"><b>{f.lean === "rising" ? "Trends point up" : f.lean === "cooling" ? "Trends point down" : f.lean === "mixed" ? "Trends pull both ways" : "Trends are flat"}{f.confidence === "low" ? ", an early read" : ""}.</b></p>
                {f.nextBoutique && <p className="so">On its current pace the boutique price reaches about {money(f.nextBoutique.price)} by {f.nextBoutique.date}.</p>}
                <details>
                  <summary><Glyph kind="proof" />the trend lines</summary>
                  <ul>
                    {f.signals.map((s) => <li key={s.name}><b>{s.name} {s.dir}.</b> {s.evidence}.</li>)}
                    {tr?.years && tr.years.length > 1 && <li><b>Searches by year.</b> {tr.years.map((y) => `${y.year}: ${y.avg}`).join(" · ")} (US Google, each bag scaled to its own peak of 100).</li>}
                    {tr?.auction && <li><b>Searches and auction prices.</b> {tr.auction}</li>}
                    {tr?.resale && <li><b>Searches and resale.</b> {tr.resale}</li>}
                    {tr?.moments?.map((m) => <li key={m.date + m.type}><b>Moment, {fmtDate(m.date)}.</b> {m.what} {m.changePct == null ? "" : `Searches ${m.changePct >= 0 ? "up" : "down"} ${Math.abs(m.changePct)}% in the eight weeks after.`}</li>)}
                    {f.bands && <li><b>Resale on current trends.</b> {f.bands.map((b) => `${b.y} year${b.y === 1 ? "" : "s"}: ${money(b.lo)} to ${money(b.hi)}`).join(" · ")}{n?.sell?.plain ? ", any leather" : ""}.</li>}
                  </ul>
                  <p className="bz-read">A forecast from today&apos;s trends, not a promise. Confidence rises when three or more signals agree.</p>
                </details>
              </article>
            ) : null;
            return (
              <div className="ecards">
                {headingCard}
                {cultureCard}
                {cards.filter((c) => c.key !== "buy" && c.key !== "culture").map((c) => {
              const [proof, ...more] = c.evidence;
              return (
                <article key={c.key} className={`ecard ${c.mood}`}>
                  <header><h4>{c.title}</h4><span className="stamp">{c.mood === "strong" ? "good sign" : c.mood === "weak" ? "weak spot" : "mixed"}</span></header>
                  {c.about && <p className="from"><b>{c.about}</b> From {c.from?.replace(/^./, (x) => x.toLowerCase())}{c.evidence.length ? ` Cited in this answer: ${[...new Set(c.evidence.map((e) => e.source).filter(Boolean))].slice(0, 5).join(", ")}.` : ""}</p>}
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
