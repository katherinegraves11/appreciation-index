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

export function buildTrackerDossier(house: string, bag: string): TrackerDossier {
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
