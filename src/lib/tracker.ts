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
             round(avg(cast(nullif(substr(title, instr(title,'saves=')+6, 3),'') as real))) saves,
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
};
export function quickNumbers(house: string, bag: string): QuickNumbers | null {
  const db = open(); if (!db) return null;
  const hTerms = houseTerms(house); const bagTerm = norm(bag).split(" ").filter((w) => w.length > 2)[0] ?? norm(bag);
  const g = <T extends Row>(sql: string, params: (string | number)[] = []): T | undefined => { try { return db.prepare(sql).get(...params) as T | undefined; } catch { return undefined; } };
  const rc = g<Row>(`select retail_now, size_or_spec from v_retail_current where ${likeAny("house", hTerms)} and lower(model) like ? limit 1`, [...likeParams(hTerms), `%${bagTerm}%`]);
  const launch = g<Row>(`select price from retail_reference where ${likeAny("house", hTerms)} and lower(model) like ? and price_type='launch' order by effective_date limit 1`, [...likeParams(hTerms), `%${bagTerm}%`]);
  const sold = g<Row>(`select n_sold_same_size n, median_sold m, sold_pct_of_retail p from v_sold_vs_retail where ${likeAny("house", hTerms)} and lower(model) like ? limit 1`, [...likeParams(hTerms), `%${bagTerm}%`]);
  const ask = g<Row>(`select n_listings_same_size n, median_ask_same_size m from v_retention_scoreboard_sized where ${likeAny("house", hTerms)} and lower(model) like ? limit 1`, [...likeParams(hTerms), `%${bagTerm}%`]);
  const trr = g<Row>(`select round(avg(cast(nullif(substr(title, instr(title,'saves=')+6,3),'') as real))) saves, sum(sold) sold90 from trr_item_reads where ${likeAny("house", hTerms)} and lower(model_guess) like ? and read_date >= date('now','-90 days')`, [...likeParams(hTerms), `%${bagTerm}%`]);
  const trend = g<Row>(`select a.median_ask a0, b.median_ask a1 from resale_aggregates a join resale_aggregates b on a.source=b.source and a.house=b.house and a.model=b.model where ${likeAny("a.house", hTerms)} and lower(a.model) like ? and a.snapshot_date < b.snapshot_date order by b.snapshot_date desc, a.snapshot_date desc limit 1`, [...likeParams(hTerms), `%${bagTerm}%`]);
  const icon = g<Row>(`select launch_year from bags where ${likeAny("house", hTerms)} and lower(model) like ? and launch_year <= 2010 limit 1`, [...likeParams(hTerms), `%${bagTerm}%`]);
  db.close();
  return {
    retail_now: (rc?.retail_now as number) ?? null, retail_launch: (launch?.price as number) ?? null, retail_size: (rc?.size_or_spec as string) ?? null,
    ask_median: (ask?.m as number) ?? null, ask_n: (ask?.n as number) ?? 0,
    sold_median: (sold?.m as number) ?? null, sold_n: (sold?.n as number) ?? 0, sold_pct_of_retail: (sold?.p as number) ?? null,
    saves_avg: (trr?.saves as number) ?? null, trend_pct: trend?.a0 && trend?.a1 ? Math.round((((trend.a1 as number) - (trend.a0 as number)) / (trend.a0 as number)) * 1000) / 10 : null,
    trr_sold_90d: (trr?.sold90 as number) ?? 0, icon: !!icon,
    buzz: buzzNumbers(house, bag),
    links: bagLinks(house, bag),
  };
}

/* ---------------- THE BUZZ: cultural-moment layer (buzz_terms / buzz_reads / buzz_events) ---------------- */

