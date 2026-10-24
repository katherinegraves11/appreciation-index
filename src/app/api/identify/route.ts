import { checkSpend } from "@/lib/limits";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic";
import { hotList } from "@/lib/tracker";

export const runtime = "nodejs";
export const maxDuration = 60;

const FAST_MODEL = process.env.BAGINDEX_FAST_MODEL || "claude-sonnet-5";

const Identified = z.object({
  is_bag: z.boolean().describe("False if the picture is not a handbag, clutch, tote or similar."),
  house: z.string().describe("Brand, e.g. Chanel. Empty if unsure."),
  model: z.string().describe("Model line or family, e.g. Souplissimo, Birkin, Sardine, Coco Beach Clownfish Clutch. Empty if unsure."),
  spec: z.string().describe("Size, material, colour, hardware, era if visible, e.g. 'maxi, grained calfskin, dark brown, gold hardware'."),
  designer_era: z.string().describe("Who designed it if you can tell, e.g. 'Blazy era (2026)', 'Lagerfeld era', 'Daniel Lee era'. Empty if unsure."),
  confidence: z.enum(["high", "medium", "low"]),
  alternatives: z.array(z.string()).describe("Up to three other plausible house + model readings, most likely first."),
  tell: z.string().describe("One short sentence on what in the photo gave it away (hardware, quilting, weave, shape). Under 20 words."),
});

/** POST /api/identify { image: dataURL } → what bag this is, so the ask box can be filled from a photo. The image is read once and never stored. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { image?: string } | null;
  const m = body?.image?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!m) return Response.json({ error: "Send a JPEG, PNG or WebP photo." }, { status: 400 });
  const refused = checkSpend(req, "identify");
  if (refused) return Response.json({ error: refused }, { status: 429 });
  const [, mediaType, data] = m;
  if (data.length > 6_000_000) return Response.json({ error: "That photo is too large. Try a smaller one." }, { status: 413 });
  try {
    const res = await anthropic.messages.parse({
      model: FAST_MODEL,
      max_tokens: 600,
      output_config: { format: zodOutputFormat(Identified) },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data } },
          { type: "text", text: `Identify this luxury handbag: house, model line, and visible spec. Use the quilting, weave, hardware, clasp, strap and shape. Houses we track: Hermès, Chanel, Louis Vuitton, Dior, Gucci, Prada, Miu Miu, Fendi, Celine, Saint Laurent, Bottega Veneta, Loewe, Balenciaga, The Row, Alaïa, Ferragamo (others are fine too). Current designers: Blazy at Chanel (Souplissimo, Chanel 25, Coco Beach 2026, cheetah pony hair), Trotter at Bottega (Blazy's Bottega: Andiamo, Sardine, Kalimero, Hop; Lee's: Cassette, Jodie, Pouch), Anderson at Dior. Bags moving on resale right now, for context:\n${hotList()}\nIf it is a screenshot of a listing, the listing title may be visible: use it. Give your best single reading and up to three alternatives.` },
        ],
      }],
    });
    const out = res.parsed_output;
    if (!out) throw new Error("no parse");
    return Response.json(out);
  } catch (err) {
    console.error("[identify]", err instanceof Error ? err.message : err);
    return Response.json({ error: "Couldn't read that photo. Try a clearer shot of the whole bag." }, { status: 500 });
  }
}
