import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODEL } from "./anthropic";
import { ANALYST_SYSTEM, COHORT_LABELS, LAYERS, SCORING_INSTRUCTIONS } from "./rubric";
import { BriefResult } from "./schema";
import type { BriefInput } from "./schema";

/**
 * Step 2: turn the dossier into a scored, structured brief.
 * Structured outputs guarantee the JSON shape; we still re-check the composite math.
 */
export async function runScoring(input: BriefInput, dossier: string) {
  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: ANALYST_SYSTEM, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(BriefResult) },
    messages: [
      {
        role: "user",
        content: `Bag: ${input.house} ${input.bag}${input.spec ? ` (${input.spec})` : ""}\nClient: ${input.clientType}, cohort ${COHORT_LABELS[input.cohort ?? "unknown"]}, ${input.horizonYears}-year horizon${input.budget ? `, budget ${input.budget}` : ""}.\n\n${SCORING_INSTRUCTIONS}\n\n=== DOSSIER ===\n${dossier}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Scoring returned no structured output.");

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

  return {
    result: { ...parsed, layers, composite },
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}
