import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./anthropic";
import { BriefInput } from "./schema";

const FAST_MODEL = process.env.BAGINDEX_FAST_MODEL || "claude-sonnet-5";

const Parsed = z.object({
  understood: z.boolean().describe("True if the question names a specific luxury bag (house + model) we can research."),
  house: z.string().describe("Brand, e.g. Chanel. Empty if not understood."),
  bag: z.string().describe("Model line, e.g. Classic Flap, Souplissimo, Birkin 30. Empty if not understood."),
  spec: z.string().describe("Size, leather, colour, hardware if given; else empty."),
  horizonYears: z.union([z.literal(5), z.literal(10)]).describe("10 only if the question says ten years or long-term; else 5."),
  clientType: z.enum(["collector", "wearer", "stylist", "sourcer"]).describe("wearer unless the question says collecting, styling a client, or sourcing."),
  cohort: z.enum(["unknown", "gen_alpha", "gen_z", "millennial", "gen_x", "boomer"]),
  budget: z.string().describe("Budget if stated, else empty."),
  clarification: z.string().describe("If not understood: one friendly sentence asking which bag they mean. Else empty."),
});

/** Turn a plain-English question into the structured input the research pipeline needs. */
export async function parseQuestion(question: string) {
  const response = await anthropic.messages.parse({
    model: FAST_MODEL,
    max_tokens: 600,
    output_config: { format: zodOutputFormat(Parsed) },
    messages: [
      {
        role: "user",
        content: `A luxury-handbag client asked: "${question.slice(0, 600)}"\nExtract the bag they are asking about. Do not invent a bag; if there is no specific bag, set understood=false and write a clarification.`,
      },
    ],
  });
  const p = response.parsed_output;
  if (!p) throw new Error("Could not read the question.");
  if (!p.understood || !p.house || !p.bag) return { ok: false as const, clarification: p.clarification || "Which bag do you mean? Try a house and a model, like 'Chanel Souplissimo'." };
  const input = BriefInput.parse({
    house: p.house, bag: p.bag, spec: p.spec, horizonYears: p.horizonYears, clientType: p.clientType,
    cohort: p.cohort, budget: p.budget, notes: `Client's own words: ${question.slice(0, 500)}`,
  });
  return { ok: true as const, input };
}
