/* ============================================================
   HAXAX — enrichment (real data only)

   Turns a raw WA mining-tenement record from the DMIRS/SLIP
   register into a Haxax Tenement. Everything here is either:
     · a real register field (id, type, status, holders, dates,
       area, survey status), or
     · derived deterministically from real inputs — the nearest
       real MINEDEX deposits, the real drill-collar density around
       the ground, and the real grant/expiry dates.

   Nothing is invented. There is no randomness: the same register
   record always yields the same output. Fields the public register
   does not carry (valuations, royalties, drill grades) are NOT
   fabricated — they are simply absent. Statutory/geological context
   (bedrock geology, mineral field, LGA, native title, WAMEX) is
   resolved separately, on demand, from live government layers.
   ============================================================ */

import type {
  Alert, AlertSeverity, AlertType, Commodity, FeedEvent, FeedEventType,
  LicenceType, RegionId, RiskLevel, ScoreFactor, Tenement, TenementStatus, TenureRegister, TimelineEvent,
} from "./types";
import { REGIONS, REGION_MAP } from "./geo";
import { FACTOR_DEFS, actionFromScore, computeScore } from "./scoring";

const DAY = 86400000;
const YEAR = 365.25 * DAY;

/* commodity demand is a documented market-view constant (not per-tenement data) */
const COMMODITY_DEMAND: Record<Commodity, number> = {
  Lithium: 92, "Rare Earths": 90, Gold: 87, Copper: 84, Nickel: 70, Cobalt: 68, "Iron Ore": 66, Manganese: 60,
};
/* region-typical commodities — used ONLY as a last resort when no real deposit is nearby */
const REGION_COMMODITIES: Record<RegionId, Commodity> = {
  pilbara: "Iron Ore", eastgoldfields: "Gold", kalgoorlie: "Gold", leonora: "Gold", coolgardie: "Gold",
  yilgarn: "Gold", murchison: "Gold", gascoyne: "Rare Earths", kimberley: "Copper", southwest: "Lithium",
};
const MAJORS = ["RIO TINTO", "BHP", "FORTESCUE", "NEWMONT", "MINERAL RESOURCES", "IGO", "SOUTH32", "HANCOCK", "ROY HILL", "GOLD FIELDS", "TALISON"];
const MIDCAPS = ["NORTHERN STAR", "GOLD ROAD", "RAMELIUS", "WESTGOLD", "REGIS", "LIONTOWN", "PILBARA MINERALS", "GENESIS", "VAULT", "BELLEVUE", "CAPRICORN", "DEVELOP"];

/* ---------- raw input (all real register fields) ---------- */
export interface RawTenement {
  id: string;
  rawType: string;
  status: string;
  holders: string[];
  holderAddress?: string;
  survStatus?: string;
  special?: string;
  grantDate: number | null;
  startDate: number | null;
  endDate: number | null;
  areaHa: number;
  poly: [number, number][];
  lng: number;
  lat: number;
}

/** A real MINEDEX mine / mineral deposit. */
export interface Deposit {
  name: string;
  commodity: Commodity;
  stage: string;
  type: string;
  lng: number;
  lat: number;
}

