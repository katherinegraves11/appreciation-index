import type { BriefResult, EvidenceItem } from "./schema";

export type Card = {
  key: string;
  title: string;        // plain words, no jargon
  question: string;     // the question this card answers
  mood: "strong" | "mixed" | "weak";
  headline: string;     // one sentence
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
  if (resale) cards.push({ key: "money", title: "The money", question: "What does it cost new, and what does resale pay?", mood: mood(resale.score), headline: resale.summary, evidence: resale.evidence });
  if (creative) cards.push({ key: "designer", title: "The designer", question: "Who made it, and does that era matter?", mood: mood(creative.score), headline: creative.summary, evidence: creative.evidence });
  if (social) cards.push({ key: "culture", title: "The culture", question: "Is it having a moment, and is it lasting?", mood: mood(social.score), headline: social.summary, more: r.social_read, evidence: social.evidence });
  if (house) cards.push({ key: "business", title: "The business", question: "Is the house stable? Who owns it? Can it make enough?", mood: mood(house.score), headline: house.summary, more: r.ownership_and_supply_read, evidence: house.evidence });
  if (macro) cards.push({ key: "world", title: "The big picture", question: "Tariffs, currencies, the luxury mood.", mood: mood(macro.score), headline: macro.summary, evidence: macro.evidence });
  if (r.spec_guidance?.length) cards.push({ key: "buy", title: "If you buy", question: "Which version holds best.", mood: "mixed", headline: r.spec_guidance[0], bullets: r.spec_guidance.slice(1), evidence: [] });
  return cards;
}

export const CALL_WORDS: Record<string, string> = {
  "Core Hold": "Buy it. It should hold.",
  "Selective": "Buy carefully. The version matters.",
  "Watch": "Wait. The signal isn't clear yet.",
  "Wear, Don't Bank": "Buy it to wear, not to hold value.",
};