export type BuzzNumbers = {
  score: number | null; direction: "rising" | "steady" | "fading" | null; platforms: number; level: "family" | "house" | null;
  detail: string | null; movers: { term: string; platform: string; metric: string; value: number; note: string | null }[];
  events: { date: string; type: string; note: string }[];
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
    `select t.term, t.platform, t.metric, t.latest as value, r.note from v_buzz_trend t
       join buzz_terms b on b.platform=t.platform and b.term=t.term
       left join buzz_reads r on r.platform=t.platform and r.term=t.term and r.metric=t.metric and r.read_date=t.read_date
      where ${likeAny("b.house", hTerms)} ${fam ? "and b.family = ?" : "and b.family is null"} and t.metric in ('growth_pct_7d','interest_0_100','posts_total','views_7d','posts_7d','videos_7d','mentions_7d','most_viewed_rank_ss27','fw_ss27_engagements','posts_visible') and t.latest is not null
      group by t.platform, t.term, t.metric order by case when t.metric='growth_pct_7d' then 0 else 1 end, abs(t.latest) desc limit 8`,
    [...likeParams(hTerms), ...(fam ? [fam] : [])]);
  const events = q<Row>(`select event_date, event_type, derived_note from buzz_events where ${likeAny("house", hTerms)} ${fam ? "and (family = ? or family is null)" : ""} order by event_date desc limit 5`, [...likeParams(hTerms), ...(fam ? [fam] : [])]);
  db.close();
  if (!sc && !movers.length && !events.length) return null;
  return {
    score: (sc?.buzz_0_100 as number) ?? null, direction: ((sc?.direction as string) ?? null) as BuzzNumbers["direction"], platforms: (sc?.platforms as number) ?? 0,
    level: famScore ? "family" : houseScore ? "house" : null, detail: (sc?.detail as string) ?? null,
    movers: movers.map((m) => ({ term: m.term as string, platform: m.platform as string, metric: m.metric as string, value: m.value as number, note: (m.note as string) ?? null })),
    events: events.map((e) => ({ date: e.event_date as string, type: e.event_type as string, note: e.derived_note as string })),
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
      heat as (select house, round(avg(cast(nullif(substr(title, instr(title,'saves=')+6,3),'') as real))) saves, sum(sold) sold90 from trr_item_reads where read_date >= date('now','-90 days') group by house),
      dl as (select brand house, round(100.0*sum(gone)/sum(listed_before),1) delist from v_disappearance group by brand)
      select h.house, h.models, h.sold_pct, t.saves, t.sold90, d.delist
      from hold h left join heat t on t.house=h.house left join dl d on d.house=h.house order by h.sold_pct desc`).all() as Row[];
    db.close();
    return rows.map((r) => ({ house: String(r.house), models: Number(r.models), sold_pct: (r.sold_pct as number) ?? null, saves: (r.saves as number) ?? null, sold_90d: Number(r.sold90 ?? 0), delist_pct: (r.delist as number) ?? null,
      heat: r.saves != null || r.delist != null ? Math.round(Math.min(100, ((r.saves as number) ?? 20) * 1.2 + ((r.delist as number) ?? 30))) : null }));
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
  const hTerms = houseTerms(house); const bagTerm = norm(bag).split(" ").filter((w) => w.length > 2)[0] ?? norm(bag);
  const g = <T extends Row>(sql: string, params: (string | number)[] = []): T | undefined => { try { return db.prepare(sql).get(...params) as T | undefined; } catch { return undefined; } };
  const hp = g<Row>(`select source_url from retail_reference where ${likeAny("house", hTerms)} and lower(model) like ? and (source_url like '%/product%' or source_url like '%/products/%' or source_url like '%/p/%') and source_url not like 'private:%' order by effective_date desc limit 1`, [...likeParams(hTerms), `%${bagTerm}%`]);
  const rw = g<Row>(`select source_url from runway_pipeline where ${likeAny("house", hTerms)} and (lower(model_guess) like ? or lower(bag_description) like ?) and source_url like '%vogue.com%' order by show_date desc limit 1`, [...likeParams(hTerms), `%${bagTerm}%`, `%${bagTerm}%`]);
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
