import { tickerLines } from "@/lib/tracker";

/** The masthead ticker: what moved in the tracker, as counts and dates. Loops slowly; pauses on hover; sits still under reduced motion. */
export default function Ticker() {
  const lines = tickerLines();
  if (!lines.length) return null;
  const reel = [...lines, ...lines];
  return (
    <div className="ticker" aria-label="What moved today">
      <span className="lab tlab">what moved today</span>
      <div className="track">
        <div className="reel">{reel.map((l, i) => <span key={i} aria-hidden={i >= lines.length}>{l}<i>·</i></span>)}</div>
      </div>
    </div>
  );
}
