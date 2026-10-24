import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import type { BriefInput, BriefResult } from "./schema";
import type { Source } from "./research";

export type BriefRecord = {
  id: string;
  created_at: string;
  house: string;
  bag: string;
  spec: string | null;
  horizon_years: number;
  client_type: string;
  cohort?: string | null;
  budget: string | null;
  notes: string | null;
  dossier: string;
  sources: Source[];
  result: BriefResult;
  model: string;
  usage: { input_tokens: number; output_tokens: number } | null;
};

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

// Local-file fallback for dev without Supabase. Durable on a laptop; NOT durable on serverless hosts.
// (A plain in-memory Map does not work in `next dev`: the API route and the page are separate module instances.)
const DATA_DIR = process.env.BRIEFS_DIR ? path.resolve(process.env.BRIEFS_DIR) : path.join(process.cwd(), ".data", "briefs");
function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
function fileFor(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid brief id.");
  return path.join(DATA_DIR, `${id}.json`);
}

export function storageMode(): "supabase" | "file" {
  return supabase ? "supabase" : "file";
}

export async function saveBrief(args: {
  input: BriefInput;
  dossier: string;
  sources: Source[];
  result: BriefResult;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}): Promise<string> {
  const row = {
    house: args.input.house,
    bag: args.input.bag,
    spec: args.input.spec || null,
    horizon_years: args.input.horizonYears,
    client_type: args.input.clientType,
    cohort: args.input.cohort ?? "unknown",
    budget: args.input.budget || null,
    notes: args.input.notes || null,
    dossier: args.dossier,
    sources: args.sources,
    result: args.result,
    model: args.model,
    usage: args.usage,
  };

  if (supabase) {
    const { data, error } = await supabase.from("briefs").insert(row).select("id").single();
    if (error) throw new Error(`Could not save brief: ${error.message}`);
    return data.id as string;
  }

  const id = crypto.randomUUID();
  ensureDir();
  const record: BriefRecord = { id, created_at: new Date().toISOString(), ...row };
  fs.writeFileSync(fileFor(id), JSON.stringify(record, null, 2));
  return id;
}

export async function getBrief(id: string): Promise<BriefRecord | null> {
  if (supabase) {
    const { data, error } = await supabase.from("briefs").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Could not load brief: ${error.message}`);
    return (data as BriefRecord | null) ?? null;
  }
  try {
    return JSON.parse(fs.readFileSync(fileFor(id), "utf8")) as BriefRecord;
  } catch {
    return null;
  }
}

export async function listBriefs(limit = 50): Promise<Pick<BriefRecord, "id" | "created_at" | "house" | "bag" | "spec" | "horizon_years" | "result">[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("briefs")
      .select("id, created_at, house, bag, spec, horizon_years, result")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Could not list briefs: ${error.message}`);
    return (data ?? []) as Pick<BriefRecord, "id" | "created_at" | "house" | "bag" | "spec" | "horizon_years" | "result">[];
  }
  ensureDir();
  const records = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8")) as BriefRecord);
  return records.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

/** Answers written before this moment are never reused for a new question (they predate the latest rules and data corrections).
 *  Move it forward whenever the rules or a tracker correction change what an answer should say. Old answers still open by link. */
export const CACHE_EPOCH = Date.parse("2026-10-24T03:00:00Z");