/* ---------- helpers ---------- */
export function mapDepositCommodity(target?: string, commo?: string): Commodity {
  const s = `${target ?? ""} ${commo ?? ""}`.toUpperCase();
  if (s.includes("LITHIUM") || /\bLI\b/.test(s)) return "Lithium";
  if (s.includes("RARE EARTH") || s.includes("REE")) return "Rare Earths";
  if (s.includes("NICKEL") || /\bNI\b/.test(s)) return "Nickel";
  if (s.includes("COBALT") || /\bCO\b/.test(s)) return "Cobalt";
  if (s.includes("COPPER") || /\bCU\b/.test(s)) return "Copper";
  if (s.includes("IRON") || /\bFE\b/.test(s)) return "Iron Ore";
  if (s.includes("MANGAN") || /\bMN\b/.test(s)) return "Manganese";
  return "Gold"; // PRECIOUS METAL / Au / Ag and default
}
export function depositStageLabel(s: string): string {
  const u = (s || "").toLowerCase();
  if (u.includes("operating")) return "Producing";
  if (u.includes("care")) return "Care & maintenance";
  if (u.includes("propos") || u.includes("undevel") || u.includes("develop")) return "Development";
  if (u.includes("shut") || u.includes("closed") || u.includes("abandon") || u.includes("historic")) return "Historic";
  return s || "Historic";
}
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function nearestDeposits(deposits: Deposit[], lng: number, lat: number, n: number, maxKm: number) {
  return deposits
    .map((d) => ({ d, km: haversineKm(lat, lng, d.lat, d.lng) }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}
export function regionFromLngLat(lng: number, lat: number): RegionId {
  let best: RegionId = "kalgoorlie";
  let bestD = Infinity;
  for (const r of REGIONS) {
    const d = (r.lng - lng) ** 2 + (r.lat - lat) ** 2;
    if (d < bestD) { bestD = d; best = r.id; }
  }
  return best;
}
function mapLicence(rawType: string): LicenceType {
  const t = rawType.toUpperCase();
  if (t.includes("EXPLORATION")) return "Exploration";
  if (t.includes("PROSPECTING")) return "Prospecting";
  if (t.includes("RETENTION")) return "Retention";
  if (t.includes("MISCELLANEOUS") || t.includes("GENERAL PURPOSE")) return "Miscellaneous";
  return "Mining"; // mining lease, mineral lease…
}
function mapStatus(raw: string): TenementStatus {
  const s = raw.toUpperCase();
  if (s.includes("PEND")) return "Pending";
  if (s.includes("APPL")) return "Application";
  if (s.includes("GRANT")) return "Granted";
  return "Live";
}
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bPty\b/g, "Pty").replace(/\bLtd\b/gi, "Ltd").replace(/\bNl\b/g, "NL");
}
function inferHolderType(name: string, count: number): Tenement["holderType"] {
  const u = name.toUpperCase();
  if (MAJORS.some((m) => u.includes(m))) return "Major";
  if (MIDCAPS.some((m) => u.includes(m))) return "Mid-cap";
  const isCompany = /(PTY|LTD|LIMITED|\bNL\b|HOLDINGS|RESOURCES|MINING|MINERALS|METALS|GOLD|EXPLORATION|NOMINEES|GROUP|CORP)/.test(u);
  if (!isCompany && count <= 1 && name.trim().split(/\s+/).length <= 4) return "Individual";
  if (u.includes("NOMINEES") || u.includes("HOLDINGS") || u.includes("PASTORAL") || u.includes("INVESTMENT")) return "Private";
  return "Junior";
}
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/* ---------- enrich one tenement (deterministic, real inputs only) ---------- */
export function enrichTenement(
  raw: RawTenement,
  now = Date.now(),
  deposits: Deposit[] = [],
  drillPoints: { lng: number; lat: number }[] = [],
): Tenement {
  const region = regionFromLngLat(raw.lng, raw.lat);
  const reg = REGION_MAP[region];
  const licenceType = mapLicence(raw.rawType);
  const status = mapStatus(raw.status);
  const holders = raw.holders.filter((h) => h && h.trim()).map((h) => titleCase(h.trim()));
  const holder = holders[0] ?? "Unregistered / vacant";
  const holderCount = raw.holders.filter((h) => h && h.trim() && !/withheld/i.test(h)).length || holders.length;
  const holderType = inferHolderType(raw.holders[0] ?? "", holderCount);

  const areaHa = Math.max(1, Math.round(raw.areaHa || 0));
  const blocks = Math.max(1, Math.round(areaHa / 280)); // graticular blocks ≈ area / ~2.8 km²

  // real dates (fall back to null-safe values only for display maths)
  const grantMs = raw.grantDate ?? raw.startDate ?? now;
  const startMs = raw.startDate ?? raw.grantDate ?? grantMs;
  const grantDate = new Date(grantMs).toISOString();
  const startDate = new Date(startMs).toISOString();
  const hasExpiry = raw.endDate != null;
  const expiryMs = raw.endDate ?? now;
  const expiryDate = new Date(expiryMs).toISOString();
  const ageYears = Math.max(0, (now - grantMs) / YEAR);
  const dUntilY = (expiryMs - now) / YEAR;
  const expiryWord = !hasExpiry ? "—" : dUntilY < 0 ? "expired" : dUntilY < 1 ? `${Math.max(1, Math.round(dUntilY * 12))} months` : `${dUntilY.toFixed(1)} years`;

  // ---- real nearby deposits (MINEDEX) → commodity + endowment ----
  const near = deposits.length ? nearestDeposits(deposits, raw.lng, raw.lat, 5, 120) : [];
  const within25 = deposits.filter((d) => haversineKm(raw.lat, raw.lng, d.lat, d.lng) <= 25);
  const endowment = within25.length;
  const producingNear = within25.filter((d) => /Producing/i.test(d.stage)).length;
  const nearestKm = near[0]?.km ?? 999;

  let commodities: Commodity[];
  let nearbyMines: Tenement["nearbyMines"];
  if (near.length) {
    nearbyMines = near.slice(0, 4).map((x) => ({ name: x.d.name, commodity: x.d.commodity, distanceKm: Math.round(x.km), status: x.d.stage }));
    const counts: Record<string, number> = {};
    near.forEach((x) => (counts[x.d.commodity] = (counts[x.d.commodity] ?? 0) + 1));
    const ranked = Object.entries(counts).sort((a, z) => z[1] - a[1]).map((e) => e[0] as Commodity);
    commodities = ranked.slice(0, 2);
  } else {
    commodities = [REGION_COMMODITIES[region]];
    nearbyMines = [];
  }
  const primary = commodities[0];
  const nearName = near[0]?.d.name ?? null;

  // ---- real drill-collar density within ~10 km ----
  let drillHolesNearby = 0;
  if (drillPoints.length) {
    for (const p of drillPoints) if (haversineKm(raw.lat, raw.lng, p.lat, p.lng) <= 10) drillHolesNearby++;
  }

  const ownershipComplexity: Tenement["ownershipComplexity"] =
    holderCount > 2 ? "Multiple parties" : holderCount === 2 ? "Single JV" : "Clean";

  // ---- score factors (all from real inputs; deterministic, no randomness) ----
  const sub: Record<string, number> = {};
  sub.age = clamp(35 + ageYears * 1.8, 20, 96);
  sub.expiry = !hasExpiry ? 55 : dUntilY < 0 ? 32 : dUntilY < 1.5 ? clamp(88 - dUntilY * 8) : dUntilY < 4 ? clamp(72 - (dUntilY - 1.5) * 4) : 56;
  sub.commodity = clamp(COMMODITY_DEMAND[primary] + (commodities.length - 1) * 4);
  sub.nearbyMines = clamp(45 + producingNear * 12 + Math.max(0, 40 - nearestKm) * 0.9);
  sub.drilling = clamp(38 + Math.log10(drillHolesNearby + 1) * 20);
  sub.prospectivity = clamp(40 + Math.min(42, endowment * 3.2));
  sub.adjacency = clamp(42 + Math.min(38, endowment * 2.4 + producingNear * 4));
  sub.ownership = holderCount <= 1 ? 92 : holderCount === 2 ? 72 : 50;
  sub.encumbrance = 78; // not assessable from the public register — neutral, adds no false signal
  sub.activity = clamp(40 + Math.log10(drillHolesNearby + 1) * 16);
  sub.data = clamp(52 + Math.min(40, drillHolesNearby / 8) + (nearestKm < 25 ? 6 : 0));

  const factors: ScoreFactor[] = FACTOR_DEFS.map((def) => ({
    key: def.key, label: def.label, weight: def.weight, value: Math.round(sub[def.key]), note: def.hint,
  }));
  const score = computeScore(factors);

  // ---- risk flags (real only) ----
  const riskFlags: { label: string; level: RiskLevel }[] = [];
  if (hasExpiry && dUntilY < 0) riskFlags.push({ label: "Expired — renewal / forfeiture", level: "high" });
  else if (hasExpiry && dUntilY < 1) riskFlags.push({ label: "Expiry < 12 months", level: "elevated" });
  if (ownershipComplexity === "Multiple parties") riskFlags.push({ label: `Multiple-party title (${holderCount})`, level: "moderate" });
  if (drillHolesNearby < 20) riskFlags.push({ label: "Sparse nearby drilling", level: "moderate" });
  if (nearestKm > 40) riskFlags.push({ label: "Isolated from known deposits", level: "low" });
  const action = actionFromScore(score, riskFlags.filter((r) => r.level === "high" || r.level === "elevated").length);

  // ---- narrative note (deterministic fallback; grounded only in the real facts above) ----
  const grantYr = new Date(grantMs).getFullYear();
  const upside: string[] = [];
  if (ageYears >= 12) upside.push(`Long-held ground, granted ${grantYr} (${Math.round(ageYears)} yrs) — often overlooked, de-risked title.`);
  if (hasExpiry && dUntilY >= 0 && dUntilY < 1.5) upside.push(`Approaching expiry (${expiryWord}) — a near-term acquisition / renewal window.`);
  if (nearName && nearestKm < 40) upside.push(`${nearName} lies ${Math.round(nearestKm)} km away — real ${primary.toLowerCase()} endowment in the district.`);
  if (endowment >= 4) upside.push(`${endowment} recorded MINEDEX deposits within 25 km${producingNear ? `, ${producingNear} producing` : ""}.`);
  if (holderType === "Individual" || holderType === "Private") upside.push("Privately held — potentially receptive to approach.");
  if (!upside.length) upside.push(`${primary} ground in the ${reg.name}; ${areaHa.toLocaleString()} ha under ${licenceType.toLowerCase()} title.`);

  const risks: string[] = [];
  if (hasExpiry && dUntilY < 0) risks.push("Title has lapsed — subject to renewal or forfeiture; verify current standing.");
  if (drillHolesNearby < 20) risks.push(`Only ${drillHolesNearby} drill collars on record within 10 km — lightly tested ground.`);
  if (nearestKm > 40) risks.push("No nearby recorded deposit — standalone, higher-risk exploration case.");
  if (ownershipComplexity !== "Clean") risks.push(`Title held across ${holderCount} parties — consolidation adds friction.`);
  if (!risks.length) risks.push("Public register carries no valuation, royalty or resource data — figures require primary due diligence.");

  const confidence = clamp(Math.round(46 + Math.min(30, drillHolesNearby / 8) + (endowment ? 8 : 0) + (hasExpiry ? 4 : 0)), 40, 92);
  const thesis = `${raw.id} is a ${licenceType.toLowerCase()} title of ${areaHa.toLocaleString()} ha held by ${holder}${holders.length > 1 ? ` (+${holders.length - 1})` : ""} in the ${reg.name}. Granted ${grantYr}${hasExpiry ? `, ${dUntilY < 0 ? "now past its expiry date" : `running ${expiryWord} to expiry`}` : ""}. ${nearName ? `Nearest recorded deposit is ${nearName} at ${Math.round(nearestKm)} km; ` : ""}${endowment} MINEDEX occurrence${endowment === 1 ? "" : "s"} and ${drillHolesNearby} drill collar${drillHolesNearby === 1 ? "" : "s"} sit within the surrounding ground. All figures are from the live DMIRS/SLIP register — no valuation is implied.`;
  const verdict = action === "Acquire" ? "Screens for a closer look" : action === "Investigate" ? "Worth a data-room review" : action === "Monitor" ? "Track for a catalyst" : "Below screen threshold";
  const nextStep = "Verify title standing on the DMIRS register; pull WAMEX reports for the ground; confirm holder and dealings before any approach.";
  const ai = { rating: score, verdict, upside: upside.slice(0, 3), risks: risks.slice(0, 3), thesis, confidence, nextStep };

  // ---- register (real fields only) ----
  const mgaZone = Math.floor((raw.lng + 180) / 6) + 1;
  const register: TenureRegister = {
    datum: `GDA2020 / MGA Zone ${mgaZone}`,
    coords: `${Math.abs(raw.lat).toFixed(3)}°S  ${raw.lng.toFixed(3)}°E`,
    subBlocks: blocks,
    surveyStatus: raw.survStatus?.trim() || "Not stated",
  };

  // ---- prospectivity target (real endowment-based, deterministic) ----
  const targetScore = Math.round(clamp(
    Math.min(40, endowment * 3) +
    (nearestKm < 5 ? 24 : nearestKm < 12 ? 16 : nearestKm < 25 ? 8 : 0) +
    Math.min(16, producingNear * 4) +
    (drillHolesNearby < 120 ? 16 : drillHolesNearby < 400 ? 8 : 0),
  ));
  const analogs = near.slice(0, 3).map((x) => x.d.name);
  const target = {
    score: targetScore, endowment, nearestKm: Math.round(nearestKm), analogs,
    rationale: endowment
      ? `${endowment} recorded ${primary.toLowerCase()} occurrence${endowment === 1 ? "" : "s"} within 25 km (nearest ${analogs[0] ?? "—"} at ${Math.round(nearestKm)} km)${producingNear ? `, ${producingNear} producing` : ""}; ${drillHolesNearby} drill collars nearby. A nearology signal from real MINEDEX data — not a confirmed deposit.`
      : "No recorded MINEDEX deposit within 25 km — speculative ground on the public record.",
  };

  // ---- mission opportunity score (overlooked / near-expiry / old-but-resourced) ----
  const oppSignals: string[] = [];
  const oldComp = Math.min(25, Math.max(0, (ageYears - 5) * 1.6));
  if (ageYears >= 15) oppSignals.push(`Old (${Math.round(ageYears)}y)`);
  const expComp = !hasExpiry ? 0 : dUntilY < 0 ? 22 : dUntilY < 1 ? 20 : dUntilY < 2 ? 12 : dUntilY < 4 ? 4 : 0;
  if (hasExpiry && dUntilY < 0) oppSignals.push("Expired / in renewal");
  else if (hasExpiry && dUntilY < 2) oppSignals.push("Near expiry");
  const resComp = Math.min(24, endowment * 1.4 + producingNear * 2);
  if (endowment >= 4) oppSignals.push(`Resourced (${endowment} nearby)`);
  const drillComp = drillHolesNearby >= 20 && drillHolesNearby < 300 ? 8 : 0;
  const ovrComp = holderType === "Private" || holderType === "Individual" ? 12 : holderType === "Junior" ? 7 : holderType === "Mid-cap" ? 2 : 0;
  if (holderType === "Private" || holderType === "Individual") oppSignals.push("Privately held");
  const opportunity = {
    score: Math.round(clamp(oldComp + expComp + resComp + drillComp + ovrComp)),
    signals: oppSignals.slice(0, 5),
  };

  // ---- timeline (real register dates only) ----
  const timeline: TimelineEvent[] = [];
  timeline.push({ date: grantDate, type: "grant", title: `${licenceType} licence granted`, detail: `${raw.id} granted (DMIRS register).` });
  if (startMs !== grantMs) timeline.push({ date: startDate, type: "status", title: "Term start", detail: "Registered term commencement." });
  if (hasExpiry) timeline.push({ date: expiryDate, type: "expiry", title: dUntilY < 0 ? "Expiry lapsed" : "Scheduled expiry", detail: dUntilY < 0 ? "Past expiry — awaiting renewal / forfeiture determination." : "Renewal or surrender decision point." });
  timeline.sort((a, z) => +new Date(a.date) - +new Date(z.date));

  return {
    id: raw.id, licenceType, status, holder, holders, holderAddress: raw.holderAddress?.trim() || undefined, holderType,
    grantDate, startDate, expiryDate, areaHa, blocks, commodities, regionId: region,
    district: nearName ?? reg.name, lng: raw.lng, lat: raw.lat, poly: raw.poly,
    nearbyMines, endowment, drillHolesNearby, surveyStatus: register.surveyStatus,
    specialInterest: raw.special?.trim() || undefined,
    riskFlags, score, factors, ai, action, timeline, ownershipComplexity, register,
    target, opportunity, scorePercentile: 0,
    lastUpdated: new Date(now).toISOString(), dealStage: null,
  };
}

