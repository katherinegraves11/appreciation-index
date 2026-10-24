import { dataFlow, bagTrend, forwardRead, TRACKED } from "@/lib/trends";

export const dynamic = "force-dynamic";

const sign = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "up" : "down"} ${Math.abs(Math.round(v))}%`);
const age = (d: number | null) => (d == null ? "not loaded" : d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`);

/** Trends: what culture and prices are saying so far, bag by bag, and whether the daily reads are arriving. */
export default function Trends() {
  const flow = dataFlow();
  const bags = TRACKED.map(([h, m]) => ({ ...bagTrend(h, m), fwd: forwardRead(h, m, null) })).filter((b) => b.term);
  const LEAN: Record<string, string> = { rising: "Up", cooling: "Down", mixed: "Mixed", steady: "Flat" };
  const rising = bags.filter((b) => (b.search?.yoyPct ?? 0) >= 25).sort((a, b) => (b.search!.yoyPct ?? 0) - (a.search!.yoyPct ?? 0));
  const falling = bags.filter((b) => (b.search?.yoyPct ?? 0) <= -15).sort((a, b) => (a.search!.yoyPct ?? 0) - (b.search!.yoyPct ?? 0));
  const linked = bags.filter((b) => b.auction?.plain);
  const late = flow.filter((f) => f.status === "stale" || f.status === "empty");
  return (
    <main>
      <section className="bookhead">
        <p className="lab">trends · updated every day</p>
        <h1 className="vh">Culture against <i>what people pay.</i></h1>
        <p className="hint">We line up what people search for against what buyers pay. A pattern is not proof, and we say when it could be chance.</p>
      </section>
      <div className="about">
        <h3 className="ah">What it says so far</h3>
        <div className="abox2">
          <div className="abox"><h4>Searches rising</h4><p>{rising.length ? rising.slice(0, 5).map((b) => `${b.house} ${b.model}, ${sign(b.search?.yoyPct)}`).join(" · ") : "Nothing up 25% or more on a year ago."}</p><p className="when">Last 13 weeks against the same weeks a year ago, US Google searches.</p></div>
          <div className="abox"><h4>Searches cooling</h4><p>{falling.length ? falling.slice(0, 5).map((b) => `${b.house} ${b.model}, ${sign(b.search?.yoyPct)}`).join(" · ") : "Nothing down 15% or more on a year ago."}</p><p className="when">Same measure. Searches are interest, not sales.</p></div>
          <div className="abox"><h4>Searches and auction prices</h4><p>{linked.length ? linked.map((b) => `${b.house} ${b.model}: ${b.auction!.plain}`).join(" ") : "Too few auction sales to say yet."}</p><p className="when">Hong Kong and Paris sales against US searches. A pattern, not a cause.</p></div>
          <div className="abox"><h4>Searches and resale</h4><p>Too early. Each daily read of The RealReal adds one day; we need eight before we say anything.</p><p className="when">Saves per listing are the read on what buyers will pay.</p></div>
        </div>

        <h3 className="ah">Bag by bag</h3>
        <div className="tablewrap"><table>
          <thead><tr><th>Bag</th><th>Looking ahead</th><th>Searches vs a year ago</th><th>Searches and auction prices</th></tr></thead>
          <tbody>{bags.map((b) => (
            <tr key={`${b.house} ${b.model}`}>
              <td><b>{b.house} {b.model}</b></td>
              <td>{b.fwd ? `${LEAN[b.fwd.lean]}${b.fwd.confidence === "low" ? ", early read" : ""}${b.fwd.nextBoutique ? `; boutique about $${b.fwd.nextBoutique.price.toLocaleString()} by ${b.fwd.nextBoutique.date}` : ""}` : "—"}</td>
              <td>{sign(b.search?.yoyPct)}</td>
              <td>{b.auction?.plain ?? (b.auction ? `Too early: ${b.auction.n} of ${b.auction.need} sales.` : "No auction sales yet.")}</td>
            </tr>
          ))}</tbody>
        </table></div>

        <h3 className="ah">Is the data arriving?</h3>
        <p className="asub">{late.length ? `${late.length} of ${flow.length} feeds are late. Trends grow only when the daily read runs.` : "Every feed is current."}</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Feed</th><th>Last read</th><th>Days read in the last month</th></tr></thead>
          <tbody>{flow.map((f) => <tr key={f.feed}><td>{f.feed}</td><td>{age(f.ageDays)}</td><td>{f.days30}</td></tr>)}</tbody>
        </table></div>

        <div className="abox2" style={{ marginTop: 24 }}>
          <div className="abox"><h4>How we check</h4><p>Do the two lines move together? We shuffle the data 2,000 times to see how often luck alone does as well. Under eight paired readings, we say nothing.</p></div>
          <div className="abox"><h4>What it is not</h4><p>Not a forecast, and not a cause. The boutique price is the only fixed price; every secondhand figure is an average. Resale history started in October 2026 and grows every day.</p></div>
        </div>
        <p className="asub" style={{ marginTop: 30, fontStyle: "italic" }}>Value-retention analysis of the US market, in dollars, based on public market data, not investment advice.</p>
      </div>
    </main>
  );
}
