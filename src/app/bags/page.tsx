import Link from "next/link";
import { cookies, headers } from "next/headers";
import { listBriefs } from "@/lib/db";
import { quickNumbers } from "@/lib/tracker";
import SellSun, { SUN, sunPhase } from "@/components/SellSun";
import BagCondition from "@/components/BagCondition";

/** What each condition sells for against "Excellent", measured on 2026-10-23 from sold listings on The RealReal in the tracker
 *  (same model, pooled; Hermès separately). All houses: n = 156 / 878 / 1,615 / 882 / 187. Hermès: n = 65 / 217 / 244 / 139 / 36. */
const COND_ALL: Record<string, number> = { P: 1.11, E: 1, VG: 0.82, G: 0.615, F: 0.47 };
const COND_HERMES: Record<string, number> = { P: 1.24, E: 1, VG: 0.81, G: 0.63, F: 0.48 };
import BagPlate from "@/components/BagPlate";
import { toSignals } from "@/lib/cards";

export const dynamic = "force-dynamic";

/** Keep card titles to two lines: strip parentheses and cut at four words; the full name shows underneath. */
function shortName(bag: string): string {
  const base = bag.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const words = base.split(" ");
  const cut = base.length > 24 ? 3 : 4;
  return words.length > cut ? words.slice(0, cut).join(" ") : base;
}

const W: Record<string, string> = { yes: "Yes", no: "No", wait: "Not yet" };

/** My bags: only the bags you marked "I'm buying it", with what you paid and when (kept on this device until there is sign-in). */
export default async function Bags() {
  const bought = new Map(((await cookies()).get("bought")?.value ?? "").split(",").filter(Boolean).map((e) => { const [id, price, date, cond] = e.split(":"); return [id, { price: Number(price), date, cond: cond || "E" }] as const; }));
  void headers;
  const rows = bought.size ? (await listBriefs(300)).filter((b) => bought.has(b.id)) : [];
  const money = (v: number) => `$${Math.round(v).toLocaleString()}`;
  return (
    <main>
      <section className="bookhead">
        <p className="lab">my bags · {rows.length} {rows.length === 1 ? "bag" : "bags"}</p>
        <h1 className="vh">The bags <i>you bought.</i></h1>
        <p className="hint">When you decide to buy a bag, tap &ldquo;I&apos;m buying it&rdquo; on its answer and add what you paid. It lands here.</p>
      </section>
      <div className="bags">
        {rows.map((b) => {
          const sig = toSignals(b.result);
          const paid = bought.get(b.id)?.price ?? 0;
          const nn = (() => { try { return quickNumbers(b.house, b.bag, b.spec || undefined); } catch { return null; } })();
          const cond = bought.get(b.id)?.cond ?? "E";
          const f = (/herm/i.test(b.house) ? COND_HERMES : COND_ALL)[cond] ?? 1;
          const band = nn?.paths ? { lo: Math.round(nn.paths.band.lo * f), mid: Math.round(nn.paths.band.mid * f), hi: Math.round(nn.paths.band.hi * f) } : null;
          const worth = band?.mid ?? null;
          const keepNow = worth ? Math.round(worth * (worth >= 10000 ? 0.85 : worth >= 5000 ? 0.8 : worth >= 2500 ? 0.75 : 0.7)) : null;
          const gainPct = keepNow && paid ? Math.round(((keepNow - paid) / paid) * 100) : null;
          const phase = sunPhase(gainPct, nn?.forward?.signals.length ? nn.forward.lean : null);
          return (
            <div key={b.id} className="bag">
              <div className="bag-top">
                <div><p className="lab">bought {bought.get(b.id)?.date ? new Date(`${bought.get(b.id)!.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""} · paid {money(bought.get(b.id)?.price ?? 0)}</p><h3>{b.house} <i>{shortName(b.bag)}</i></h3>{shortName(b.bag) !== b.bag && <p className="spec">{b.bag}</p>}</div>
                <span className="tag">{b.result.call}</span><BagPlate name={`${b.house} ${b.bag}`} size={72} className="cplate" />
              </div>
              <BagCondition id={b.id} current={cond} />
              <div className={`sunrow ${phase}`}><SellSun phase={phase} id={b.id.slice(0, 8)} /><div><p className="sunword">{SUN[phase].word}</p><p className="sunline">{SUN[phase].line}{keepNow && nn?.paths && band ? ` Today ${nn.paths.basis === "same-material asks" ? "sellers ask about" : "it would sell for about"} ${band.lo === band.hi ? money(band.mid) : `${money(band.lo)} to ${money(band.hi)}`}${f !== 1 ? ` in this condition (${f > 1 ? `${Math.round((f - 1) * 100)}% more` : `${Math.round((1 - f) * 100)}% less`} than carried with care, from sold listings on The RealReal)` : ""}; in the middle of that, after fees, you would keep ${gainPct! >= 0 ? `${gainPct}% more` : `${Math.abs(gainPct!)}% less`} than the ${money(paid)} you paid.` : ""} A read on today&apos;s numbers, not a promise.</p></div></div>
              <p className="line">{(b.result.plain_answer || b.result.one_line || "").replace(/\s*\[\[ask-link\]\]/g, "")}</p>
              <ul className="mini">
                {sig.map((s) => <li key={s.intent} className={s.verdict}><b>{W[s.verdict]}</b><span>{s.intent === "flip_1y" ? "sell in a year" : s.intent === "hold_5y" ? "hold 5" : s.intent === "hold_10y" ? "keep 10" : "wear"}</span></li>)}
              </ul>
              {b.result.timing && <p className="meta">{b.result.timing.replace(/\s*\[\[ask-link\]\]/g, "")}</p>}
            <p className="openit"><Link href={`/?brief=${b.id}`}>open the answer</Link></p>
            </div>
          );
        })}
        {rows.length === 0 && <p className="hint center">Nothing here yet.</p>}
      </div>
    </main>
  );
}
