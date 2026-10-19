import Anthropic from "@anthropic-ai/sdk";
import { anthropic, RESEARCH_MODEL } from "./anthropic";
import { ANALYST_SYSTEM, researchPrompt } from "./rubric";
import { buildTrackerDossier, buzzDossier, collectionDossier, ownershipDossier, pestelDossier } from "./tracker";
import type { BriefInput } from "./schema";

export type Source = { title: string; url: string };

export type ResearchOutput = {
  dossier: string;
  sources: Source[];
  usage: { input_tokens: number; output_tokens: number };
  trackerRows: number;
};

/**
 * Step 1: build the evidence dossier with Claude's server-side web search.
 * Streams so long research turns don't hit HTTP timeouts, and resumes on pause_turn.
 */
export async function runResearch(
  input: BriefInput,
  onProgress?: (line: string) => void,
): Promise<ResearchOutput> {
  const base = buildTrackerDossier(input.house, input.bag, input.spec || undefined);
  const isCollection = input.questionType === "collection" || /runway|pre-?order|collection|fashion week|just walked|spring 2027|ss27|resort 27/i.test(`${input.bag} ${input.spec ?? ""} ${input.notes ?? ""}`);
  const extras = [buzzDossier(input.house, input.bag), isCollection ? collectionDossier(input.house, input.season || undefined) : "", pestelDossier(input.house), ownershipDossier(input.house)].filter(Boolean).join("\n\n");
  const tracker = { ...base, text: [base.text, extras].filter(Boolean).join("\n\n"), available: base.available || !!extras };
  onProgress?.(tracker.available ? `Read ${tracker.rowCount} rows from the tracker…` : "Tracker not available; researching from the web…");
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: researchPrompt({
        ...input,
        spec: input.spec || undefined,
        budget: input.budget || undefined,
        notes: input.notes || undefined,
        trackerDossier: tracker.available ? tracker.text : undefined,
      }),
    },
  ];

  let dossier = "";
  const sources = new Map<string, Source>();
  const usage = { input_tokens: 0, output_tokens: 0 };
  let searches = 0;

  for (let round = 0; round < 2; round++) {
    const stream = anthropic.messages.stream({
      model: RESEARCH_MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: ANALYST_SYSTEM, cache_control: { type: "ephemeral" } }],
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 7 }],
      messages,
    });

    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
        searches += 1;
        onProgress?.(`Searching (${searches})…`);
      }
    });

    const message = await stream.finalMessage();
    usage.input_tokens += message.usage.input_tokens;
    usage.output_tokens += message.usage.output_tokens;

    for (const block of message.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.type === "web_search_result" && r.url && !sources.has(r.url)) {
            sources.set(r.url, { title: r.title || r.url, url: r.url });
          }
        }
      }
      if (block.type === "text") {
        dossier += block.text;
        for (const c of block.citations ?? []) {
          if (c.type === "web_search_result_location" && c.url && !sources.has(c.url)) {
            sources.set(c.url, { title: c.title || c.url, url: c.url });
          }
        }
      }
    }

    if (message.stop_reason === "refusal") {
      throw new Error("The model declined this request.");
    }
    if (message.stop_reason === "pause_turn") {
      // Server tool hit its iteration limit; append the turn and continue.
      messages.push({ role: "assistant", content: message.content });
      onProgress?.("Continuing research…");
      continue;
    }
    break;
  }

  if (!dossier.trim()) throw new Error("Research produced no dossier.");
  const full = tracker.available ? `${tracker.text}\n\n## WEB RESEARCH DOSSIER\n\n${dossier}` : dossier;
  return { dossier: full, sources: [...sources.values()], usage, trackerRows: tracker.rowCount };
}
