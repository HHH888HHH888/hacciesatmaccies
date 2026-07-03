/* ============================================================
   HAXAX — Scoring engine

   Transparent, weighted, fully decomposable. The headline Haxax
   Score is exactly the weighted sum of the eleven sub-factors, so
   the breakdown shown in the UI always reconciles to the total.
   ============================================================ */

import type { ScoreFactor, SuggestedAction } from "./types";

export interface FactorDef {
  key: string;
  label: string;
  weight: number; // 0..1, weights sum to 1
  hint: string;
}

export const FACTOR_DEFS: FactorDef[] = [
  { key: "age", label: "Age of tenement", weight: 0.07, hint: "Older granted ground often signals overlooked, de-risked title." },
  { key: "expiry", label: "Time to expiry", weight: 0.1, hint: "Near-term expiry creates acquisition leverage and forced events." },
  { key: "commodity", label: "Commodity relevance", weight: 0.13, hint: "Alignment with current demand cycle and price strength." },
  { key: "nearbyMines", label: "Nearby producing mines", weight: 0.13, hint: "Proximity to operating mills and mines lowers development risk." },
  { key: "drilling", label: "Historic drilling presence", weight: 0.1, hint: "Prior drilling implies known mineralisation and reduced spend." },
  { key: "prospectivity", label: "Geological prospectivity", weight: 0.14, hint: "Favourable host rocks, structure and known mineral systems." },
  { key: "adjacency", label: "Adjacency to known projects", weight: 0.11, hint: "Strategic value to neighbours; consolidation / takeover optionality." },
  { key: "ownership", label: "Ownership complexity", weight: 0.07, hint: "Clean, single-party title is faster and cheaper to transact." },
  { key: "encumbrance", label: "Encumbrance / royalty load", weight: 0.05, hint: "Royalties, NSRs and caveats erode acquirer economics." },
  { key: "activity", label: "Recent local activity", weight: 0.06, hint: "Neighbouring exploration, raisings and corporate moves." },
  { key: "data", label: "Data completeness", weight: 0.04, hint: "Coverage and recency of records underpinning the rating." },
];

export const FACTOR_DEF_MAP: Record<string, FactorDef> = Object.fromEntries(
  FACTOR_DEFS.map((f) => [f.key, f]),
);

/** Headline score = Σ(value × weight), rounded. */
export function computeScore(factors: ScoreFactor[]): number {
  const total = factors.reduce((acc, f) => acc + f.value * f.weight, 0);
  return Math.round(total);
}

export type Band = "high" | "mid" | "low";

export function band(score: number): Band {
  if (score >= 85) return "high";
  if (score >= 60) return "mid";
  return "low";
}

export function bandColor(score: number): string {
  const b = band(score);
  return b === "high" ? "var(--score-high)" : b === "mid" ? "var(--score-mid)" : "var(--score-low)";
}

export function bandSoft(score: number): string {
  const b = band(score);
  return b === "high"
    ? "var(--score-high-soft)"
    : b === "mid"
      ? "var(--score-mid-soft)"
      : "var(--score-low-soft)";
}

export function bandLabel(score: number): string {
  const b = band(score);
  return b === "high" ? "Strong" : b === "mid" ? "Watch" : "Weak";
}

export function actionFromScore(score: number, riskCount: number): SuggestedAction {
  if (score >= 85 && riskCount <= 2) return "Acquire";
  if (score >= 72) return "Investigate";
  if (score >= 58) return "Monitor";
  return "Avoid";
}

export function confidenceLabel(c: number): string {
  if (c >= 80) return "High";
  if (c >= 62) return "Moderate";
  return "Indicative";
}
