import { coveredHouse, NOT_COVERED } from "@/lib/houses";
import { checkSpend } from "@/lib/limits";
import { parseQuestion } from "@/lib/parse";
import { runResearch } from "@/lib/research";
import { runScoring } from "@/lib/score";
import { saveBrief } from "@/lib/db";
import { MODEL } from "@/lib/anthropic";
import { quickNumbers } from "@/lib/tracker";
import { listBriefs, CACHE_EPOCH } from "@/lib/db";
import { getJob, startJob } from "@/lib/jobs";

export const maxDuration = 300;
export const runtime = "nodejs";

/** GET /api/ask?job=<id>&since=<n> → { done, events: [...after n] } so the page can leave and come back. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const job = getJob(u.searchParams.get("job") ?? "");
  if (!job) return Response.json({ error: "That question is no longer running. If it finished, it is under My bags." }, { status: 404 });
  const since = Number(u.searchParams.get("since") ?? 0) || 0;
  return Response.json({ done: job.done, question: job.question, horizon: job.horizon, events: job.events.slice(since), total: job.events.length });
}

/** POST /api/ask {question} → { job } (the work runs server-side; poll with GET). With ?stream=1: NDJSON stream, for scripts. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { question?: string; horizon?: number; fresh?: boolean } | null;
  const fresh = !!body?.fresh || /\b(fresh|again|update|latest|re-?run|refresh)\b/i.test(body?.question ?? "");
  const question = (body?.question ?? "").trim();
  if (question.length < 3) return new Response(JSON.stringify({ error: "Ask about a bag." }), { status: 400, headers: { "content-type": "application/json" } });
  if (question.length > 1200) return Response.json({ error: "That's a long question. Ask it in a few sentences." }, { status: 413 });
  const refused = checkSpend(req, "ask");
  if (refused) return Response.json({ error: refused }, { status: 429 });
  if (new URL(req.url).searchParams.get("stream") !== "1") {
    const job = startJob(question, Number(body?.horizon ?? 1) || 1, fresh);
    return Response.json({ job: job.id });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        send({ status: "Reading your question…" });
        const parsed = await parseQuestion(question);
        if (!parsed.ok) { send({ clarification: parsed.clarification }); return; }
        const input = parsed.input;
        if (!coveredHouse(input.house)) { send({ clarification: NOT_COVERED(input.house || "that house") }); return; }
        send({ parsed: { house: input.house, bag: input.bag, spec: input.spec || "" }, interpretation: parsed.interpretation, status: parsed.interpretation ? `${parsed.interpretation} Looking it up…` : `Looking up the ${input.house} ${input.bag}…` });
        if (!fresh) {
          const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
          const recent = (await listBriefs(80)).find((b) => norm(b.house) === norm(input.house) && norm(b.bag) === norm(input.bag) && norm(b.spec || "") === norm(input.spec || "") && Date.now() - new Date(b.created_at).getTime() < 7 * 86400000 && new Date(b.created_at).getTime() >= CACHE_EPOCH);
          if (recent) {
            send({ status: "We answered this recently. Showing that read…" });
            send({ done: true, id: recent.id, result: recent.result, input: { house: recent.house, bag: recent.bag, spec: recent.spec || "" }, numbers: quickNumbers(recent.house, recent.bag, recent.spec || undefined, question), cached: true, answered_at: recent.created_at });
            return;
          }
        }
        const t1 = Date.now();
        const research = await runResearch(input, (line) => send({ status: line }));
        const t2 = Date.now();
        send({ status: "Weighing it up…" });
        const scored = await runScoring(input, research.dossier);
        console.log(`[ask] ${input.house} ${input.bag}: research ${Math.round((t2 - t1) / 1000)}s, scoring ${Math.round((Date.now() - t2) / 1000)}s`);
        const id = await saveBrief({
          input, dossier: research.dossier, sources: research.sources, result: scored.result, model: MODEL,
          usage: { input_tokens: research.usage.input_tokens + scored.usage.input_tokens, output_tokens: research.usage.output_tokens + scored.usage.output_tokens },
        });
        send({ done: true, id, result: scored.result, input: { house: input.house, bag: input.bag, spec: input.spec || "" }, numbers: quickNumbers(input.house, input.bag, input.spec || undefined, question) });
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