/* ---------- enrich a batch + derive alerts / feed / stats (all real) ---------- */
export function enrichAll(
  raws: RawTenement[],
  now = Date.now(),
  deposits: Deposit[] = [],
  drillPoints: { lng: number; lat: number }[] = [],
) {
  const tenements = raws.map((r) => enrichTenement(r, now, deposits, drillPoints)).sort((a, z) => z.score - a.score);

  // percentile within region
  const byRegion: Record<string, Tenement[]> = {};
  tenements.forEach((t) => ((byRegion[t.regionId] ??= []).push(t)));
  Object.values(byRegion).forEach((arr) => arr.forEach((t) => {
    const below = arr.filter((o) => o.score < t.score).length;
    t.scorePercentile = arr.length > 1 ? Math.round((below / (arr.length - 1)) * 100) : 100;
  }));

  // alerts — every one derived from a REAL register attribute (expiry, status, endowment)
  const raw: Alert[] = [];
  let an = 0;
  const push = (t: Tenement, type: AlertType, sev: AlertSeverity, title: string, message: string, ts: string) =>
    raw.push({ id: `A${200 + an++}`, type, severity: sev, tenementId: t.id, title, message, timestamp: ts, read: false });
  for (const t of tenements) {
    const dUntil = (+new Date(t.expiryDate) - now) / YEAR;
    const hasExpiry = t.expiryDate && new Date(t.expiryDate).getFullYear() > 1971;
    if (hasExpiry && dUntil < 0)
      push(t, "expiry", "critical", `Expired — ${t.id}`, `${t.id} (${t.holder}) is past its registered expiry date — renewal / forfeiture standing to verify.`, t.expiryDate);
    else if (hasExpiry && dUntil < 1)
      push(t, "expiry", "high", `Expiry approaching — ${t.id}`, `${t.id} (${t.holder}) expires in ~${Math.max(1, Math.round(dUntil * 12))} months on the register.`, t.expiryDate);
    if (t.status === "Pending" || t.status === "Application")
      push(t, "title", "medium", `Pending on register — ${t.id}`, `${t.id} is ${t.status.toLowerCase()} with DMIRS — monitor for grant or competing application.`, t.lastUpdated);
    if ((t.target?.score ?? 0) >= 78)
      push(t, "adjacency", "high", `High endowment nearby — ${t.id}`, `${t.id}: ${t.target?.rationale ?? ""}`, t.lastUpdated);
  }
  const sevRank: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  raw.sort((a, z) => sevRank[a.severity] - sevRank[z.severity] || +new Date(z.timestamp) - +new Date(a.timestamp));
  const alerts: Alert[] = raw.slice(0, 40);

  // feed — real register highlights (near-expiry, pending, high-endowment), timestamped by the real date
  const feed: FeedEvent[] = [];
  let fn = 0;
  const addFeed = (t: Tenement, type: FeedEventType, text: string, ts: string) =>
    feed.push({ id: `F${fn++}`, type, tenementId: t.id, text, timestamp: ts });
  for (const t of tenements) {
    const dUntil = (+new Date(t.expiryDate) - now) / YEAR;
    const hasExpiry = new Date(t.expiryDate).getFullYear() > 1971;
    if (hasExpiry && dUntil < 0) addFeed(t, "expiry", `${t.id} past expiry — ${t.holder} (renewal / forfeiture).`, t.expiryDate);
    else if (hasExpiry && dUntil < 1) addFeed(t, "expiry", `${t.id} expires in ~${Math.max(1, Math.round(dUntil * 12))} months — ${t.holder}.`, t.expiryDate);
    else if (t.status === "Pending" || t.status === "Application") addFeed(t, "application", `${t.id} ${t.status.toLowerCase()} with DMIRS — ${t.holder}.`, t.startDate);
    else if ((t.target?.score ?? 0) >= 80) addFeed(t, "status", `${t.id}: ${t.endowment} deposits within 25 km — ${REGION_MAP[t.regionId].name}.`, t.grantDate);
  }
  feed.sort((a, z) => +new Date(z.timestamp) - +new Date(a.timestamp));
  const feedTop = feed.slice(0, 30);

  const stats = {
    tenements: tenements.length,
    deposits: deposits.length,
    drillHoles: drillPoints.length,
    events: tenements.reduce((a, t) => a + t.timeline.length, 0),
    alerts: alerts.length,
    totalAreaHa: tenements.reduce((a, t) => a + t.areaHa, 0),
    highScore: tenements.filter((t) => t.score >= 85).length,
  };

  return { tenements, alerts, feed: feedTop, stats, deposits };
}
