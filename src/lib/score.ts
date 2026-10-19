import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODEL } from "./anthropic";
import { ANALYST_SYSTEM, COHORT_LABELS, LAYERS, SCORING_INSTRUCTIONS } from "./rubric";
import { BriefResult } from "./schema";
import type { BriefInput } from "./schema";
import type { BriefResult as BriefResultT } from "./schema";

/**
 * Step 2: turn the dossier into a scored, structured brief.
 * Structured outputs guarantee the JSON shape; we still re-check the composite math.
 */
export async function runScoring(input: BriefInput, dossier: string) {
  // Ask for the structured shape, but parse leniently: the model occasionally adds a sixth layer or a stray key,
  // and one bad key should not throw away a four-minute research turn. Unknown layers are dropped, then validated.
  const request = {
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text" as const, text: ANALYST_SYSTEM, cache_control: { type: "ephemeral" as const } }],
    thinking: { type: "adaptive" as const },
    output_config: { effort: "medium" as const, format: zodOutputFormat(BriefResult) },
    messages: [
      {
        role: "user" as const,
        content: `Bag: ${input.house} ${input.bag}${input.spec ? ` (${input.spec})` : ""}\n${input.questionType === "collection" ? `Question type: COLLECTION TIMING${input.season ? ` (${input.season})` : ""}. The client is choosing between pre-order now, buy in store at launch, or buy later on resale. Fill options.\n` : ""}Client: ${input.clientType}, cohort ${COHORT_LABELS[input.cohort ?? "unknown"]}, ${input.horizonYears}-year horizon${input.budget ? `, budget ${input.budget}` : ""}.\n\n${SCORING_INSTRUCTIONS}\n\n=== DOSSIER ===\n${dossier}`,
      },
    ],
  };
  const known = new Set(LAYERS.map((l) => l.key as string));
  const validIntents = new Set(["flip_1y", "hold_5y", "hold_10y", "wear"]);
  let parsed: BriefResultT | null = null;
  let usage = { input_tokens: 0, output_tokens: 0 };
  let lastError = "";
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const response = await anthropic.messages.create(request);
    usage = { input_tokens: usage.input_tokens + response.usage.input_tokens, output_tokens: usage.output_tokens + response.usage.output_tokens };
    if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    try {
      const raw = JSON.parse(text) as Record<string, unknown>;
      if (Array.isArray(raw.layers)) raw.layers = (raw.layers as { key?: string }[]).filter((l) => l && known.has(String(l.key)));
      if (Array.isArray(raw.signals)) raw.signals = (raw.signals as { intent?: string }[]).filter((x) => x && validIntents.has(String(x.intent)));
      const check = BriefResult.safeParse(raw);
      if (check.success) parsed = check.data;
      else lastError = check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  if (!parsed) throw new Error("Scoring returned an unreadable brief: " + lastError);

  // Clamp scores to 0-100 and make sure every layer is present, since the schema can't enforce it.
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const layers = LAYERS.map((l) => {
    const found = parsed.layers.find((x) => x.key === l.key);
    return found
      ? { ...found, score: clamp(found.score) }
      : { key: l.key, score: 0, summary: "No evidence found for this layer.", evidence: [{ text: "No evidence in dossier.", source: "n/a", url: "" }] };
  });

  // Recompute the composite from the weights so the number on the page is always the rubric's number.
  const totalWeight = LAYERS.reduce((s, l) => s + l.weight, 0);
  const composite = Math.round(
    LAYERS.reduce((sum, l) => {
      const layer = layers.find((x) => x.key === l.key);
      return sum + (layer ? layer.score * l.weight : 0);
    }, 0) / totalWeight,
  );

  return { result: { ...parsed, layers, composite }, usage };
}
