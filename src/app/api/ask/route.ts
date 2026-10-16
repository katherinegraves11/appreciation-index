import { parseQuestion } from "@/lib/parse";
import { runResearch } from "@/lib/research";
import { runScoring } from "@/lib/score";
import { saveBrief } from "@/lib/db";
import { MODEL } from "@/lib/anthropic";

export const maxDuration = 300;
export const runtime = "nodejs";

/** POST /api/ask {question} → NDJSON: {status} … {parsed} … {done, id, result} */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { question?: string } | null;
  const question = (body?.question ?? "").trim();
  if (question.length < 3) return new Response(JSON.stringify({ error: "Ask about a bag." }), { status: 400, headers: { "content-type": "application/json" } });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        send({ status: "Reading your question…" });
        const parsed = await parseQuestion(question);
        if (!parsed.ok) { send({ clarification: parsed.clarification }); return; }
        const input = parsed.input;
        send({ parsed: { house: input.house, bag: input.bag, spec: input.spec || "" }, status: `Looking up the ${input.house} ${input.bag}…` });
        const research = await runResearch(input, (line) => send({ status: line }));
        send({ status: "Weighing it up…" });
        const scored = await runScoring(input, research.dossier);
        const id = await saveBrief({
          input, dossier: research.dossier, sources: research.sources, result: scored.result, model: MODEL,
          usage: { input_tokens: research.usage.input_tokens + scored.usage.input_tokens, output_tokens: research.usage.output_tokens + scored.usage.output_tokens },
        });
        send({ done: true, id, result: scored.result, input: { house: input.house, bag: input.bag, spec: input.spec || "" } });
      } catch (err) {
        send({ error: err instanceof Error ? err.message : "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
