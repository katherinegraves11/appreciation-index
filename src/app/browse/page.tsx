import Link from "next/link";
import BagPlate from "@/components/BagPlate";
import { catalogue } from "@/lib/tracker";

export const dynamic = "force-dynamic";

/** Browse: every bag the tracker prices, drawn, grouped by house. Tap one and the tool asks about it. */
export default function Browse() {
  const rows = catalogue();
  const houses = Array.from(new Set(rows.map((r) => r.house)));
  return (
    <main>
      <section className="bookhead">
        <p className="lab">browse · {rows.length} bags we price</p>
        <h1 className="vh">Pick a bag <i>by sight.</i></h1>
        <p className="hint">Drawn, not photographed: the plates are ours. Tap any bag to ask about it. The numbers are today&apos;s boutique price and, where we have confirmed sales, what it actually sold for against that price.</p>
      </section>
      {houses.map((h) => (
        <section key={h} className="shelf">
          <h2 className="shelfh">{h}</h2>
          <div className="shelfrow">
            {rows.filter((r) => r.house === h).map((r) => (
              <Link key={`${r.house}-${r.model}`} href={`/?q=${encodeURIComponent(`Is the ${r.house} ${r.model} worth buying right now?`)}`} className="shelfitem">
                <BagPlate name={`${r.house} ${r.model}`} size={110} />
                <span className="sname">{r.model}</span>
                <span className="sprice">{r.retail_now ? `$${Math.round(r.retail_now).toLocaleString()} new` : "price pending"}</span>
                {r.sold_pct != null && <span className={`sret ${r.sold_pct >= 85 ? "good" : r.sold_pct < 45 ? "weak" : ""}`}>sold at {Math.round(r.sold_pct)}%</span>}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
