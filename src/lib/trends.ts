/**
 * Trends and connective tissue (Katie's daily rule, 2026-10-23): every day, line up what people say and search
 * (culture) against what buyers are willing to pay (asks, saves, auction estimates) and what actually sells
 * (sold prices, hammer prices), per bag, and say how strong each link is and how many readings back it.
 *
 * Honesty rules built in:
 * - A relationship is reported only with enough paired readings (MIN_PAIRS); below that it says "collecting".
 * - Correlation is never called cause. Every line carries n, the date span and the source.
 * - The scenario is arithmetic on today's ratio and the boutique price path, labelled "not a forecast; no backtest".
 *
 * Read-only on both databases. Runs inside Next and standalone (`node scripts/daily-trends.ts`).
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const LAB = "/Users/katiegraves/Desktop/Fashion Data Lab/db";
const MIN_PAIRS = 8;

type Row = Record<string, string | number | null>;

function openDb(envPath: string | undefined, desktop: string, bundled: string): DatabaseSync | null {
  const p = envPath ?? (fs.existsSync(desktop) ? desktop : bundled);
  try { return fs.existsSync(p) ? new DatabaseSync(p, { readOnly: true }) : null; } catch { return null; }
}
const trackerDb = () => openDb(process.env.TRACKER_DB_PATH, `${LAB}/luxury_bags.db`, path.join(process.cwd(), "data", "tracker.db"));
const trendsDb = () => openDb(process.env.TRENDS_DB_PATH, `${LAB}/trends.db`, path.join(process.cwd(), "data", "trends.db"));

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
function median(a: number[]): number { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function quantile(a: number[], q: number): number { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
function ranks(a: number[]): number[] {
  const idx = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]); const r = new Array(a.length).fill(0);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
  return r;
}
/** Spearman rank correlation, ties averaged. */
export function spearman(x: number[], y: number[]): number {
  const rx = ranks(x), ry = ranks(y); const mx = mean(rx), my = mean(ry);
  let n = 0, dx = 0, dy = 0; for (let i = 0; i < rx.length; i++) { n += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? n / Math.sqrt(dx * dy) : 0;
}
/** Share of label shuffles that give a correlation at least this strong: a plain-language "could this be chance". */
function permutationP(x: number[], y: number[], rho: number, runs = 2000): number {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let hits = 0; const yy = [...y];
  for (let r = 0; r < runs; r++) { for (let i = yy.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [yy[i], yy[j]] = [yy[j], yy[i]]; } if (Math.abs(spearman(x, yy)) >= Math.abs(rho)) hits++; }
  return hits / runs;
}
const strength = (rho: number) => { const a = Math.abs(rho); return a < 0.2 ? "no clear link" : a < 0.4 ? "a weak link" : a < 0.6 ? "a moderate link" : "a strong link"; };
const pct = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v)}%`;

// ---------- data flow ----------
export type FlowRow = { feed: string; last: string | null; days30: number; rows7: number; status: "daily" | "regular" | "irregular" | "stale" | "empty" };
export function dataFlow(today = new Date()): FlowRow[] {
  const db = trackerDb(); const tdb = trendsDb(); const out: FlowRow[] = [];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const d30 = iso(new Date(today.getTime() - 30 * 864e5)), d7 = iso(new Date(today.getTime() - 7 * 864e5)), d3 = iso(new Date(today.getTime() - 3 * 864e5));
  const feeds: [DatabaseSync | null, string, string, string][] = [
    [db, "The RealReal tiles (asks, saves, sold)", "trr_item_reads", "read_date"],
    [db, "Dealer listings (asks)", "resale_listings", "substr(last_seen,1,10)"],
    [db, "Resale ask snapshots", "resale_aggregates", "snapshot_date"],
    [db, "FWRD Renew shelf (asks)", "fwrd_renew_reads", "read_date"],
    [db, "Search and social reads", "buzz_reads", "read_date"],
    [db, "Buzz events", "buzz_events", "substr(retrieved_at,1,10)"],
    [db, "Auction lots", "auction_results", "substr(retrieved_at,1,10)"],
    [db, "Boutique prices", "retail_reference", "substr(retrieved_at,1,10)"],
    [db, "WGSN signals", "wgsn_signals", "substr(retrieved_at,1,10)"],
    [tdb, "Google search history (weekly)", "search_interest", "collected_date"],
  ];
  for (const [d, feed, table, col] of feeds) {
    if (!d) { out.push({ feed, last: null, days30: 0, rows7: 0, status: "empty" }); continue; }
    try {
      const r = d.prepare(`select max(${col}) last, count(distinct case when ${col} >= ? then ${col} end) days30, sum(case when ${col} >= ? then 1 else 0 end) rows7 from ${table}`).get(d30, d7) as Row;
      const last = (r.last as string) ?? null; const days30 = Number(r.days30 ?? 0);
      const status = !last ? "empty" : last < d3 ? "stale" : days30 >= 20 ? "daily" : days30 >= 4 ? "regular" : "irregular";
      out.push({ feed, last, days30, rows7: Number(r.rows7 ?? 0), status });
    } catch { out.push({ feed, last: null, days30: 0, rows7: 0, status: "empty" }); }
  }
  db?.close(); tdb?.close();
  return out;
}

// ---------- culture: search history ----------
export function searchTerms(): string[] {
  const t = trendsDb(); if (!t) return [];
  try { return (t.prepare("select distinct term from search_interest order by term").all() as Row[]).map((r) => String(r.term)); } catch { return []; } finally { t.close(); }
}
/** Model words used everywhere: letters first ("Lady Dior" → lady); a name that is only a number ("Chanel 25") keeps the number. */
function modelWords(model: string): string[] {
  const toks = norm(model).split(" ").filter((w) => w && !["bag", "bags", "the"].includes(w));
  const alpha = toks.filter((w) => w.length > 2 && !/^\d+$/.test(w));
  return alpha.length ? alpha : toks.filter((w) => /^\d+$/.test(w));
}
/** The search term for a bag: it must contain the house's first word and every model word. */
export function termFor(house: string, model: string): string | null {
  const h = norm(house).split(" ")[0]; const words = modelWords(model);
  if (!words.length) return null;
  const hits = searchTerms().filter((t) => { const n = norm(t); return n.includes(h) && words.every((w) => n.includes(w)); });
  return hits.sort((a, b) => a.length - b.length)[0] ?? null;
}
export type Week = { week: string; v: number };
export function searchSeries(term: string): Week[] {
  const t = trendsDb(); if (!t) return [];
  try { return (t.prepare("select week, interest from search_interest where term=? order by week").all(term) as Row[]).map((r) => ({ week: String(r.week), v: Number(r.interest) })); } catch { return []; } finally { t.close(); }
}
export type SearchRead = { term: string; weeks: number; from: string; to: string; recent13: number; yearAgo13: number; yoyPct: number | null; vsFiveYearPct: number | null; byYear: { year: string; avg: number }[] };
export function searchRead(term: string): SearchRead | null {
  const s = searchSeries(term); if (s.length < 60) return null;
  const last13 = s.slice(-13).map((w) => w.v), yearAgo = s.slice(-65, -52).map((w) => w.v), all = s.map((w) => w.v);
  const r13 = mean(last13), y13 = mean(yearAgo), m5 = mean(all);
  const years = new Map<string, number[]>(); for (const w of s) { const y = w.week.slice(0, 4); years.set(y, [...(years.get(y) ?? []), w.v]); }
  return {
    term, weeks: s.length, from: s[0].week, to: s[s.length - 1].week, recent13: Math.round(r13), yearAgo13: Math.round(y13),
    yoyPct: y13 > 0 ? ((r13 - y13) / y13) * 100 : null, vsFiveYearPct: m5 > 0 ? ((r13 - m5) / m5) * 100 : null,
    byYear: [...years].map(([year, v]) => ({ year, avg: Math.round(mean(v)) })),
  };
}
/** How hot searches were in the 8 weeks before a date, against the 52 weeks before that (1 = normal). */
function heatBefore(s: Week[], date: string): number | null {
  const i = s.findIndex((w) => w.week > date); const end = i === -1 ? s.length : i;
  if (end < 60) return null;
  const recent = mean(s.slice(end - 8, end).map((w) => w.v)), base = mean(s.slice(end - 60, end - 8).map((w) => w.v));
  return base > 0 ? recent / base : null;
}

// ---------- connective tissue ----------
export type Link = {
  label: string;           // what is being compared
  culture: string;         // the culture signal
  money: string;           // the WTP or sales signal
  n: number; need: number; // paired readings and the minimum to report
  rho: number | null; p: number | null; read: string;  // plain-language result
  span: string; source: string;
};

/** Auction lots of this bag: does hotter US search before the sale go with a higher price against estimate, or more lots sold? */
export function auctionLink(house: string, model: string): Link | null {
  const term = termFor(house, model); const db = trackerDb(); if (!db) return null;
  const words = modelWords(model); if (!words.length) { db.close(); return null; }
  let lots: Row[] = [];
  try {
    lots = db.prepare(`select sale_date, hammer_price, estimate_low, estimate_high, sold, auction_house from auction_results
      where lower(house) like ? ${words.map(() => "and lower(coalesce(model_guess,'')) like ?").join(" ")} and estimate_low > 0 and estimate_high > 0 and sale_date is not null`)
      .all(`%${norm(house).split(" ")[0].slice(0, 4)}%`, ...words.map((w) => `%${w}%`)) as Row[];
  } catch { lots = []; } finally { db.close(); }
  if (!lots.length) return null;
  const base: Omit<Link, "n" | "rho" | "p" | "read"> = {
    label: `${house} ${model}: search heat before an auction vs price against estimate`, culture: term ? `US Google searches for “${term}”, 8 weeks before the sale against the year before` : "no search history for this bag yet",
    money: "hammer price ÷ middle of the estimate (sold lots), currency-neutral", need: MIN_PAIRS,
    span: `${lots.map((l) => String(l.sale_date)).sort()[0]} to ${lots.map((l) => String(l.sale_date)).sort().slice(-1)[0]}`,
    source: `${[...new Set(lots.map((l) => String(l.auction_house)))].join(", ")} results; Google Trends`,
  };
  if (!term) return { ...base, n: 0, rho: null, p: null, read: "Collecting: no search history for this bag yet." };
  const s = searchSeries(term);
  const pairs = lots.filter((l) => Number(l.sold) === 1 && l.hammer_price != null).map((l) => ({ heat: heatBefore(s, String(l.sale_date)), ratio: Number(l.hammer_price) / ((Number(l.estimate_low) + Number(l.estimate_high)) / 2) })).filter((p) => p.heat != null) as { heat: number; ratio: number }[];
  const unsold = lots.filter((l) => Number(l.sold) !== 1).map((l) => heatBefore(s, String(l.sale_date))).filter((h) => h != null) as number[];
  if (pairs.length < MIN_PAIRS) return { ...base, n: pairs.length, rho: null, p: null, read: `Collecting: ${pairs.length} sold lots with search history; ${MIN_PAIRS} needed before we call a link.` };
  const rho = spearman(pairs.map((p) => p.heat), pairs.map((p) => p.ratio)); const p = permutationP(pairs.map((x) => x.heat), pairs.map((x) => x.ratio), rho);
  const hot = pairs.filter((x) => x.heat > 1).map((x) => x.ratio), cool = pairs.filter((x) => x.heat <= 1).map((x) => x.ratio);
  const split = hot.length >= 3 && cool.length >= 3 ? ` Lots sold after above-normal searching made ${Math.round(median(hot) * 100)}% of mid-estimate (${hot.length} lots); after normal or quiet searching, ${Math.round(median(cool) * 100)}% (${cool.length} lots).` : "";
  const unsoldNote = unsold.length ? ` ${unsold.length} lots went unsold; their median search heat was ${median(unsold).toFixed(2)}× normal.` : "";
  return { ...base, n: pairs.length, rho, p, read: `${strength(rho)[0].toUpperCase()}${strength(rho).slice(1)} (rank correlation ${rho.toFixed(2)}, ${pairs.length} sold lots; a shuffle test matches it ${Math.round(p * 100)}% of the time, so ${p < 0.05 ? "unlikely to be chance" : "it could be chance"}).${split}${unsoldNote} Correlation, not cause.` };
}

/** The RealReal reads of this bag: as searches move week to week, do saves (intent), sold share and sold price move with them? */
export function resaleLink(house: string, model: string): Link | null {
  const term = termFor(house, model); const db = trackerDb(); if (!db) return null;
  const words = modelWords(model); if (!words.length) { db.close(); return null; }
  let reads: Row[] = [];
  try {
    reads = db.prepare(`select read_date, count(*) tiles, sum(sold) sold, avg(case when sold=1 then pct_of_retail end) sold_pct,
        avg(cast(nullif(rtrim(substr(substr(title, instr(title,'saves=')+6), 1, 6), ';] abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,'),'') as real)) saves
      from trr_item_reads where lower(house) like ? ${words.map(() => "and lower(coalesce(model_guess,'')) like ?").join(" ")} group by read_date having tiles >= 10 order by read_date`)
      .all(`%${norm(house).split(" ")[0].slice(0, 4)}%`, ...words.map((w) => `%${w}%`)) as Row[];
  } catch { reads = []; } finally { db.close(); }
  const span = reads.length ? `${reads[0].read_date} to ${reads[reads.length - 1].read_date}` : "none";
  const base = { label: `${house} ${model}: searches vs The RealReal saves, sold share and sold price`, culture: term ? `US Google searches for “${term}” in the week of each read` : "no search history for this bag yet", money: "saves per tile (willingness to pay), share of tiles sold, sold price as % of estimated retail", need: MIN_PAIRS, span, source: "The RealReal reads; Google Trends" };
  if (reads.length < MIN_PAIRS || !term) return { ...base, n: reads.length, rho: null, p: null, read: `Collecting: ${reads.length} dated reads of this bag (${span}); ${MIN_PAIRS} needed before we call a link. Each daily scan adds one.` };
  const s = searchSeries(term); const at = (d: string) => { const w = [...s].reverse().find((x) => x.week <= d); return w ? w.v : null; };
  const pts = reads.map((r) => ({ q: at(String(r.read_date)), saves: Number(r.saves) })).filter((x) => x.q != null && Number.isFinite(x.saves)) as { q: number; saves: number }[];
  if (pts.length < MIN_PAIRS) return { ...base, n: pts.length, rho: null, p: null, read: `Collecting: ${pts.length} reads line up with search weeks; ${MIN_PAIRS} needed.` };
  const rho = spearman(pts.map((x) => x.q), pts.map((x) => x.saves)); const p = permutationP(pts.map((x) => x.q), pts.map((x) => x.saves), rho);
  return { ...base, n: pts.length, rho, p, read: `Searches and saves: ${strength(rho)} (rank correlation ${rho.toFixed(2)}, ${pts.length} reads, ${p < 0.05 ? "unlikely to be chance" : "could be chance"}). Correlation, not cause.` };
}

/** Boutique price path next to search interest, year by year: shown side by side, never correlated (too few years). */
export function retailVsSearch(house: string, model: string): string | null {
  const term = termFor(house, model); const db = trackerDb(); if (!db || !term) { db?.close(); return null; }
  const words = modelWords(model); if (!words.length) { db.close(); return null; }
  let rows: Row[] = [];
  try {
    rows = db.prepare(`select substr(effective_date,1,4) y, max(price) price, size_or_spec from retail_reference where lower(house) like ? ${words.map(() => "and lower(model) like ?").join(" ")} and region='US' and is_reference_size=1 group by y order by y`)
      .all(`%${norm(house).split(" ")[0].slice(0, 4)}%`, ...words.map((w) => `%${w}%`)) as Row[];
  } catch { rows = []; } finally { db.close(); }
  const sr = searchRead(term); if (!sr || rows.length < 2) return null;
  const sy = new Map(sr.byYear.map((b) => [b.year, b.avg]));
  return `Boutique price and search interest by year (${rows[rows.length - 1].size_or_spec ?? "reference size"}): ${rows.map((r) => `${r.y} $${Number(r.price).toLocaleString()}${sy.has(String(r.y)) ? `, searches ${sy.get(String(r.y))}/100` : ""}`).join(" · ")}. Too few years to measure a link; shown side by side.`;
}

// ---------- scenario ----------
export type Scenario = { retailNow: number; cagrPct: number; years: number; ratioMid: number; ratioLo: number; ratioHi: number; n: number; at: { y: number; lo: number; mid: number; hi: number }[] } | null;
/** Arithmetic, not a forecast: today's sold-to-boutique ratio (middle half of sold listings) applied to the boutique price grown at its own past rate. */
export function scenario(retailPath: { y: string; price: number }[], soldPrices: number[], retailNow: number): Scenario {
  if (retailPath.length < 3 || soldPrices.length < 8 || !retailNow) return null;
  const first = retailPath[0], last = retailPath[retailPath.length - 1]; const yrs = Number(last.y) - Number(first.y); if (yrs < 2) return null;
  const g = Math.pow(last.price / first.price, 1 / yrs) - 1;
  const ratios = soldPrices.map((p) => p / retailNow);
  const lo = quantile(ratios, 0.25), mid = median(ratios), hi = quantile(ratios, 0.75);
  return { retailNow, cagrPct: g * 100, years: yrs, ratioLo: lo, ratioMid: mid, ratioHi: hi, n: soldPrices.length,
    at: [1, 5, 10].map((y) => { const r = retailNow * Math.pow(1 + g, y); return { y, lo: Math.round(r * lo), mid: Math.round(r * mid), hi: Math.round(r * hi) }; }) };
}

// ---------- the dossier block ----------
/** Lines for the answer's evidence dossier. Every line says its n and whether it is a link or still collecting. */
export function connectiveLines(house: string, model: string): string[] {
  const out: string[] = [];
  const term = termFor(house, model);
  if (term) {
    const sr = searchRead(term);
    if (sr) out.push(`Search trend (Google Trends, US, weekly, ${sr.from} to ${sr.to}, each term scaled to its own five-year peak = 100): “${term}” averaged ${sr.recent13}/100 over the last 13 weeks, ${sr.yoyPct == null ? "no year-ago base" : `${pct(sr.yoyPct)} on the same weeks a year ago`}, ${sr.vsFiveYearPct == null ? "" : `${pct(sr.vsFiveYearPct)} against its five-year average`}. Year averages: ${sr.byYear.map((b) => `${b.year} ${b.avg}`).join(", ")}.`);
  } else out.push("Search trend: no weekly search history for this bag yet.");
  for (const l of [auctionLink(house, model), resaleLink(house, model)]) if (l) out.push(`${l.label}. Culture: ${l.culture}. Money: ${l.money}. ${l.read} Span ${l.span}. Source: ${l.source}.`);
  const rv = retailVsSearch(house, model); if (rv) out.push(rv);
  return out;
}

/** One bag's full read, for the /trends page and the daily report. */
export function bagTrend(house: string, model: string) {
  const term = termFor(house, model);
  return { house, model, term, search: term ? searchRead(term) : null, auction: auctionLink(house, model), resale: resaleLink(house, model) };
}

/** The bags the daily report and /trends page cover: every bag with a weekly search history. */
export const TRACKED: [string, string][] = [
  ["Hermès", "Birkin"], ["Hermès", "Kelly"], ["Hermès", "Constance"], ["Hermès", "Picotin"], ["Hermès", "Evelyne"],
  ["Chanel", "Classic Flap"], ["Chanel", "25"], ["Dior", "Lady Dior"], ["Dior", "Saddle"], ["Dior", "Book Tote"], ["Fendi", "Baguette"],
  ["Gucci", "Jackie"], ["Loewe", "Puzzle"], ["Prada", "Galleria"], ["Celine", "Triomphe"], ["Balenciaga", "City"],
  ["Bottega Veneta", "Jodie"], ["Louis Vuitton", "Speedy"], ["Louis Vuitton", "Neverfull"], ["Miu Miu", "Wander"], ["The Row", "Margaux"], ["Goyard", "Saint Louis"],
];
