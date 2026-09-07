/* ============================================================
   HAXAX — AI research-note generation

   When an LLM key is present (MiniMax or Anthropic Claude) this
   produces a genuine analyst read from the tenement's real register
   facts + Haxax model outputs. With no key it returns null and the
   app falls back to the deterministic note. Keys are read from the
   environment server-side only — they never reach the browser.
   ============================================================ */

import type { AIOpinion, Tenement } from "../src/lib/types";

export type AiOpinion = AIOpinion & { provider: string };

const cache = new Map<string, AiOpinion>();
const memoCache = new Map<string, AiMemo>();

export interface AiMemo {
  summary: string; thesis: string; upside: string[]; risks: string[];
  geology: string; valuation: string; recommendation: string; nextStep: string;
  confidence: number; provider: string;
}

/** Drop cached notes/memos so they regenerate against freshly-refreshed register data. */
export function clearOpinionCache(): void {
  cache.clear();
  memoCache.clear();
}

export function aiProvider(): "MiniMax" | "Claude" | null {
  if (process.env.MINIMAX_API_KEY) return "MiniMax";
  if (process.env.ANTHROPIC_API_KEY) return "Claude";
  return null;
}
export const aiEnabled = () => aiProvider() !== null;

const SYSTEM =
  "You are Haxax, a Western Australian mining-tenement acquisitions analyst. Haxax's mission is to find " +
  "OVERLOOKED, NEAR-EXPIRY, or OLD-BUT-STILL-RESOURCED tenements near real mineral endowment. " +
  "You are given a single tenement's LIVE DMIRS/SLIP register facts, the nearby real MINEDEX mines/deposits, " +
  "the real drill-collar density, and the Haxax scoring/targeting outputs. Write a concise, sober read focused on: " +
  "(1) is this overlooked relative to the real endowment around it? (2) does the nearby recorded mineralisation and " +
  "drilling imply ground worth re-testing? (3) what is the acquisition leverage (expiry timing, ownership, holder type)? " +
  "CRITICAL: ground every statement ONLY in the supplied facts. NEVER invent grades, tonnages, JORC resources, drill " +
  "results, sale prices or a valuation — none are provided and none exist in the public register. If evidence is thin, say so and lower confidence. " +
  "Respond with STRICT JSON only (no markdown, no prose) matching exactly: " +
  '{"verdict": string (max 8 words), "upside": [exactly 3 short strings], "risks": [exactly 3 short strings], ' +
  '"thesis": string (2-3 sentences), "nextStep": string, "confidence": number 0-100}';

function factsFor(t: Tenement): string {
  const f = t.factors.map((x) => `${x.label} ${x.value}/100 (w${Math.round(x.weight * 100)}%)`).join("; ");
  const mines = t.nearbyMines.map((m) => `${m.name} (${m.commodity}, ${m.distanceKm}km, ${m.status})`).join("; ");
  const yr = (iso: string) => iso.slice(0, 10);
  const hasExpiry = new Date(t.expiryDate).getFullYear() > 1971;
  return [
    `Tenement ${t.id}: ${t.licenceType} licence, status ${t.status}, held by ${t.holder}${t.holders.length > 1 ? ` and ${t.holders.length - 1} other registered party(ies)` : ""} (${t.holderType}${t.holderAddress ? `, registered address ${t.holderAddress}` : ""}).`,
    `Region ${t.regionId}, near ${t.district}. Area ${Math.round(t.areaHa)} ha (~${t.blocks} graticular blocks). Survey status: ${t.surveyStatus}. Ownership: ${t.ownershipComplexity}.`,
    `Granted ${yr(t.grantDate)}${hasExpiry ? `, expires ${yr(t.expiryDate)}` : ", no expiry date on the register"}.`,
    `Commodity focus is INFERRED from the nearest MINEDEX deposit — it is NOT stated on the tenement itself: ${t.commodities.join(", ")}.`,
    `Real nearby MINEDEX mines/deposits: ${mines || "none recorded within 120 km"}. Recorded deposits within 25 km: ${t.endowment}. Real drill collars within 10 km: ${t.drillHolesNearby}.`,
    t.target ? `Endowment / analog signal: ${t.target.score}/100 — ${t.target.rationale}` : "",
    `Haxax indicator ${t.score}/100 (region percentile P${t.scorePercentile}); component factors: ${f}.`,
    "IMPORTANT: the public register carries NO valuation, sale price, rent, expenditure, royalty, grade, tonnage or JORC resource for this tenement. Do NOT state or estimate any dollar figure, grade or resource. Assess ONLY on the real facts above — endowment, proximity, drill density, age, expiry, holder.",
    `Suggested screen (Haxax model): ${t.action}.`,
  ].filter(Boolean).join("\n");
}

async function callMiniMax(prompt: string, system: string): Promise<string> {
  let url = process.env.MINIMAX_URL || "https://api.minimax.io/v1/text/chatcompletion_v2";
  if (process.env.MINIMAX_GROUP_ID) url += `${url.includes("?") ? "&" : "?"}GroupId=${process.env.MINIMAX_GROUP_ID}`;
  const model = process.env.MINIMAX_MODEL || "MiniMax-Text-01";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MINIMAX_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      // M2 is a reasoning model — leave headroom for reasoning + the JSON answer
      temperature: 0.4, max_tokens: 4000,
    }),
  });
  if (!res.ok) throw new Error(`MiniMax HTTP ${res.status}`);
  const j: any = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

async function callClaude(prompt: string, system: string): Promise<string> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY as string, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const j: any = await res.json();
  return j.content?.[0]?.text ?? "";
}

