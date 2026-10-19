import Link from "next/link";
import { listBriefs } from "@/lib/db";
import { toSignals } from "@/lib/cards";

export const dynamic = "force-dynamic";

const W: Record<string, string> = { yes: "Buy", no: "Don't", wait: "Wait" };

/** My bags: every bag the book has answered on, newest first. (A per-user closet with owned / watching comes with sign-in.) */
export default async function Bags() {
  const briefs = await listBriefs();
  const seen = new Set<string>();
  const rows = briefs.filter((b) => { const k = `${b.house}|${b.bag}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return (
    <main>
      <section className="bookhead">
        <p className="lab">my bags · {rows.length} answered</p>
        <h1 className="vh"><span className="h1txt">What needs a decision <i>this month.</i></span><span className="h5h10txt">What to <i>simply keep.</i></span></h2>
        <p className="hint">Every bag you have asked about, with its four signals. Ask about a new one from the home page.</p>
      </section>
      <div className="bags">
        {rows.map((b) => {
          const sig = toSignals(b.result);
          return (
            <Link key={b.id} href={`/?brief=${b.id}`} className="bag">
              <div className="bag-top">
                <div><p className="lab">{new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p><h3>{b.house} <i>{b.bag}</i></h3></div>
                <span className="tag">{b.result.call}</span>
              </div>
              <p className="line">{b.result.plain_answer || b.result.one_line}</p>
              <ul className="mini">
                {sig.map((s) => <li key={s.intent} className={s.verdict}><b>{W[s.verdict]}</b><span>{s.intent === "flip_1y" ? "sell in a year" : s.intent === "hold_5y" ? "hold 5" : s.intent === "hold_10y" ? "keep 10" : "wear"}</span></li>)}
              </ul>
              {b.result.timing && <p className="meta">{b.result.timing}</p>}
            </Link>
          );
        })}
        {rows.length === 0 && <p className="hint center">Nothing yet. Ask about a bag and it appears here.</p>}
      </div>
    </main>
  );
}
