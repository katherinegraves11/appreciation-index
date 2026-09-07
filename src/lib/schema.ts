import { z } from "zod";
import { CALLS, LAYERS } from "./rubric";

const layerKeys = LAYERS.map((l) => l.key) as [string, ...string[]];

export const EvidenceItem = z.object({
  text: z.string().describe("One factual sentence with the date it refers to."),
  source: z.string().describe("Publisher name, e.g. 'Sotheby's' or 'Rebag Clair Report 2025'."),
  url: z.string().describe("Source URL from the dossier, or empty string if none."),
});

export const LayerScore = z.object({
  key: z.enum(layerKeys),
  score: z.number().int().describe("0 to 100."),
  summary: z.string().describe("One sentence on why this score."),
  evidence: z.array(EvidenceItem).describe("One to six items."),
});

export const BriefResult = z.object({
  call: z.enum(CALLS),
  confidence: z.enum(["High", "Medium", "Low"]),
  one_line: z.string().describe("The call in plain English for a client, one sentence."),
  composite: z.number().int().describe("Weighted average of the layer scores, 0 to 100."),
  layers: z.array(LayerScore).describe("Exactly one entry per layer key."),
  bull_case: z.array(z.string()).describe("One to five points."),
  bear_case: z.array(z.string()).describe("One to five points."),
  what_would_change_this: z.array(z.string()).describe("One to five points."),
  spec_guidance: z
    .array(z.string())
    .describe("Size, leather, color, hardware guidance the data supports."),
  social_read: z
    .string()
    .describe("Two or three sentences on the TikTok / Instagram / Pinterest picture and whether search confirms it."),
  ownership_and_supply_read: z
    .string()
    .describe("Two or three sentences on ownership, M&A, and supply-chain facts that bear on scarcity and stability."),
  unverified: z.array(z.string()).describe("Claims that could not be verified and were excluded from scoring."),
  disclaimer: z.string(),
});

export type BriefResult = z.infer<typeof BriefResult>;
export type EvidenceItem = z.infer<typeof EvidenceItem>;

export const BriefInput = z.object({
  house: z.string().trim().min(1).max(80),
  bag: z.string().trim().min(1).max(120),
  spec: z.string().trim().max(200).optional().or(z.literal("")),
  horizonYears: z.union([z.literal(5), z.literal(10)]),
  clientType: z.enum(["collector", "wearer", "stylist", "sourcer"]),
  cohort: z.enum(["unknown", "gen_alpha", "gen_z", "millennial", "gen_x", "boomer"]).default("unknown"),
  budget: z.string().trim().max(60).optional().or(z.literal("")),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
});
export type BriefInput = z.infer<typeof BriefInput>;