const MEMO_SYSTEM =
  "You are Haxax, a Western Australian mining-tenement acquisitions analyst writing a formal Investment Committee memo " +
  "for a single tenement. Haxax's mission: surface overlooked, near-expiry, or old-but-still-resourced ground near real endowment. " +
  "Ground EVERYTHING ONLY in the supplied live register facts, nearby real MINEDEX deposits, real drill density and Haxax outputs. " +
  "NEVER invent grades, tonnages, JORC resources, drill results, sale prices or a dollar valuation — the public register has none. " +
  "For the 'valuation' field, do NOT state any figure; instead explain what real evidence bears on value (endowment, proximity to " +
  "producing mines, drilling density, area, expiry leverage) and state plainly that a defensible valuation needs primary data " +
  "(comparable transactions, JORC resource, exploration results) not in the public register. For 'geology', describe only the real " +
  "nearby deposits/endowment — do not invent bedrock detail. Respond with STRICT JSON only (no markdown) matching exactly: " +
  '{"summary": string (2-3 sentences), "thesis": string (3-4 sentences), "upside": [exactly 3 strings], ' +
  '"risks": [exactly 3 strings], "geology": string (2-3 sentences), "valuation": string (2 sentences), ' +
  '"recommendation": string (1-2 sentences with a clear call), "nextStep": string, "confidence": number 0-100}';

const ASK_SYSTEM =
  "You convert a user's plain-English query about Western Australian mining tenements into a JSON filter. " +
  "Include ONLY the fields the query implies; omit all others. Valid fields & values:\n" +
  '- commodities: array of ["Gold","Lithium","Iron Ore","Nickel","Rare Earths","Copper","Cobalt"]\n' +
  '- regions: array of ["pilbara","eastgoldfields","kalgoorlie","leonora","coolgardie","yilgarn","murchison","gascoyne","kimberley","southwest"]\n' +
  '- licenceTypes: array of ["Exploration","Prospecting","Mining","Retention","Miscellaneous"]\n' +
  '- statuses: array of ["Live","Pending","Granted","Expiring","Application"]\n' +
  '- actions: array of ["Acquire","Investigate","Monitor","Avoid"]\n' +
  '- holderTypes: array of ["Major","Mid-cap","Junior","Private","Individual"]\n' +
  "- scoreMin: number 0-100 (minimum Haxax score)\n" +
  "- expiryMonths: number (expiring within this many months)\n" +
  "- onlyWatchlist: boolean\n" +
  "Respond with STRICT JSON only — an object with just the implied fields. If nothing maps, return {}.";

export async function interpretQuery(q: string): Promise<Record<string, unknown> | null> {
  const provider = aiProvider();
  if (!provider) return null;
  try {
    const raw = provider === "MiniMax" ? await callMiniMax(`Query: ${q}`, ASK_SYSTEM) : await callClaude(`Query: ${q}`, ASK_SYSTEM);
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s < 0 || e < 0) return {};
    return JSON.parse(raw.slice(s, e + 1));
  } catch (err) {
    console.error(`[haxax] ask failed: ${(err as Error).message}`);
    return null;
  }
}

export async function generateMemo(t: Tenement): Promise<AiMemo | null> {
  const provider = aiProvider();
  if (!provider) return null;
  if (memoCache.has(t.id)) return memoCache.get(t.id)!;
  try {
    const raw = provider === "MiniMax" ? await callMiniMax(factsFor(t), MEMO_SYSTEM) : await callClaude(factsFor(t), MEMO_SYSTEM);
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("no JSON in response");
    const o = JSON.parse(raw.slice(s, e + 1));
    const memo: AiMemo = {
      summary: String(o.summary || ""),
      thesis: String(o.thesis || t.ai.thesis),
      upside: Array.isArray(o.upside) && o.upside.length ? o.upside.slice(0, 3).map(String) : t.ai.upside,
      risks: Array.isArray(o.risks) && o.risks.length ? o.risks.slice(0, 3).map(String) : t.ai.risks,
      geology: String(o.geology || ""),
      valuation: String(o.valuation || ""),
      recommendation: String(o.recommendation || t.ai.verdict),
      nextStep: String(o.nextStep || t.ai.nextStep),
      confidence: Number.isFinite(o.confidence) ? Math.max(0, Math.min(100, Math.round(o.confidence))) : t.ai.confidence,
      provider,
    };
    memoCache.set(t.id, memo);
    return memo;
  } catch (err) {
    console.error(`[haxax] AI memo failed (${provider}): ${(err as Error).message}`);
    return null;
  }
}

export async function generateOpinion(t: Tenement): Promise<AiOpinion | null> {
  const provider = aiProvider();
  if (!provider) return null;
  if (cache.has(t.id)) return cache.get(t.id)!;
  try {
    const raw = provider === "MiniMax" ? await callMiniMax(factsFor(t), SYSTEM) : await callClaude(factsFor(t), SYSTEM);
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("no JSON in response");
    const o = JSON.parse(raw.slice(s, e + 1));
    const op: AiOpinion = {
      rating: t.ai.rating,
      verdict: String(o.verdict || t.ai.verdict),
      upside: Array.isArray(o.upside) && o.upside.length ? o.upside.slice(0, 3).map(String) : t.ai.upside,
      risks: Array.isArray(o.risks) && o.risks.length ? o.risks.slice(0, 3).map(String) : t.ai.risks,
      thesis: String(o.thesis || t.ai.thesis),
      confidence: Number.isFinite(o.confidence) ? Math.max(0, Math.min(100, Math.round(o.confidence))) : t.ai.confidence,
      nextStep: String(o.nextStep || t.ai.nextStep),
      provider,
    };
    cache.set(t.id, op);
    return op;
  } catch (err) {
    console.error(`[haxax] AI opinion failed (${provider}): ${(err as Error).message}`);
    return null;
  }
}
