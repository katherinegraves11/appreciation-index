import { raceBoard } from "@/lib/tracker";
import RaceBoard from "@/components/RaceBoard";

export const dynamic = "force-dynamic";

export default function Race() {
  const rows = raceBoard();
  return (
    <main>
      <section className="bookhead">
        <p className="lab">the race · {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }).toLowerCase()}</p>
        <h1 className="vh">Where to put your money <i>this season.</i></h1>
        <p className="hint">If you buy to resell, this tells you three things: which houses <b>sell fast right now</b>, which <b>hold their value</b>, and which are <b>cooling off</b>.<br /><b>Up</b> = sells fast now (listings clear, many saves). <b>Right</b> = holds value: what it actually sold for, divided by what it costs new. From {rows.length} houses in the tracker, confirmed sales only.</p>
      </section>
      <RaceBoard rows={rows} />
    </main>
  );
}
