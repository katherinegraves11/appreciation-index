import type { BriefResult, EvidenceItem } from "./schema";

export type Card = {
  key: string;
  title: string;        // plain words, no jargon
  question: string;     // the question this card answers
  mood: "strong" | "mixed" | "weak";
  headline: string;     // one sentence
  soWhat?: string;      // what it means for the buyer, one short line
  more?: string;        // optional second paragraph
  evidence: EvidenceItem[];
  bullets?: string[];
};

const mood = (score: number): Card["mood"] => (score >= 70 ? "strong" : score >= 45 ? "mixed" : "weak");

/** Turn the dense brief into a handful of one-idea cards. Nothing here is new analysis; it is the brief, re-cut. */
export function toCards(r: BriefResult): Card[] {
  const L = (k: string) => r.layers.find((l) => l.key === k);
  const resale = L("resale"), house = L("house"), creative = L("creative"), social = L("social"), macro = L("macro");
  const cards: Card[] = [];
  if (resale) cards.push({ key: "money", title: "The money", question: "What does it cost new, and what does resale pay?", mood: mood(resale.score), headline: resale.summary, soWhat: resale.so_what, evidence: resale.evidence });
  if (creative) cards.push({ key: "designer", title: "The designer", question: "Who made it, and does that era matter?", mood: mood(creative.score), headline: creative.summary, soWhat: creative.so_what, evidence: creative.evidence });
  if (social) cards.push({ key: "culture", title: "The culture", question: "Is it having a moment, and is it lasting?", mood: mood(social.score), headline: social.summary, soWhat: social.so_what, more: r.social_read, evidence: social.evidence });
  if (house) cards.push({ key: "business", title: "The business", question: "Is the house stable? Who owns it? Can it make enough?", mood: mood(house.score), headline: house.summary, soWhat: house.so_what, more: r.ownership_and_supply_read, evidence: house.evidence });
  if (macro) cards.push({ key: "world", title: "The big picture", question: "Tariffs, currencies, the luxury mood.", mood: mood(macro.score), headline: macro.summary, soWhat: macro.so_what, evidence: macro.evidence });
  if (r.spec_guidance?.length) cards.push({ key: "buy", title: "If you buy", question: "Which version holds best.", mood: "mixed", headline: r.spec_guidance[0], bullets: r.spec_guidance.slice(1), evidence: [] });
  return cards;
}

export const CALL_WORDS: Record<string, string> = {
  "Core Hold": "Buy it. It should hold.",
  "Selective": "Buy carefully. The version matters.",
  "Watch": "Wait. The signal isn't clear yet.",
  "Wear, Don't Bank": "Buy it to wear, not to hold value.",
};


export const INTENT_LABEL: Record<string, { title: string; sub: string }> = {
  flip_1y: { title: "Resell within a year?", sub: "If you sold it within a year" },
  hold_5y: { title: "Hold five years?", sub: "If you kept it about five years" },
  hold_10y: { title: "Keep ten years?", sub: "If you kept it ten years or more" },
  wear: { title: "Just to wear?", sub: "If you bought it to use" },
};
export const VERDICT_WORD: Record<string, string> = { yes: "Yes", no: "No", wait: "Not yet" };

/** Signals for the four intents. Older briefs have none; derive a cautious set from the call so the page never shows a gap. */
export function toSignals(r: BriefResult) {
  if (Array.isArray(r.signals) && r.signals.length) return r.signals;
  const c = r.call;
  const v5 = c === "Core Hold" ? "yes" : c === "Selective" ? "wait" : c === "Watch" ? "wait" : "no";
  return [
    { intent: "flip_1y", verdict: "no", why: "No realised sales above retail in this brief; asking prices are not sales." },
    { intent: "hold_5y", verdict: v5, why: r.one_line },
    { intent: "hold_10y", verdict: c === "Core Hold" ? "wait" : "no", why: "Ten years needs a documented multi-year price path; this brief does not have one." },
    { intent: "wear", verdict: "yes", why: "Nothing in the evidence argues against buying it to use." },
  ] as const;
}
