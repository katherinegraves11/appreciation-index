import Link from "next/link";
import BagPlate from "./BagPlate";
import type { BoardPiece } from "@/lib/tracker";

/**
 * The hero board. We keep no photographs, so the picture behind the question is the bag trade's own paper:
 * an engraved plate of the bag holding best, a receipt of what sold, a boutique window tag, a runway ticket,
 * a tracker clipping. Every piece is built from today's rows, so the board is different each day, and every
 * piece is a link into the tool. Shown on wide screens only; the phone gets the question alone.
 */
export default function Board({ pieces }: { pieces: BoardPiece[] }) {
  return (
    <div className="ephemera">
      {pieces.map((p) => {
        if (p.kind === "plate") return (
          <Link key={p.kind} href={p.href} className="piece plate-p">
            <span className="ptitle">{p.title}</span>
            <BagPlate name={p.name ?? p.title} size={120} />
            {p.lines.map((l, i) => <span key={i} className="pline">{l}</span>)}
          </Link>
        );
        if (p.kind === "receipt") return (
          <Link key={p.kind} href={p.href} className="piece receipt">
            <span className="ptitle">{p.title}</span>
            {p.lines.map((l, i) => { const [a, b] = l.split("|"); return <span key={i} className="pline row"><span>{a}</span><span>{b}</span></span>; })}
            <span className="pfoot">sold listings seen on The RealReal</span>
          </Link>
        );
        if (p.kind === "tag") return (
          <Link key={p.kind} href={p.href} className="piece tag">
            <span className="hole" aria-hidden="true" />
            <span className="ptitle">{p.title}</span>
            <span className="pbig">{p.lines[1]}</span>
            <span className="pline">{p.lines[0]}</span>
            <span className="pfoot">{p.lines[2]}</span>
          </Link>
        );
        if (p.kind === "ticket") return (
          <Link key={p.kind} href={p.href} className="piece ticket">
            <span className="ptitle">{p.title}</span>
            <span className="pline">{p.lines[0]}</span>
            <span className="pbig">{p.lines[1]}</span>
            <span className="pfoot">{p.lines[2]}</span>
          </Link>
        );
        return (
          <Link key={p.kind} href={p.href} className="piece clip">
            <span className="ptitle">{p.title}</span>
            <span className="pmid">{p.lines[0]}</span>
            <span className="pfoot">{p.lines[1]}</span>
          </Link>
        );
      })}
    </div>
  );
}
