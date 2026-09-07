import { BriefInput } from "@/lib/schema";
import { runResearch } from "@/lib/research";
import { runScoring } from "@/lib/score";
import { saveBrief } from "@/lib/db";
import { MODEL } from "@/lib/anthropic";

// Research with web search can take a few minutes. Vercel: Fluid Compute allows up to 300s.
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * POST /api/brief
 * Streams newline-delimited JSON progress events, ending with {"done":true,"id":"..."}.
 * Streaming keeps the connection alive through a long research turn.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = BriefInput.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Check the form: " + parsed.error.issues.map((i) => i.message).join("; ") }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const input = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        send({ status: "Researching resale, house, social, and supply-chain evidence…" });
        const research = await runResearch(input, (line) => send({ status: line }));
        send({ status: "Scoring the five layers…" });
        const scored = await runScoring(input, research.dossier);
        send({ status: "Saving the brief…" });
        const id = await saveBrief({
          input,
          dossier: research.dossier,
          sources: research.sources,
          result: scored.result,
          model: MODEL,
          usage: {
            input_tokens: research.usage.input_tokens + scored.usage.input_tokens,
            output_tokens: research.usage.output_tokens + scored.usage.output_tokens,
          },
        });
        send({ done: true, id });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        send({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
