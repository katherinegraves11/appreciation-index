import { parseQuestion } from "@/lib/parse";
import { runResearch } from "@/lib/research";
import { runScoring } from "@/lib/score";
import { saveBrief } from "@/lib/db";
import { MODEL } from "@/lib/anthropic";
import { quickNumbers } from "@/lib/tracker";

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
        send({ parsed: { house: input.house, bag: input.bag, spec: input.spec || "" }, interpretation: parsed.interpretation, status: parsed.interpretation ? `${parsed.interpretation} Looking it up…` : `Looking up the ${input.house} ${input.bag}…` });
        const research = await runResearch(input, (line) => send({ status: line }));
        send({ status: "Weighing it up…" });
        const scored = await runScoring(input, research.dossier);
        const id = await saveBrief({
          input, dossier: research.dossier, sources: research.sources, result: scored.result, model: MODEL,
          usage: { input_tokens: research.usage.input_tokens + scored.usage.input_tokens, output_tokens: research.usage.output_tokens + scored.usage.output_tokens },
        });
        send({ done: true, id, result: scored.result, input: { house: input.house, bag: input.bag, spec: input.spec || "" }, numbers: quickNumbers(input.house, input.bag) });
      } catch (err) {
        const raw = err instanceof Error ? err.message : "";
        console.error("[ask]", raw);
        const friendly = /credit balance|billing/i.test(raw) ? "The research service is out of credit. Top up at console.anthropic.com and ask again."
          : /too_big|ZodError|Invalid|expected string|parse/i.test(raw) ? "I read your question but tripped on the details. Ask again in a slightly shorter form, e.g. 'Louise Trotter's Bottega bags, worth pre-ordering?'"
          : /overloaded|529|rate/i.test(raw) ? "The research service is busy. Try again in a minute."
          : "Something went wrong on our side. Ask again; if it repeats, tell Katie.";
        send({ error: friendly });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
