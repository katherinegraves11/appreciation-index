/**
 * Tracker bridge: reads Katie's Fashion Data Lab SQLite database (read-only) and builds a
 * sourced evidence dossier for one bag BEFORE the model touches the web.
 *
 * Local dev: TRACKER_DB_PATH (defaults to the Desktop Fashion Data Lab).
 * Production: set TRACKER_DB_PATH to a copy of the .db shipped with the deploy, or leave unset
 * to skip (the analyst then researches from the web only and says so).
 */
import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";

const DESKTOP_DB = "/Users/katiegraves/Desktop/Fashion Data Lab/db/luxury_bags.db";
const BUNDLED_DB = path.join(process.cwd(), "data", "tracker.db");
const DEFAULT_DB = fs.existsSync(DESKTOP_DB) ? DESKTOP_DB : BUNDLED_DB;

type Row = Record<string, string | number | null>;

function open(): DatabaseSync | null {
  const p = process.env.TRACKER_DB_PATH ?? DEFAULT_DB;
  try {
    return new DatabaseSync(p, { readOnly: true });
  } catch {
    return null;
  }
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// House aliases so "Dior" finds "Christian Dior" rows and vice versa.
function houseTerms(house: string): string[] {
  const h = norm(house);
  const alias: Record<string, string[]> = {
    dior: ["dior", "christian dior"],
    "christian dior": ["dior", "christian dior"],
    ysl: ["saint laurent", "ysl"],
    "saint laurent": ["saint laurent", "ysl"],
    lv: ["louis vuitton", "lv"],
    "louis vuitton": ["louis vuitton", "lv"],
    hermes: ["hermès", "hermes"],
    "herm s": ["hermès", "hermes"],
    "bottega veneta": ["bottega veneta", "bv"],
  };
  return alias[h] ?? [h];
}

function likeAny(col: string, terms: string[]) {
  return "(" + terms.map(() => `lower(${col}) like ?`).join(" or ") + ")";
}
function likeParams(terms: string[]) {
  return terms.map((t) => `%${t}%`);
}

function section(title: string, lines: string[]): string {
  if (!lines.length) return `### ${title}\n(no rows in tracker)\n`;
  return `### ${title}\n${lines.map((l) => `- ${l}`).join("\n")}\n`;
}

export type TrackerDossier = { text: string; rowCount: number; available: boolean };

export function buildTrackerDossier(house: string, bag: string, spec?: string): TrackerDossier {
  const db = open();
  if (!db) return { text: "", rowCount: 0, available: false };

  const hTerms = houseTerms(house);
  const bagWords = norm(bag)
    .split(" ")
    .filter((w) => w.length > 2 && !/^\d+$/.test(w));
  const bagTerm = bagWords[0] ?? norm(bag);
  let n = 0;
  const out: string[] = [];

  const q = <T extends Row>(sql: string, params: (string | number)[] = []): T[] => {
    try {
      const rows = db.prepare(sql).all(...params) as T[];
      n += rows.length;
      return rows;
    } catch {
      return [];
    }
  };

  // 1. Bag identity + 10-year price paths
  const bags = q<Row>(
    `select b.*, group_concat(r.metric || '=' || r.value || ' (' || r.period || '; ' || r.source || ')', ' | ') as signals
     from bags b left join resale_signals r on r.bag_id=b.bag_id
     where ${likeAny("b.house", hTerms)} and lower(b.model) like ?
     group by b.bag_id limit 5`,
    [...likeParams(hTerms), `%${bagTerm}%`],
  );
  out.push(
    section(
      "Bag identity (tracker)",
      bags.map(
        (b) =>
          `${b.house} ${b.model}: launch ${b.launch_year ?? "?"}, archive code ${b.archive_code ? "yes" : "no/unknown"}, designer at launch ${b.current_cd_at_launch ?? "?"}, season ${b.collection_season ?? "n/a"}, look ${b.runway_look ?? "n/a"}. Notes: ${b.notes ?? ""}. Price signals: ${b.signals ?? "none"}`,
      ),
    ),
  );

  // 2. Resale asking-price aggregates (Chrome reads) + collector medians per source
  const aggs = q<Row>(
    `select source, model, snapshot_date, n_listings, median_ask, median_retention_pct from resale_aggregates
     where ${likeAny("house", hTerms)} and lower(model) like ? order by snapshot_date desc limit 12`,
    [...likeParams(hTerms), `%${bagTerm}%`],
  );
  const listingStats = q<Row>(
    `select source, model_guess, count(*) as n, round(avg(price)) as mean_ask,
            round(min(price)) as min_ask, round(max(price)) as max_ask, max(last_seen) as as_of
     from v_bag_listings where price is not null and ${likeAny("brand", hTerms)} and lower(model_guess) like ?
     group by source, model_guess having n >= 3 order by n desc limit 12`,
    [...likeParams(hTerms), `%${bagTerm}%`],
  );
  out.push(
    section("Resale asking prices (tracker)", [
      ...aggs.map(
        (a) =>
          `${a.source} · ${a.model} · ${a.snapshot_date}: n=${a.n_listings}, median ask $${a.median_ask}${a.median_retention_pct != null ? `, median retention ${a.median_retention_pct}% of est. retail` : ""}`,
      ),
      ...listingStats.map(
        (l) =>
          `${l.source} · ${l.model_guess} (as of ${l.as_of}): n=${l.n}, mean ask $${l.mean_ask}, range $${l.min_ask}–$${l.max_ask}`,
      ),
    ]),
  );

  // 2b. RETAIL vs RESALE — Katie: "comparing retail prices originally to what they sell for second hand is INTEGRAL"
  const retailNow = q<Row>(
    `select house, model, size_or_spec, retail_now, effective_date, source_url from v_retail_current
     where ${likeAny("house", hTerms)} and lower(model) like ? limit 3`,
    [...likeParams(hTerms), `%${bagTerm}%`],
  );
  const retailHist = q<Row>(
    `select year, retail_that_year, price_type, source_url from v_retail_history
     where ${likeAny("house", hTerms)} and lower(model) like ? order by year limit 10`,
    [...likeParams(hTerms), `%${bagTerm}%`],
  );
  const retention = q<Row>(
    `select source, snapshot_date, n_listings, median_ask, retail_now, retention_vs_current_retail_pct, reference_size
     from v_retail_vs_resale_asks where ${likeAny("house", hTerms)} and lower(model) like ?
     order by snapshot_date desc, n_listings desc limit 10`,
    [...likeParams(hTerms), `%${bagTerm}%`],
  );
  const sold = q<Row>(
    `select read_date, era_guess, condition, sold_or_ask, sold, trr_est_retail, pct_of_trr_est_retail, retail_now, pct_of_current_retail
     from v_retail_vs_resale_sold where ${likeAny("house", hTerms)} and lower(model) like ? order by read_date desc limit 12`,
    [...likeParams(hTerms), `%${bagTerm}%`],
  );
  const histLine = retailHist.length
    ? `Retail price path (US, reference size): ${retailHist.map((h) => `${h.year} $${h.retail_that_year}${h.price_type === "launch" ? " (launch)" : ""}`).join(" → ")}`
    : "";
  out.push(
    section("RETAIL vs RESALE (tracker; lead the brief with this)", [
      ...retailNow.map((r) => `Current US retail, ${r.size_or_spec}: $${r.retail_now} as of ${r.effective_date} (${r.source_url})`),
      ...(histLine ? [histLine] : []),
      ...retention.map(
        (r) =>
          `${r.source} · ${r.snapshot_date}: n=${r.n_listings}, median ask $${r.median_ask}${r.retail_now ? ` = ${r.retention_vs_current_retail_pct}% of current retail ($${r.retail_now}, ${r.reference_size})` : " (no retail reference yet)"}`,
      ),
      ...sold.map(
        (r) =>
          `RealReal read ${r.read_date}: ${r.era_guess ?? ""} ${r.condition ?? ""} ${r.sold ? "SOLD" : "asking"} $${r.sold_or_ask}${r.trr_est_retail ? ` = ${r.pct_of_trr_est_retail}% of TRR est. retail $${r.trr_est_retail}` : ""}${r.retail_now ? `; ${r.pct_of_current_retail}% of current retail` : ""}`,
      ),
    ]),
  );

  // 2c. FAMILY MATCHES — when the question is about an era, material, finish or collection (pony hair, cheetah,
  // Métiers d'Art, Blazy-era, Philo-era), match listing titles word by word so the dossier is not empty.
  const famWords = norm(`${bag} ${spec ?? ""}`).split(" ").filter((w) => w.length > 3 && !["bags", "bag", "pieces", "piece", "with", "from", "that", "this", "2026", "2025"].includes(w));
  if (famWords.length) {
    const where = famWords.map(() => "lower(title) like ?").join(" or ");
    const fp = famWords.map((w) => `%${w}%`);
    const trrFam = q<Row>(
      `select model_guess, count(*) n, sum(sold) sold, round(avg(price)) avg_ask, min(price) lo, max(price) hi, max(read_date) last_read
       from trr_item_reads where ${likeAny("house", hTerms)} and (${where}) group by model_guess having n >= 2 order by n desc limit 12`,
      [...likeParams(hTerms), ...fp],
    );
    const soldFam = q<Row>(
      `select title, price, read_date from trr_item_reads where ${likeAny("house", hTerms)} and sold=1 and (${where}) order by price desc limit 15`,
      [...likeParams(hTerms), ...fp],
    );
    const listFam = q<Row>(
      `select source, model_guess, count(*) n, round(avg(price)) avg_ask, min(price) lo, max(price) hi from v_bag_listings
       where ${likeAny("brand", hTerms)} and (${where}) group by source, model_guess having n >= 2 order by n desc limit 12`,
      [...likeParams(hTerms), ...fp],
    );
    out.push(
      section(`Family matches (tracker; titles containing: ${famWords.join(", ")})`, [
        ...trrFam.map((r) => `RealReal · ${r.model_guess}: ${r.n} tiles, ${r.sold} SOLD, avg ask $${r.avg_ask} (range $${r.lo}–$${r.hi}), last read ${r.last_read}`),
        ...soldFam.map((r) => `SOLD on RealReal ${r.read_date}: ${String(r.title).slice(0, 90)} — $${r.price}`),
        ...listFam.map((r) => `${r.source} · ${r.model_guess}: ${r.n} asks, avg $${r.avg_ask} (range $${r.lo}–$${r.hi})`),
      ]),
    );
  }

  // 3. Momentum (search, saved searches, supply, rankings)
  const mom = q<Row>(
    `select term, source, metric, value, period_start, period_end from momentum
     where lower(term) like ? or lower(term) like ? order by retrieved_at desc limit 20`,
    [`%${hTerms[0]}%`, `%${bagTerm}%`],
  );
  out.push(section("Momentum (tracker)", mom.map((m) => `${m.term} · ${m.metric}=${m.value} (${m.period_start}→${m.period_end}; ${m.source})`)));

  // 4. Creative directors + executive moves
  const cds = q<Row>(
    `select house, name, start_date, end_date, predecessor, debut_season, debut_reception_notes from creative_directors
     where ${likeAny("house", hTerms)} order by start_date desc limit 6`,
    likeParams(hTerms),
  );
  const moves = q<Row>(
    `select tracker_month, headline, effective from people_moves where ${likeAny("headline", hTerms)} order by id limit 8`,
    likeParams(hTerms),
  );
  out.push(
    section("Creative direction & leadership (tracker)", [
      ...cds.map((c) => `${c.house}: ${c.name} from ${c.start_date}${c.end_date ? ` to ${c.end_date}` : ""} (after ${c.predecessor ?? "?"}); debut ${c.debut_season ?? "?"}. ${c.debut_reception_notes ?? ""}`),
      ...moves.map((m) => `${m.tracker_month}: ${m.headline} (effective ${m.effective}) — Vogue Business People Moves Tracker`),
    ]),
  );

  // 5. Supply chain, ownership, pricing
  const sc = q<Row>(
    `select fact_date, category, description, implication_for_value, source_name, source_url, confidence from supply_chain_facts
     where ${likeAny("house", hTerms)} or lower(parent_group) like ? order by fact_date desc limit 14`,
    [...likeParams(hTerms), `%${hTerms[0]}%`],
  );
  out.push(section("Supply chain, ownership & pricing (tracker)", sc.map((f) => `[${f.fact_date}; ${f.category}; confidence ${f.confidence}] ${f.description} → ${f.implication_for_value ?? ""} (${f.source_name}, ${f.source_url})`)));

  // 6. History & reputation
  const hist = q<Row>(
    `select event_date, category, description, market_effect_notes, still_matters, source_url from history_events
     where ${likeAny("house", hTerms)} or lower(designer) like ? or house like '%cross-house%' order by event_date desc limit 8`,
    [...likeParams(hTerms), `%${hTerms[0]}%`],
  );
  const macro = q<Row>(
    `select date, category, description, houses_affected, source_url from macro_events
     where ${likeAny("houses_affected", hTerms)} order by date desc limit 6`,
    likeParams(hTerms),
  );
  out.push(
    section("History, reputation & events (tracker)", [
      ...hist.map((h) => `[${h.event_date}; ${h.category}; still matters: ${h.still_matters}] ${h.description} Market: ${h.market_effect_notes ?? ""} (${h.source_url})`),
      ...macro.map((m) => `[${m.date}; ${m.category}] ${m.description} (${m.source_url})`),
    ]),
  );

  // 7. WGSN forecasts (forward-looking; cite as forecast)
  const wgsn = q<Row>(
    `select report_title, published, signal, derived_note, relevance_bucket, underlying_source from wgsn_signals
     order by published desc limit 14`,
  );
  out.push(section("WGSN forecasts (tracker; forward-looking, cite as 'WGSN, <report>, <date>')", wgsn.map((w) => `${w.report_title} (${w.published}) — ${w.signal}: ${w.derived_note} [buckets: ${w.relevance_bucket}; WGSN cites ${w.underlying_source}]`)));

  db.close();
  const text = `## TRACKER EVIDENCE (Katie's Fashion Data Lab — verified, sourced rows; treat as primary evidence)\n\n${out.join("\n")}`;
  return { text, rowCount: n, available: true };
}


/** What is moving on resale right now: a compact cheat sheet the question parser uses to resolve vague phrasing. */
export function hotList(): string {
  const db = open();
  if (!db) return "(tracker unavailable)";
  try {
    const rows = db.prepare(`
      select house, model_guess, era_guess, count(*) n, sum(sold) sold,
             round(avg(cast(nullif(rtrim(substr(substr(title, instr(title,'saves=')+6), 1, 6), ';] abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,'),'') as real))) saves,
             round(avg(price)) avg_ask,
             group_concat(distinct case when lower(title) like '%pony%' or lower(title) like '%cheetah%' then 'pony hair / cheetah' end) finish
      from trr_item_reads where read_date >= date('now','-45 days') and model_guess is not null and model_guess <> ''
      group by house, model_guess, era_guess having n >= 3 order by sold desc, saves desc limit 40`).all() as Row[];
    db.close();
    return rows.map((r) => `- ${r.house} ${r.model_guess}${r.era_guess ? ` (${r.era_guess})` : ""}${r.finish ? `, ${r.finish}` : ""}: ${r.n} listed, ${r.sold} sold, ~${r.saves ?? 0} saves, avg ask $${r.avg_ask}`).join("\n");
  } catch {
    db.close();
    return "(tracker unavailable)";
  }
}


/** Quick numbers for the answer strip: retail, sold, asks, saves for one house+model (size-matched where possible). */
export type QuickNumbers = {
  retail_now: number | null; retail_launch: number | null; retail_size: string | null;
  ask_median: number | null; ask_n: number; sold_median: number | null; sold_n: number; sold_pct_of_retail: number | null;
  saves_avg: number | null; trend_pct: number | null; trr_sold_90d: number; icon: boolean;
  buzz: BuzzNumbers | null;
  links: { house_url: string | null; runway_url: string | null };
  path: { from_price: number; from_date: string; to_price: number; to_date: string; size: string | null } | null;
  sell: { retail: number; retail_spec: string; median_sold: number; n: number; window_days: number; matched_on: string } | null;
  asks: { median_ask: number; n: number; sold: number; trr_n: number; fwrd_n: number; fwrd_median: number | null } | null;
};
/** SQL fragment + params requiring every meaningful word of the bag name to appear in a column (no first-word guessing). */
function modelMatch(col: string, bag: string, house?: string): { sql: string; params: string[] } {
  const stop = new Set(["bag", "bags", "the", "and", "with", "flap", "runway", "pieces", "collection", "mini", "small", "medium", "large", "maxi", "jumbo"]);
  const toks = norm(bag).split(" ").filter((w) => w.length > 1 && !stop.has(w) && !/^\d{4}$/.test(w));
  const houseWords = new Set(norm(house ?? "").split(" "));
  const alpha = toks.filter((w) => !/^\d+$/.test(w));
  const nums = toks.filter((w) => /^\d+$/.test(w));
  // Sizes ride in another column ("Birkin 30" → model "Birkin"), so numbers are optional, unless the name is only the house plus a number ("Chanel 25").
  const words = alpha.some((w) => !houseWords.has(w)) ? alpha : [...alpha, ...nums];
  if (!words.length) return { sql: "0", params: [] };
  return { sql: "(" + words.map(() => `lower(${col}) like ?`).join(" and ") + ")", params: words.map((w) => `%${w}%`) };
}
/** Shapes the houses have made for decades: the fallback when the bags table has no launch year. */
const ICONS = /\b(birkin|kelly|constance|bolide|picotin|evelyne|lindy|garden party|classic flap|2\.55|reissue|boy|lady dior|saddle|baguette|peekaboo|speedy|neverfull|alma|keepall|capucines|jackie|bamboo|horsebit|dionysus|galleria|cabat|luggage|classic box|triomphe|sac de jour|city|puzzle|margaux)\b/;
export function quickNumbers(house: string, bag: string, spec?: string): QuickNumbers | null {
  const db = open(); if (!db) return null;
  const hTerms = houseTerms(house); const mm = modelMatch("model", bag, house); const mg = modelMatch("model_guess", bag, house); const bagTerm = norm(bag).split(" ").filter((w) => w.length > 2)[0] ?? norm(bag);
  const g = <T extends Row>(sql: string, params: (string | number)[] = []): T | undefined => { try { return db.prepare(sql).get(...params) as T | undefined; } catch { return undefined; } };
  const rc = g<Row>(`select retail_now, size_or_spec from v_retail_current where ${likeAny("house", hTerms)} and ${mm.sql} limit 1`, [...likeParams(hTerms), ...mm.params]);
  const launch = g<Row>(`select price from retail_reference where ${likeAny("house", hTerms)} and ${mm.sql} and price_type='launch' order by effective_date limit 1`, [...likeParams(hTerms), ...mm.params]);
  const sold = g<Row>(`select n_sold_same_size n, median_sold m, sold_pct_of_retail p from v_sold_vs_retail where ${likeAny("house", hTerms)} and ${mm.sql} limit 1`, [...likeParams(hTerms), ...mm.params]);
  const ask = g<Row>(`select n_listings_same_size n, median_ask_same_size m from v_retention_scoreboard_sized where ${likeAny("house", hTerms)} and ${mm.sql} limit 1`, [...likeParams(hTerms), ...mm.params]);
  const trr = g<Row>(`select round(avg(cast(nullif(rtrim(substr(substr(title, instr(title,'saves=')+6), 1, 6), ';] abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,'),'') as real))) saves, sum(sold) sold90 from trr_item_reads where ${likeAny("house", hTerms)} and ${mg.sql} and read_date >= date('now','-90 days')`, [...likeParams(hTerms), ...mg.params]);
  const trend = g<Row>(`select a.median_ask a0, b.median_ask a1 from resale_aggregates a join resale_aggregates b on a.source=b.source and a.house=b.house and a.model=b.model where ${likeAny("a.house", hTerms)} and ${modelMatch('a.model', bag, house).sql} and a.snapshot_date < b.snapshot_date order by b.snapshot_date desc, a.snapshot_date desc limit 1`, [...likeParams(hTerms), ...modelMatch('a.model', bag, house).params]);
  const icon = g<Row>(`select launch_year from bags where ${likeAny("house", hTerms)} and ${mm.sql} and launch_year <= 2010 limit 1`, [...likeParams(hTerms), ...mm.params]);
  db.close();
  return {
    retail_now: (rc?.retail_now as number) ?? null, retail_launch: (launch?.price as number) ?? null, retail_size: (rc?.size_or_spec as string) ?? null,
    ask_median: (ask?.m as number) ?? null, ask_n: (ask?.n as number) ?? 0,
    sold_median: (sold?.m as number) ?? null, sold_n: (sold?.n as number) ?? 0, sold_pct_of_retail: (sold?.p as number) ?? null,
    saves_avg: (trr?.saves as number) ?? null, trend_pct: trend?.a0 && trend?.a1 ? Math.round((((trend.a1 as number) - (trend.a0 as number)) / (trend.a0 as number)) * 1000) / 10 : null,
    trr_sold_90d: (trr?.sold90 as number) ?? 0, icon: !!icon || ICONS.test(norm(bag)),
    buzz: buzzNumbers(house, bag),
    links: bagLinks(house, bag),
    path: pricePath(house, bag),
    sell: sellNow(house, bag, spec),
    asks: asksNow(house, bag, spec),
  };
}

/** What sellers want right now for this exact bag (title words), when there is no store price to compare against. */
export function asksNow(house: string, bag: string, spec?: string): QuickNumbers["asks"] {
  const db = open(); if (!db) return null;
  const hTerms = houseTerms(house);
  const words = norm(`${bag}`).split(" ").filter((w) => w.length > 2 && !["bag", "bags", "the", "and", "with", "clutch", "flap"].includes(w)).slice(0, 4);
  if (!words.length) { db.close(); return null; }
  const q = <T extends Row>(sql: string, params: (string | number)[] = []): T[] => { try { return db.prepare(sql).all(...params) as T[]; } catch { return []; } };
  // a two-digit size in the name ("Birkin 30") must appear in the title too, so a 30 never borrows a 25's price
  const houseWords = new Set(norm(house).split(" "));
  const nameIsHousePlusNumber = !norm(bag).split(" ").some((w) => w.length > 1 && !/^\d+$/.test(w) && !houseWords.has(w));
  const sizeNum = nameIsHousePlusNumber ? null : (norm(`${bag} ${spec ?? ""}`).match(/\b(1[5-9]|[2-4]\d)\b/)?.[1] ?? null);
  const titleLike = words.map(() => "and lower(title) like ?").join(" ") + (sizeNum ? " and (title like ? or title like ? or title like ? or title like ?)" : "");
  const wp = [...words.map((w) => `%${w}%`), ...(sizeNum ? [`% ${sizeNum} %`, `% ${sizeNum}`, `% ${sizeNum},%`, `%${sizeNum}cm%`] : [])];
  const trr = q<Row>(`select price, sold from trr_item_reads where ${likeAny("house", hTerms)} and read_date >= date('now','-45 days') and price is not null ${titleLike} order by price`, [...likeParams(hTerms), ...wp]);
  // FWRD Renew (fwrd.com pre-owned): Katie trusts its pricing for vetted second hand. Weekly page read; asks only, FWRD shows no sold data.
  const fwrd = q<Row>(`select price from v_fwrd_latest where ${likeAny("house", hTerms)} and read_date >= date('now','-45 days') ${titleLike} order by price`, [...likeParams(hTerms), ...wp]);
  db.close();
  const trrAsks = trr.filter((r) => !r.sold).map((r) => r.price as number);
  const fwrdAsks = fwrd.map((r) => r.price as number);
  const asks = [...trrAsks, ...fwrdAsks].sort((a, b) => a - b);
  if (!asks.length) return null;
  return { median_ask: asks[Math.floor(asks.length / 2)], n: asks.length, sold: trr.filter((r) => !!r.sold).length, trr_n: trrAsks.length, fwrd_n: fwrdAsks.length, fwrd_median: fwrdAsks.length ? fwrdAsks[Math.floor(fwrdAsks.length / 2)] : null };
}

/** One block of headline numbers the scorer must use, so the words and the tiles never disagree. */
export function headlineNumbers(house: string, bag: string, spec?: string): string {
  const n = quickNumbers(house, bag, spec); if (!n) return "";
  const lines: string[] = [];
  if (n.retail_now) lines.push(`Boutique price today: $${n.retail_now}${n.retail_size ? ` (${n.retail_size})` : ""}${n.retail_launch && n.retail_launch !== n.retail_now ? `; was $${n.retail_launch} at launch` : ""}.`);
  if (n.sell) lines.push(`SOLD PRICE TO QUOTE: $${n.sell.median_sold} median, ${n.sell.n} pristine/excellent same-edition sold listings seen on The RealReal in the last ${n.sell.window_days} days (sale dates unknown; say "sold listings seen", never "sales since <date>"), against $${n.sell.retail} retail. Use this as "sold for". Never quote a single outlier sale as the sold price.`);
  else if (n.sold_n) lines.push(`SOLD PRICE TO QUOTE: $${n.sold_median} median, ${n.sold_n} same-size sales (any condition), ${n.sold_pct_of_retail}% of today's retail.`);
  else if (n.asks) lines.push(`No sold price yet. Sellers want $${n.asks.median_ask} across ${n.asks.n} listings; ${n.asks.sold} sold.`);
  if (n.ask_median) lines.push(`Asking median: $${n.ask_median} across ${n.ask_n} listings (asks, not sales).`);
  if (n.asks?.fwrd_n && n.asks.fwrd_median) lines.push(`FWRD Renew (vetted pre-owned, a trusted price reference; asks, not sales): $${n.asks.fwrd_median} median across ${n.asks.fwrd_n} listings this week.`);
  if (n.path) lines.push(`Retail path: $${n.path.from_price} (${n.path.from_date}) → $${n.path.to_price} (${n.path.to_date}).`);
  return lines.length ? section("HEADLINE NUMBERS (the page shows exactly these; your takeaways, plain_answer and signals must use the same figures)", lines) : "";
}

/** Like for like for the access buyer: the exact edition (model + finish words) and size, pristine or tagged, sold in the last 45 days,
 *  against the retail row for that same spec. Null under three sales, so the tile never shows a thin or mismatched number. */
export function sellNow(house: string, bag: string, spec?: string): QuickNumbers["sell"] {
  const db = open(); if (!db) return null;
  const hTerms = houseTerms(house);
  const q = <T extends Row>(sql: string, params: (string | number)[] = []): T[] => { try { return db.prepare(sql).all(...params) as T[]; } catch { return []; } };
  const stop = new Set(["bag", "bags", "the", "and", "with", "flap", "runway", "pieces", "collection", "print", "hobo", "mini", "small", "medium", "large", "maxi", "jumbo"]);
  const rawSpec = norm(spec ?? "").split(" ").filter((w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w));
  // finish words match as "any of", with adjacent words also tried joined ("pony hair" → "ponyhair"), because listing titles vary
  const specWords = Array.from(new Set([...rawSpec, ...rawSpec.slice(0, -1).map((w, i) => w + rawSpec[i + 1])])).slice(0, 6);
  // size: a size word first; else a two-digit number, which is a size ("Birkin 30") unless the name is only the house plus a number ("Chanel 25")
  const all = norm(`${bag} ${spec ?? ""}`);
  const houseWords = new Set(norm(house).split(" "));
  const nameIsHousePlusNumber = !norm(bag).split(" ").some((w) => w.length > 1 && !/^\d+$/.test(w) && !houseWords.has(w));
  let sizeWord: string | null = (all.match(/\b(mini|small|medium|large|maxi|jumbo)\b/) ?? [])[0] ?? (nameIsHousePlusNumber ? null : ((all.match(/\b\d{2}\b/g) ?? [])[0] ?? null));
  const exotic = /(ostrich|croc|alligator|lizard|porosus|special order|himalaya)/i;
  const wantsExotic = exotic.test(spec ?? "");
  const tryMatch = (words: string[], label: string) => {
    const mm = modelMatch("model", bag, house);
    const anyOf = (col: string) => words.length ? `and (${words.map(() => `lower(replace(${col},' ','')) like ?`).join(" or ")})` : "";
    // no size given: use the house's reference size for this model, so a "Birkin" compares 30 to 30, never special orders
    if (!sizeWord) {
      const ref = q<Row>(`select size_key from retail_reference where ${likeAny("house", hTerms)} and ${mm.sql} and is_reference_size=1 and size_key is not null and size_key <> '' order by effective_date desc limit 1`, [...likeParams(hTerms), ...mm.params])[0];
      if (ref?.size_key) sizeWord = String(ref.size_key).toLowerCase();
    }
    const retailRows = q<Row>(`select price, size_or_spec from retail_reference where ${likeAny("house", hTerms)} and ${mm.sql} and region='US' and price_type in ('current','launch') and coalesce(source_url,'') not like 'private:%' ${wantsExotic ? "" : "and lower(size_or_spec) not like '%ostrich%' and lower(size_or_spec) not like '%croc%' and lower(size_or_spec) not like '%alligator%' and lower(size_or_spec) not like '%lizard%' and lower(size_or_spec) not like '%special order%'"} ${anyOf("size_or_spec")} ${sizeWord ? "and lower(size_or_spec) like ?" : ""} order by effective_date desc limit 1`,
      [...likeParams(hTerms), ...mm.params, ...words.map((w) => `%${w}%`), ...(sizeWord ? [`%${sizeWord}%`] : [])]);
    if (!retailRows.length) return null;
    const mg = modelMatch("model_guess", bag, house);
    const sold = q<Row>(`select price from trr_item_reads where ${likeAny("house", hTerms)} and ${mg.sql} and sold=1 and price is not null and read_date >= date('now','-45 days')
        and (coalesce(condition,'') in ('Pristine','Excellent') or title like '%w/Tags%' or title like '%w/ Tags%')
        ${wantsExotic ? "" : "and lower(title) not like '%ostrich%' and lower(title) not like '%croc%' and lower(title) not like '%alligator%' and lower(title) not like '%lizard%' and lower(title) not like '%porosus%'"}
        ${anyOf("title")} ${sizeWord ? "and lower(title) like ?" : ""} order by price`,
      [...likeParams(hTerms), ...mg.params, ...words.map((w) => `%${w}%`), ...(sizeWord ? [`%${sizeWord}%`] : [])]);
    if (sold.length < 3) return null;
    const prices = sold.map((r) => r.price as number); const median = prices[Math.floor(prices.length / 2)];
    return { retail: retailRows[0].price as number, retail_spec: (retailRows[0].size_or_spec as string) ?? "", median_sold: median, n: prices.length, window_days: 45, matched_on: label };
  };
  const out = (specWords.length ? tryMatch(specWords, `${bag} ${specWords.join(" ")}${sizeWord ? ` ${sizeWord}` : ""}`) : null) ?? tryMatch([], `${bag}${sizeWord ? ` ${sizeWord}` : ""}, plain`);
  db.close();
  return out;
}

/** The anchor: the oldest and newest US reference-size prices within 30 months, when the price went up. */
export function pricePath(house: string, bag: string): QuickNumbers["path"] {
  const db = open(); if (!db) return null;
  const hTerms = houseTerms(house); const mm = modelMatch("model", bag, house);
  try {
    const rows = db.prepare(`select price, effective_date, size_or_spec from retail_reference where ${likeAny("house", hTerms)} and ${mm.sql} and region='US' and is_reference_size=1 and effective_date >= date('now','-30 months') order by effective_date`).all(...likeParams(hTerms), ...mm.params) as Row[];
    db.close();
    if (rows.length < 2) return null;
    const a = rows[0], b = rows[rows.length - 1];
    if ((b.price as number) <= (a.price as number)) return null;
    return { from_price: a.price as number, from_date: String(a.effective_date), to_price: b.price as number, to_date: String(b.effective_date), size: (b.size_or_spec as string) ?? null };
  } catch { db.close(); return null; }
}

/* ---------------- THE BUZZ: cultural-moment layer (buzz_terms / buzz_reads / buzz_events) ---------------- */

export type BuzzNumbers = {
  score: number | null; direction: "rising" | "steady" | "fading" | null; platforms: number; level: "family" | "house" | null;
  detail: string | null; movers: { term: string; platform: string; metric: string; value: number; note: string | null }[];
  events: { date: string; type: string; note: string }[];
  trends: { date: string; note: string; source: string }[];
  read_date: string | null;
};

function bagFamilyTerm(db: DatabaseSync, hTerms: string[], bag: string): string | null {
  const words = norm(bag).split(" ").filter((w) => w.length > 2 && !/^\d+$/.test(w) && !["bag", "bags", "the", "and", "with", "flap"].includes(w));
  if (!words.length) return null;
  try {
    const row = db.prepare(`select family from buzz_terms where ${likeAny("house", hTerms)} and family is not null and (${words.map(() => "lower(family) like ?").join(" or ")}) group by family order by count(*) desc limit 1`)
      .get(...likeParams(hTerms), ...words.map((w) => `%${w}%`)) as Row | undefined;
    return (row?.family as string) ?? null;
  } catch { return null; }
}

export function buzzNumbers(house: string, bag: string): BuzzNumbers | null {
  const db = open(); if (!db) return null;
  const hTerms = houseTerms(house);
  const q = <T extends Row>(sql: string, params: (string | number)[] = []): T[] => { try { return db.prepare(sql).all(...params) as T[]; } catch { return []; } };
  const fam = bagFamilyTerm(db, hTerms, bag);
  const famScore = fam ? q<Row>(`select * from v_buzz_score where ${likeAny("house", hTerms)} and family = ?`, [...likeParams(hTerms), fam])[0] : undefined;
  const houseScore = q<Row>(`select * from v_buzz_score where ${likeAny("house", hTerms)} and family is null`, likeParams(hTerms))[0];
  const sc = famScore ?? houseScore;
  const movers = q<Row>(
    `select t.term, t.platform, t.metric, t.latest as value, r.note, t.read_date from v_buzz_trend t
       join buzz_terms b on b.platform=t.platform and b.term=t.term
       left join buzz_reads r on r.platform=t.platform and r.term=t.term and r.metric=t.metric and r.read_date=t.read_date
      where ${likeAny("b.house", hTerms)} ${fam ? "and b.family = ?" : "and b.family is null"} and t.metric in ('growth_pct_7d','interest_0_100','posts_total','views_7d','posts_7d','videos_7d','mentions_7d','most_viewed_rank_ss27','fw_ss27_engagements','posts_visible') and t.latest is not null
      group by t.platform, t.term, t.metric order by case when t.metric='growth_pct_7d' then 0 else 1 end, abs(t.latest) desc limit 8`,
    [...likeParams(hTerms), ...(fam ? [fam] : [])]);
  // If the family has no hashtag counts yet, borrow the house's so the board always shows what people are posting.
  const hasTags = movers.some((m) => (m.platform === "instagram" || m.platform === "tiktok" || m.platform === "tiktok-cc") && String(m.metric).startsWith("posts"));
  const hasGrowth = movers.some((m) => m.platform === "google" && m.metric === "growth_pct_7d");
  if (fam && !hasGrowth) {
    movers.push(...q<Row>(`select t.term, t.platform, t.metric, t.latest as value, r.note, t.read_date from v_buzz_trend t join buzz_terms b on b.platform=t.platform and b.term=t.term
      left join buzz_reads r on r.platform=t.platform and r.term=t.term and r.metric=t.metric and r.read_date=t.read_date
      where ${likeAny("b.house", hTerms)} and b.family is null and t.platform='google' and t.metric='growth_pct_7d' and t.latest is not null order by abs(t.latest) desc limit 1`, likeParams(hTerms)));
  }
  if (fam && !hasTags) {
    const houseTags = q<Row>(
      `select t.term, t.platform, t.metric, t.latest as value, r.note from v_buzz_trend t
         join buzz_terms b on b.platform=t.platform and b.term=t.term
         left join buzz_reads r on r.platform=t.platform and r.term=t.term and r.metric=t.metric and r.read_date=t.read_date
        where ${likeAny("b.house", hTerms)} and b.family is null and t.platform in ('instagram','tiktok','tiktok-cc') and t.metric in ('posts_total','posts_7d','views_7d','posts_visible') and t.latest is not null
        group by t.platform, t.term, t.metric order by t.latest desc limit 6`, likeParams(hTerms));
    movers.push(...houseTags);
  }
  const events = q<Row>(`select event_date, event_type, derived_note from buzz_events where ${likeAny("house", hTerms)} ${fam ? "and (family = ? or family is null)" : ""} order by event_date desc limit 5`, [...likeParams(hTerms), ...(fam ? [fam] : [])]);
  const trends = q<Row>(`select scan_date, derived_note, source from daily_signals where (${likeAny("house", hTerms)} or house in ('Multi','Culture')) and (signal like 'tiktok%' or signal like '%viral%' or signal like '%trend%' or signal like 'fashion_month%' or signal like 'buyer_pick' or signal like 'bestseller%') and scan_date >= date('now','-45 days') order by scan_date desc limit 6`, likeParams(hTerms));
  db.close();
  if (!sc && !movers.length && !events.length && !trends.length) return null;
  return {
    score: (sc?.buzz_0_100 as number) ?? null, direction: ((sc?.direction as string) ?? null) as BuzzNumbers["direction"], platforms: (sc?.platforms as number) ?? 0,
    level: famScore ? "family" : houseScore ? "house" : null, detail: (sc?.detail as string) ?? null,
    movers: movers.map((m) => ({ term: m.term as string, platform: m.platform as string, metric: m.metric as string, value: m.value as number, note: (m.note as string) ?? null })),
    events: events.map((e) => ({ date: e.event_date as string, type: e.event_type as string, note: e.derived_note as string })),
    trends: trends.map((t) => ({ date: t.scan_date as string, note: t.derived_note as string, source: t.source as string })),
    read_date: (movers[0]?.read_date as string | undefined) ?? (trends[0]?.scan_date as string | undefined) ?? null,
  };
}

/** Text block for the research dossier. */
export function buzzDossier(house: string, bag: string): string {
  const b = buzzNumbers(house, bag);
  if (!b) return "";
  const lines: string[] = [];
  lines.push(`Buzz score ${b.score ?? "n/a"}/100 (${b.direction ?? "no direction yet"}; ${b.platforms} platform${b.platforms === 1 ? "" : "s"}; ${b.level === "family" ? "bag-family level" : "house level, no bag-specific terms yet"}). Formula: 50 + 0.35×week-over-week growth% + volume bonus, averaged across platforms. One platform = weak read.`);
  for (const m of b.movers) lines.push(`${m.platform} · "${m.term}" · ${m.metric} = ${m.value}${m.note ? ` (${m.note})` : ""}`);
  for (const e of b.events) lines.push(`event ${e.date} · ${e.type}: ${e.note}`);
  return section("BUZZ (tracker: Google Trends week-over-week, TikTok/Instagram reads, logged events; derived numbers only)", lines);
}

/** Runway-to-market evidence for collection / pre-order questions: the show, how often each bag walked, delivery window,
 *  and precedent: what this house's recent new bags did on resale once they landed. */
export function collectionDossier(house: string, season?: string): string {
  const db = open(); if (!db) return "";
  const hTerms = houseTerms(house);
  const q = <T extends Row>(sql: string, params: (string | number)[] = []): T[] => { try { return db.prepare(sql).all(...params) as T[]; } catch { return []; } };
  const notes = q<Row>(`select season, show_date, designer, new_bag_families, returning_icons, novelty_count, archive_refs, press_read, in_store_window, source_urls from show_notes where ${likeAny("house", hTerms)} order by show_date desc limit 2`, likeParams(hTerms));
  const seasons = q<Row>(`select season, show_date, expected_in_store, count(*) looks_with_bags, count(distinct model_guess) distinct_bags, max(source_url) source_url from runway_pipeline where ${likeAny("house", hTerms)} group by season order by show_date desc limit 3`, likeParams(hTerms));
  const latest = seasons[0]?.season as string | undefined;
  const fams = latest ? q<Row>(`select model_guess, count(*) looks, group_concat(distinct material) materials, group_concat(distinct novelty) novelty from runway_pipeline where ${likeAny("house", hTerms)} and season = ? group by model_guess order by looks desc limit 14`, [...likeParams(hTerms), latest]) : [];
  const famRows = q<Row>(`select family, n_looks, look_numbers, description from bag_families where ${likeAny("house", hTerms)} and (family like '%SS27%' or family like '%Spring 2027%' or family like '%Resort 27%') order by n_looks desc limit 14`, likeParams(hTerms));
  const precedent = q<Row>(`select model, matched_size, retail_now, n_sold_same_size, median_sold, sold_pct_of_retail, last_read from v_sold_vs_retail where ${likeAny("house", hTerms)} order by last_read desc limit 12`, likeParams(hTerms));
  const traj = q<Row>(`select model_guess, trajectory, count(*) n, round(avg(pct_change_since_first),1) avg_pct from item_trajectories where ${likeAny("house", hTerms)} and times_seen > 1 group by 1,2 order by n desc limit 16`, likeParams(hTerms));
  const prices = q<Row>(`select model, year, retail_that_year from v_retail_history where ${likeAny("house", hTerms)} order by model, year limit 40`, likeParams(hTerms));
  const cds = q<Row>(`select * from creative_directors where ${likeAny("house", hTerms)} order by rowid desc limit 2`, likeParams(hTerms));
  db.close();
  if (!notes.length && !seasons.length) return "";
  const out: string[] = [];
  out.push(section(`COLLECTION PIPELINE (tracker: Vogue Runway look-by-look capture${season ? `; client asked about ${season}` : ""})`, [
    ...seasons.map((r) => `${r.season}: shown ${r.show_date}; ${r.looks_with_bags} looks carried a bag, ${r.distinct_bags} distinct bags; expected in store ${r.expected_in_store ?? "unknown"} (${r.source_url})`),
    ...notes.map((n) => `Show notes ${n.season} (${n.show_date}, ${n.designer}): new families: ${n.new_bag_families}. Returning icons: ${n.returning_icons ?? "n/a"}. Novelty count ${n.novelty_count}. Archive refs: ${n.archive_refs ?? "n/a"}. Press read: ${n.press_read ?? "n/a"}. In-store window: ${n.in_store_window ?? "unknown"}. Sources: ${n.source_urls}`),
  ]));
  out.push(section("How often each bag walked (more looks = commercial pillar the house will produce in volume; 1–2 looks = runway special, scarce)", [
    ...famRows.map((f) => `${f.family}: ${f.n_looks} looks (${f.look_numbers}). ${f.description}`),
    ...(famRows.length ? [] : fams.map((f) => `${f.model_guess}: ${f.looks} looks; materials ${f.materials}; novelty ${f.novelty}`)),
  ]));
  out.push(section("PRECEDENT: what this house's bags did once they reached resale (size-matched confirmed sales vs today's retail)", precedent.map((p) => `${p.model} ${p.matched_size ?? ""}: ${p.n_sold_same_size} sold, median $${p.median_sold} = ${p.sold_pct_of_retail}% of $${p.retail_now} retail (last read ${p.last_read})`)));
  out.push(section("PRECEDENT: listing trajectories on The RealReal (asks raised / marked down / sold, per model)", traj.map((t) => `${t.model_guess}: ${t.trajectory} ×${t.n}${t.avg_pct != null ? ` (avg ${t.avg_pct}% since first seen)` : ""}`)));
  out.push(section("Retail price path by year (US reference size)", prices.map((p) => `${p.model} ${p.year}: $${p.retail_that_year}`)));
  if (cds.length) out.push(section("Creative director (tracker)", cds.map((c) => JSON.stringify(c))));
  return out.filter(Boolean).join("\n\n");
}

/** The race board: one row per house, from sold prices (holds value) and sell-through/saves (heat). */
export type RaceRow = { house: string; models: number; sold_pct: number | null; heat: number | null; delist_pct: number | null; saves: number | null; sold_90d: number };
export function raceBoard(): RaceRow[] {
  const db = open(); if (!db) return [];
  try {
    const rows = db.prepare(`
      with hold as (select house, count(*) models, round(avg(sold_pct_of_retail)) sold_pct from v_sold_vs_retail group by house),
      heat as (select house, round(avg(cast(nullif(rtrim(substr(substr(title, instr(title,'saves=')+6), 1, 6), ';] abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,'),'') as real))) saves, sum(sold) sold90 from trr_item_reads where read_date >= date('now','-90 days') group by house),
      dl as (select brand house, round(100.0*sum(gone)/sum(listed_before),1) delist from v_disappearance group by brand)
      select h.house, h.models, h.sold_pct, t.saves, t.sold90, d.delist
      from hold h left join heat t on t.house=h.house left join dl d on d.house=h.house order by h.sold_pct desc`).all() as Row[];
    db.close();
    return rows.map((r) => ({ house: String(r.house), models: Number(r.models), sold_pct: (r.sold_pct as number) ?? null, saves: (r.saves as number) ?? null, sold_90d: Number(r.sold90 ?? 0), delist_pct: (r.delist as number) ?? null,
      heat: r.saves != null ? Math.round(Math.min(100, (r.saves as number) * 1.2 + ((r.delist as number) ?? 0))) : null }));
  } catch { db.close(); return []; }
}


/** PESTEL watch list (tracker table pestel_watch): the macro layer's standing evidence. */
export function pestelDossier(house: string): string {
  const db = open(); if (!db) return "";
  const q = <T extends Row>(sql: string, params: (string | number)[] = []): T[] => { try { return db.prepare(sql).all(...params) as T[]; } catch { return []; } };
  const rows = q<Row>(`select dimension, item, region, status, direction, why_it_matters, houses, next_check, source_name, source_url, updated_at from pestel_watch where active=1 order by case status when 'active' then 0 else 1 end, dimension`);
  const recent = q<Row>(`select date, category, description, houses_affected, source_url from macro_events where date >= date('now','-45 days') order by date desc limit 8`);
  db.close();
  if (!rows.length && !recent.length) return "";
  const rel = (h: string | null) => !h || /all/i.test(h) || h.toLowerCase().includes(house.toLowerCase().slice(0, 5));
  const lines = rows.map((r) => `${r.dimension} · ${r.status}${r.direction ? ` (${r.direction})` : ""}${rel(r.houses as string) ? " · RELEVANT TO THIS HOUSE" : ""}: ${r.item}. Why: ${r.why_it_matters} [${r.source_name}, updated ${String(r.updated_at).slice(0, 10)}; ${r.source_url}]`);
  const ev = recent.map((e) => `${e.date} · ${e.category}: ${e.description} (${e.houses_affected ?? "n/a"}) ${e.source_url}`);
  return [section("PESTEL WATCH (tracker: standing list of world factors that move bag values; use for the macro layer and for timing)", lines), ev.length ? section("Recent macro events (last 45 days)", ev) : ""].filter(Boolean).join("\n\n");
}


/** Who controls the house and what they just decided (tracker: ownership_map + stakeholder_decisions). */
export function ownershipDossier(house: string): string {
  const db = open(); if (!db) return "";
  const hTerms = houseTerms(house);
  const q = <T extends Row>(sql: string, params: (string | number)[] = []): T[] => { try { return db.prepare(sql).all(...params) as T[]; } catch { return []; } };
  const o = q<Row>(`select * from ownership_map where ${likeAny("house", hTerms)} limit 1`, likeParams(hTerms))[0];
  const parent = o?.parent as string | undefined;
  const siblings = parent ? q<Row>(`select house, creative_director, last_major_decision, decision_date from ownership_map where parent = ? and house <> ?`, [parent, o!.house as string]) : [];
  const dec = q<Row>(`select decision_date, house, actor, decision, implication_for_bags, source_name, source_url from stakeholder_decisions where ${likeAny("house", hTerms)} ${parent ? "or house in (select house from ownership_map where parent = ?)" : ""} order by decision_date desc limit 8`, [...likeParams(hTerms), ...(parent ? [parent] : [])]);
  db.close();
  if (!o) return "";
  const lines = [
    `${o.house}: parent ${o.parent ?? "independent"}${o.listed ? ` (listed, ${o.ticker})` : " (private)"}. Controlling holder: ${o.controlling_holder} via ${o.holder_vehicle}${o.stake_capital_pct != null ? `, ${o.stake_capital_pct}% of capital / ${o.stake_votes_pct}% of votes as of ${o.stake_as_of}` : ""}. [${o.source_name}; ${o.source_url}; confidence ${o.confidence}]`,
    `Decision-makers: chair ${o.chair}; CEO ${o.ceo}${o.fashion_president && o.fashion_president !== "—" ? `; fashion president ${o.fashion_president}` : ""}; creative director ${o.creative_director} (since ${o.cd_since}).`,
    `Succession: ${o.succession_notes}`,
    `Cross-holdings: ${o.cross_holdings}`,
    `Last major decision (${o.decision_date}): ${o.last_major_decision}. Implication for bags: ${o.implication_for_bags}`,
    ...(siblings.length ? [`Sister houses under the same owner: ${siblings.map((s) => `${s.house} (${s.creative_director}; ${s.last_major_decision}, ${s.decision_date})`).join(" · ")}`] : []),
    ...dec.map((d) => `Decision log ${d.decision_date} · ${d.house} · ${d.actor}: ${d.decision}. → ${d.implication_for_bags} [${d.source_name}; ${d.source_url}]`),
  ];
  return section("OWNERSHIP & STAKEHOLDERS (tracker: who controls the house, who decides, what they decided)", lines);
}


/** Where the real thing can be seen: the house's own product page (if the reference price came from one) and the latest runway look. */
export function bagLinks(house: string, bag: string): { house_url: string | null; runway_url: string | null } {
  const db = open(); if (!db) return { house_url: null, runway_url: null };
  const hTerms = houseTerms(house); const mm = modelMatch("model", bag, house);
  const g = <T extends Row>(sql: string, params: (string | number)[] = []): T | undefined => { try { return db.prepare(sql).get(...params) as T | undefined; } catch { return undefined; } };
  const hp = g<Row>(`select source_url from retail_reference where ${likeAny("house", hTerms)} and ${mm.sql} and (source_url like '%/product%' or source_url like '%/products/%' or source_url like '%/p/%') and source_url not like 'private:%' order by effective_date desc limit 1`, [...likeParams(hTerms), ...mm.params]);
  const rw = g<Row>(`select source_url from runway_pipeline where ${likeAny("house", hTerms)} and (${modelMatch('model_guess', bag, house).sql} or ${modelMatch('bag_description', bag, house).sql}) and source_url like '%vogue.com%' order by show_date desc limit 1`, [...likeParams(hTerms), ...modelMatch('model_guess', bag, house).params, ...modelMatch('bag_description', bag, house).params]);
  db.close();
  return { house_url: (hp?.source_url as string) ?? null, runway_url: (rw?.source_url as string) ?? null };
}


/** Every bag with a current boutique price, for the Browse page. */
export type CatalogueRow = { house: string; model: string; retail_now: number | null; sold_pct: number | null; sold_n: number };
export function catalogue(): CatalogueRow[] {
  const db = open(); if (!db) return [];
  const q = <T extends Row>(sql: string): T[] => { try { return db.prepare(sql).all() as T[]; } catch { return []; } };
  const rows = q<Row>(`select c.house, c.model, min(c.retail_now) retail_now,
       (select sold_pct_of_retail from v_sold_vs_retail s where s.house=c.house and s.model=c.model limit 1) sold_pct,
       (select n_sold_same_size from v_sold_vs_retail s where s.house=c.house and s.model=c.model limit 1) sold_n
     from v_retail_current c group by c.house, c.model
     order by case c.house when 'Hermès' then 0 when 'Chanel' then 1 when 'Louis Vuitton' then 2 when 'Dior' then 3 when 'Bottega Veneta' then 4 when 'The Row' then 5 when 'Loewe' then 6 when 'Celine' then 7 else 9 end, c.house, c.model`);
  db.close();
  return rows.map((r) => ({ house: r.house as string, model: r.model as string, retail_now: (r.retail_now as number) ?? null, sold_pct: (r.sold_pct as number) ?? null, sold_n: (r.sold_n as number) ?? 0 }));
}
