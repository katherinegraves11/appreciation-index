import { dataFlow, bagTrend, TRACKED } from "@/lib/trends";

export const dynamic = "force-dynamic";

const sign = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v)}%`);
const STATUS: Record<string, string> = { daily: "arriving daily", regular: "arriving most weeks", irregular: "irregular", stale: "stale, no new read in 3 days", empty: "not loaded" };

/** Trends: is the data arriving, and what it says when culture is lined up against willingness to pay and sales. */
export default function Trends() {
  const flow = dataFlow();
  const bags = TRACKED.map(([h, m]) => bagTrend(h, m)).filter((b) => b.term);
  return (
    <main>
      <section className="bookhead">
        <p className="lab">trends · updated every day</p>
        <h1 className="vh">Culture against <i>what people pay.</i></h1>
        <p className="hint">Each day we line up what people search for against what buyers are willing to pay and what actually sells. A link is shown only when there are enough readings to measure it; until then it says <b>collecting</b>. A link is a pattern, never proof of cause.</p>
      </section>
      <div className="about">
        <h3 className="ah">Is the data arriving?</h3>
        <div className="tablewrap"><table>
          <thead><tr><th>Feed</th><th>Last read</th><th>Days read, last 30</th><th>Rows, last 7 days</th><th>Status</th></tr></thead>
          <tbody>{flow.map((f) => <tr key={f.feed}><td>{f.feed}</td><td>{f.last ?? "—"}</td><td>{f.days30}</td><td>{f.rows7.toLocaleString()}</td><td>{STATUS[f.status]}</td></tr>)}</tbody>
        </table></div>

        <h3 className="ah">Bag by bag</h3>
        <p className="asub">Searches: US Google interest, each bag scaled to its own five-year peak. Auctions: hammer price against the middle of the estimate, so currencies cancel out. The RealReal: saves per listing as the read on willingness to pay.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Bag</th><th>Searches vs a year ago</th><th>vs five-year average</th><th>Searches and auction prices</th><th>Searches and The RealReal</th></tr></thead>
          <tbody>{bags.map((b) => (
            <tr key={`${b.house} ${b.model}`}>
              <td><b>{b.house} {b.model}</b></td>
              <td>{sign(b.search?.yoyPct)}</td>
              <td>{sign(b.search?.vsFiveYearPct)}</td>
              <td>{b.auction ? (b.auction.rho == null ? b.auction.read : `${b.auction.read.split(" (")[0]}, ${b.auction.n} lots${b.auction.p != null && b.auction.p >= 0.05 ? ", could be chance" : ""}`) : "No auction lots yet."}</td>
              <td>{b.resale ? `Collecting: ${b.resale.n} of ${b.resale.need} reads` : "No reads yet."}</td>
            </tr>
          ))}</tbody>
        </table></div>

        <div className="abox2" style={{ marginTop: 24 }}>
          <div className="abox"><h4>What a link means</h4><p>A rank correlation between two lines. We also shuffle the data two thousand times and say how often chance alone matches it. Below eight paired readings we do not report one.</p></div>
          <div className="abox"><h4>What it does not mean</h4><p>Not a forecast and not a cause. Search history is US interest; auctions are often in Hong Kong or Paris. Resale history started in October 2026 and grows with every daily read.</p></div>
        </div>
        <p className="asub" style={{ marginTop: 30, fontStyle: "italic" }}>Value-retention analysis of the US market, in dollars, based on public market data, not investment advice.</p>
      </div>
    </main>
  );
}
