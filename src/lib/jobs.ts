import { parseQuestion } from "./parse";
import { runResearch } from "./research";
import { runScoring } from "./score";
import { saveBrief, listBriefs } from "./db";
import { MODEL } from "./anthropic";
import { quickNumbers } from "./tracker";

/**
 * A question runs as a server-side job, not inside the page's request. The page starts it, gets an id,
 * and polls; it can be closed, navigated away from, or reopened on another device and the work carries on.
 * Jobs live in process memory (plus the saved brief at the end), which is right for one laptop or one server.
 */
export type JobEvent = Record<string, unknown>;
export type Job = { id: string; question: string; horizon: number; created: number; done: boolean; events: JobEvent[] };

const store: Map<string, Job> = ((globalThis as unknown as { __aiJobs?: Map<string, Job> }).__aiJobs ??= new Map());

const friendly = (raw: string) =>
  /credit balance|billing/i.test(raw) ? "The research service is out of credit. Top up at console.anthropic.com and ask again."
  : /too_big|ZodError|Invalid|expected string|parse/i.test(raw) ? "I read your question but tripped on the details. Ask again in a slightly shorter form."
  : /overloaded|529|rate/i.test(raw) ? "The research service is busy. Try again in a minute."
  : "Something went wrong on our side. Ask again; if it repeats, tell Katie.";

export function getJob(id: string): Job | undefined { return store.get(id); }

export function startJob(question: string, horizon: number, fresh: boolean): Job {
  const id = crypto.randomUUID();
  const job: Job = { id, question, horizon, created: Date.now(), done: false, events: [] };
  store.set(id, job);
  // tidy: drop finished jobs older than a day
  for (const [k, j] of store) if (j.done && Date.now() - j.created > 86400000) store.delete(k);
  void run(job, fresh);
  return job;
}

async function run(job: Job, fresh: boolean) {
  const send = (e: JobEvent) => { job.events.push(e); };
  try {
    send({ status: "Reading your question…" });
    const parsed = await parseQuestion(job.question);
    if (!parsed.ok) { send({ clarification: parsed.clarification }); return; }
    const input = parsed.input;
    send({ parsed: { house: input.house, bag: input.bag, spec: input.spec || "" }, interpretation: parsed.interpretation, status: parsed.interpretation ? `${parsed.interpretation} Looking it up…` : `Looking up the ${input.house} ${input.bag}…` });
    if (!fresh) {
      const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const recent = (await listBriefs(80)).find((b) => norm(b.house) === norm(input.house) && norm(b.bag) === norm(input.bag) && Date.now() - new Date(b.created_at).getTime() < 7 * 86400000);
      if (recent) {
        send({ status: "We answered this recently. Showing that read…" });
        send({ done: true, id: recent.id, result: recent.result, input: { house: recent.house, bag: recent.bag, spec: recent.spec || "" }, numbers: quickNumbers(recent.house, recent.bag, recent.spec || undefined), cached: true, answered_at: recent.created_at });
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
    send({ done: true, id, result: scored.result, input: { house: input.house, bag: input.bag, spec: input.spec || "" }, numbers: quickNumbers(input.house, input.bag, input.spec || undefined) });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    console.error("[ask]", raw);
    send({ error: friendly(raw) });
  } finally {
    job.done = true;
  }
}
