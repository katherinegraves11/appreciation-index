import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./anthropic";
import { BriefInput } from "./schema";
import { hotList } from "./tracker";

const FAST_MODEL = process.env.BAGINDEX_FAST_MODEL || "claude-sonnet-5";

const Parsed = z.object({
  understood: z.boolean().describe("True if the question names something we can research: a specific bag (house + model), OR a family of bags defined by a designer era, collection, material or finish (e.g. 'Blazy\'s pony hair bags' = Chanel, Métiers d\'Art Paris–New York 2026 cheetah pony-hair pieces). Only false when no house or designer can be inferred at all."),
  house: z.string().describe("Brand, e.g. Chanel. Empty if not understood."),
  bag: z.string().describe("Model line (Classic Flap, Souplissimo, Birkin 30) OR the family in plain words when the question is about a group (e.g. 'Métiers d\'Art 2026 pony hair pieces', 'Blazy-era bags', 'Philo-era Celine bags'). Empty if not understood."),
  spec: z.string().describe("Size, leather, colour, hardware, finish or collection if given (e.g. 'cheetah-print pony hair; Mini 25 hobo, medium flap, bucket bag, clutch, 31 shopping bag'); else empty."),
  horizonYears: z.union([z.literal(5), z.literal(10)]).describe("10 only if the question says ten years or long-term; else 5."),
  clientType: z.enum(["collector", "wearer", "stylist", "sourcer"]).describe("wearer unless the question says collecting, styling a client, or sourcing."),
  cohort: z.enum(["unknown", "gen_alpha", "gen_z", "millennial", "gen_x", "boomer"]),
  budget: z.string().describe("Budget if stated, else empty."),
  clarification: z.string().describe("If not understood: one friendly sentence asking which bag they mean. Else empty."),
  interpretation: z.string().describe("One short sentence telling the client how you read their question, e.g. 'Reading that as the Chanel Métiers d\'Art 2026 cheetah pony-hair Mini 25.' Empty if not understood."),
});

/** Turn a plain-English question into the structured input the research pipeline needs. */
export async function parseQuestion(question: string) {
  const hot = hotList();
  const response = await anthropic.messages.parse({
    model: FAST_MODEL,
    max_tokens: 600,
    output_config: { format: zodOutputFormat(Parsed) },
    messages: [
      {
        role: "user",
        content: `A luxury-handbag client asked: "${question.slice(0, 600)}"\nExtract what they are asking about. Designer hints: Matthieu Blazy = Chanel from Dec 2024 (debut Spring 2026, Oct 2025; Métiers d\'Art Paris–New York Dec 2025 with cheetah pony-hair pieces), and Bottega Veneta 2021–2025 before that. Jonathan Anderson = Dior from 2025, Loewe 2013–2025. Pieter Mulier = Alaïa 2021–2026. Phoebe Philo = Celine 2008–2017. Virginie Viard = Chanel 2019–2024. A question about a designer\'s bags, a material, a finish or a collection is a valid family question: fill house, put the family in bag, list the known pieces in spec. Clients often describe a bag loosely ("the pony hair bag that came out that\'s selling for crazy", "the new Chanel everyone has", "the Alaïa with the long strap"). Resolve such phrases using this list of what is moving on resale right now (from our tracker, most-saved and most-sold first):\n${hot}\nPick the best match, say so in interpretation, and only set understood=false when no house or designer can be inferred.`,
      },
    ],
  });
  const p = response.parsed_output;
  if (!p) throw new Error("Could not read the question.");
  if (!p.understood || !p.house || !p.bag) return { ok: false as const, clarification: p.clarification || "Which bag do you mean? A house and a model, or just describe it: 'the new pony hair Chanel'." };
  const input = BriefInput.parse({
    house: p.house, bag: p.bag, spec: p.spec, horizonYears: p.horizonYears, clientType: p.clientType,
    cohort: p.cohort, budget: p.budget, notes: `Client's own words: ${question.slice(0, 500)}`,
  });
  return { ok: true as const, input, interpretation: p.interpretation || "" };
}
