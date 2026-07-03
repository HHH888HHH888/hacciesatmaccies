/* ============================================================
   HAXAX — enrichment

   Turns a raw WA mining-tenement record (real fields from the
   DMIRS/SLIP register) into a full Haxax Tenement. Real inputs
   drive the model:
     · grant date      → age factor
     · end date        → time-to-expiry factor + econ leverage
     · legal area      → economics (implied EV, holding cost…)
     · holder(s)       → ownership complexity / holder type
     · centroid        → region → prospectivity, nearby mines, belt
   Fields the public register does not carry (geology prose, drill
   counts, inferred commodity, comps) are derived deterministically
   from a per-tenement seed so they are stable across refreshes.
   ============================================================ */

import type {
  Alert, AlertSeverity, AlertType, Commodity, CompTxn, Econ, FeedEvent, FeedEventType,
  LicenceType, RegionId, RiskLevel, ScoreFactor, Tenement, TenementStatus, TenureRegister, TimelineEvent,
} from "./types";
import { REGIONS, REGION_MAP } from "./geo";
import { FACTOR_DEFS, actionFromScore, band, computeScore } from "./scoring";

const DAY = 86400000;
const YEAR = 365.25 * DAY;

/* deterministic per-tenement rng */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* reference pools (WA geography is real; descriptive context is indicative) */
const REGION_COMMODITIES: Record<RegionId, Commodity[]> = {
  pilbara: ["Iron Ore", "Lithium", "Gold", "Iron Ore"],
  eastgoldfields: ["Gold", "Nickel", "Lithium", "Gold"],
  kalgoorlie: ["Gold", "Nickel", "Gold"],
  leonora: ["Gold", "Nickel", "Gold"],
  coolgardie: ["Gold", "Lithium", "Nickel"],
  yilgarn: ["Gold", "Nickel", "Lithium"],
  murchison: ["Gold", "Rare Earths", "Copper", "Gold"],
  gascoyne: ["Rare Earths", "Copper", "Gold"],
  kimberley: ["Copper", "Nickel", "Cobalt"],
  southwest: ["Lithium", "Gold"],
};
const NEARBY: Record<RegionId, [string, Commodity][]> = {
  pilbara: [["Mt Whaleback", "Iron Ore"], ["Pilgangoora", "Lithium"], ["Wodgina", "Lithium"], ["Hemi", "Gold"]],
  eastgoldfields: [["Sunrise Dam", "Gold"], ["Wallaby", "Gold"], ["Murrin Murrin", "Nickel"], ["Mt Weld", "Rare Earths"]],
  kalgoorlie: [["Super Pit (KCGM)", "Gold"], ["St Ives", "Gold"], ["Kanowna Belle", "Gold"], ["Kambalda Nickel", "Nickel"]],
  leonora: [["Gwalia", "Gold"], ["King of the Hills", "Gold"], ["Thunderbox", "Gold"]],
  coolgardie: [["Bullabulling", "Gold"], ["Higginsville", "Gold"], ["Mt Marion", "Lithium"]],
  yilgarn: [["Marvel Loch", "Gold"], ["Forrestania", "Nickel"], ["Mt Holland", "Lithium"]],
  murchison: [["Big Bell", "Gold"], ["Cue Central", "Gold"], ["DeGrussa", "Copper"]],
  gascoyne: [["Mt Augustus", "Gold"], ["Gifford Creek", "Rare Earths"], ["Abra", "Copper"]],
  kimberley: [["Savannah", "Nickel"], ["Nicholsons", "Gold"], ["Koongie Park", "Copper"]],
  southwest: [["Greenbushes", "Lithium"], ["Boddington", "Gold"]],
};
const BELT: Record<RegionId, { belt: string; host: string }> = {
  pilbara: { belt: "Pilbara granite–greenstone craton", host: "mafic–ultramafic" },
  eastgoldfields: { belt: "Norseman–Wiluna greenstone belt", host: "mafic–ultramafic" },
  kalgoorlie: { belt: "Kalgoorlie Terrane", host: "Golden Mile Dolerite" },
  leonora: { belt: "Norseman–Wiluna greenstone belt", host: "high-Mg basalt" },
  coolgardie: { belt: "Coolgardie Domain", host: "komatiite–basalt" },
  yilgarn: { belt: "Southern Cross greenstone belt", host: "banded iron / mafic" },
  murchison: { belt: "Murchison greenstone terrane", host: "mafic–ultramafic" },
  gascoyne: { belt: "Gascoyne Province basement", host: "granitic gneiss / pegmatite" },
  kimberley: { belt: "Halls Creek Orogen", host: "mafic intrusive" },
  southwest: { belt: "Balingup metamorphic belt", host: "LCT pegmatite" },
};
const COMMODITY_DEMAND: Record<Commodity, number> = {
  Lithium: 92, "Rare Earths": 90, Gold: 87, Copper: 84, Nickel: 70, Cobalt: 68, "Iron Ore": 66, Manganese: 60,
};
const EV_BASE: Record<Commodity, number> = {
  Lithium: 1900, "Rare Earths": 1400, Gold: 920, Copper: 720, Nickel: 640, Cobalt: 560, "Iron Ore": 400, Manganese: 320,
};
const PROV_BASE: Record<RegionId, number> = {
  kalgoorlie: 90, leonora: 88, eastgoldfields: 86, coolgardie: 82, yilgarn: 80,
  murchison: 78, pilbara: 84, gascoyne: 70, kimberley: 68, southwest: 87,
};
const MINERAL_FIELD: Record<RegionId, string> = {
  pilbara: "Pilbara", eastgoldfields: "Mt Margaret", kalgoorlie: "East Coolgardie", leonora: "Mt Margaret",
  coolgardie: "Coolgardie", yilgarn: "Yilgarn", murchison: "Murchison", gascoyne: "Gascoyne", kimberley: "Kimberley", southwest: "Greenbushes",
};
const LGA: Record<RegionId, string[]> = {
  pilbara: ["Shire of Ashburton", "Town of Port Hedland", "Shire of East Pilbara"],
  eastgoldfields: ["Shire of Laverton", "Shire of Leonora", "Shire of Wiluna", "Shire of Menzies"],
  kalgoorlie: ["City of Kalgoorlie-Boulder", "Shire of Coolgardie"],
  leonora: ["Shire of Leonora", "Shire of Menzies"], coolgardie: ["Shire of Coolgardie", "Shire of Dundas"],
  yilgarn: ["Shire of Yilgarn", "Shire of Westonia"],
  murchison: ["Shire of Mount Magnet", "Shire of Cue", "Shire of Meekatharra", "Shire of Sandstone"],
  gascoyne: ["Shire of Upper Gascoyne", "Shire of Meekatharra"],
  kimberley: ["Shire of Halls Creek", "Shire of Wyndham-East Kimberley"],
  southwest: ["Shire of Bridgetown-Greenbushes", "Shire of Donnybrook-Balingup", "Shire of Collie"],
};
const MAP_SHEET: Record<RegionId, string[]> = {
  pilbara: ["SF50-05 Roebourne", "SF51-09 Nullagine"], eastgoldfields: ["SH51-02 Laverton", "SG51-16 Duketon"],
  kalgoorlie: ["SH51-09 Kalgoorlie", "SH51-13 Widgiemooltha"], leonora: ["SH51-01 Leonora", "SG51-13 Sir Samuel"],
  coolgardie: ["SH51-09 Kalgoorlie", "SH51-13 Widgiemooltha"], yilgarn: ["SH50-12 Southern Cross", "SH50-16 Hyden"],
  murchison: ["SG50-12 Cue", "SG50-16 Mount Magnet"], gascoyne: ["SG50-03 Glenburgh", "SG50-07 Mount Egerton"],
  kimberley: ["SE52-09 Dixon Range", "SE52-13 Gordon Downs"], southwest: ["SI50-05 Collie", "SI50-01 Pinjarra"],
};
const DISTRICTS: Record<RegionId, string[]> = {
  pilbara: ["Newman", "Nullagine", "Marble Bar", "Pilgangoora"], eastgoldfields: ["Laverton", "Leinster", "Wiluna", "Yandal"],
  kalgoorlie: ["Kalgoorlie", "Boulder", "Kanowna", "Kambalda"], leonora: ["Leonora", "Gwalia", "Mt Morgans"],
  coolgardie: ["Coolgardie", "Bullabulling", "Widgiemooltha"], yilgarn: ["Southern Cross", "Marvel Loch", "Bullfinch"],
  murchison: ["Mt Magnet", "Cue", "Meekatharra", "Sandstone"], gascoyne: ["Gascoyne Junction", "Mt Augustus"],
  kimberley: ["Halls Creek", "Kununurra", "Savannah"], southwest: ["Greenbushes", "Donnybrook", "Collie"],
};
const NATIVE_TITLE = ["Determination — native title exists", "Registered claim overlap", "ILUA executed", "s31 agreement in place", "No claim on record"];
const HERITAGE = ["Heritage agreement in place", "Survey completed — no sites", "Survey outstanding", "Registered sites within boundary"];
const DEALINGS = ["Transfer of interest", "Change of name", "Mortgage registered", "Sub-lease granted", "Caveat lodged", "Renewal granted"];
const MAJORS = ["RIO TINTO", "BHP", "FORTESCUE", "NEWMONT", "MINERAL RESOURCES", "IGO", "SOUTH32", "HANCOCK", "ROY HILL", "GOLD FIELDS"];
const MIDCAPS = ["NORTHERN STAR", "GOLD ROAD", "RAMELIUS", "WESTGOLD", "REGIS", "LIONTOWN", "PILBARA MINERALS", "GENESIS", "VAULT", "BELLEVUE", "CAPRICORN", "DEVELOP"];

/* ---------- raw input ---------- */
export interface RawTenement {
  id: string;
  rawType: string;
  status: string;
  holders: string[];
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
  return "Mining"; // mining lease, coal mining lease, mineral lease…
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

/* ---------- enrich one ---------- */
export function enrichTenement(raw: RawTenement, now = Date.now(), deposits?: Deposit[]): Tenement {
  const rng = mulberry32(hashStr(raw.id));
  const rf = (a: number, b: number) => a + rng() * (b - a);
  const ri = (a: number, b: number) => Math.floor(a + rng() * (b - a + 1));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const chance = (p: number) => rng() < p;
  const noise = (r: number) => (rng() + rng() + rng() - 1.5) * (r / 1.5);
  const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

  const region = regionFromLngLat(raw.lng, raw.lat);
  const reg = REGION_MAP[region];
  const belt = BELT[region];
  const licenceType = mapLicence(raw.rawType);
  const status = mapStatus(raw.status);
  const holder = raw.holders[0] ? titleCase(raw.holders[0]) : "Unregistered / vacant";
  const holderType = inferHolderType(raw.holders[0] ?? "", raw.holders.length);

  const areaHa = Math.max(1, Math.round(raw.areaHa || rf(200, 8000)));
  const blocks = Math.max(1, Math.round(areaHa / 320));

  const grantDate = new Date(raw.grantDate ?? raw.startDate ?? now - rf(3, 30) * YEAR).toISOString();
  const grantYr = new Date(grantDate).getFullYear();
  const expiryMs = raw.endDate ?? now + rf(0.5, 5) * YEAR;
  const expiryDate = new Date(expiryMs).toISOString();
  const ageYears = (now - new Date(grantDate).getTime()) / YEAR;
  const dUntilY = (expiryMs - now) / YEAR;
  const expiryLabel = dUntilY < 0 ? "expired" : dUntilY < 1 ? `${Math.round(dUntilY * 12)} months` : `${dUntilY.toFixed(1)} years`;

  // ---- nearby mines & commodity: prefer real MINEDEX deposits ----
  const near = deposits && deposits.length ? nearestDeposits(deposits, raw.lng, raw.lat, 5, 120) : [];
  let commodities: Commodity[];
  let nearbyMines: Tenement["nearbyMines"];
  if (near.length) {
    nearbyMines = near.slice(0, 4).map((x) => ({
      name: x.d.name, commodity: x.d.commodity, distanceKm: Math.round(x.km), status: x.d.stage,
    }));
    const counts: Record<string, number> = {};
    near.forEach((x) => (counts[x.d.commodity] = (counts[x.d.commodity] ?? 0) + 1));
    const ranked = Object.entries(counts).sort((a, z) => z[1] - a[1]).map((e) => e[0] as Commodity);
    commodities = [ranked[0]];
    if (ranked[1] && chance(0.5)) commodities.push(ranked[1]);
  } else {
    commodities = [pick(REGION_COMMODITIES[region])];
    if (chance(0.4)) { const c2 = pick(REGION_COMMODITIES[region]); if (!commodities.includes(c2)) commodities.push(c2); }
    const pool = NEARBY[region];
    const nm = ri(1, Math.min(4, pool.length));
    nearbyMines = [...pool].sort(() => rng() - 0.5).slice(0, nm).map(([name, commodity]) => ({
      name, commodity, distanceKm: Math.round(rf(2, 42)),
      status: pick(["Producing", "Producing", "Care & maintenance", "Development", "Historic"]),
    }));
  }
  const primary = commodities[0];
  const nearMine = nearbyMines[0]?.name ?? "the nearest workings";
  const nearMineKm = nearbyMines[0]?.distanceKm ?? 30;
  const minDist = nearbyMines.length ? Math.min(...nearbyMines.map((m) => m.distanceKm)) : 40;

  const ownershipComplexity: Tenement["ownershipComplexity"] =
    raw.holders.length > 2 ? "Multiple parties" : raw.holders.length === 2 ? "Single JV" : chance(0.12) ? "Disputed" : "Clean";
  const royaltyPct = +rf(1, 3.5).toFixed(1);
  const encumbrances: string[] = [];
  if (chance(0.5)) encumbrances.push(`${royaltyPct}% gross royalty (legacy vendor)`);
  if (chance(0.22)) encumbrances.push("Net smelter return — 1.5% NSR");
  if (chance(0.16)) encumbrances.push("Registered caveat — financier security");

  const drillHoles = Math.round(Math.max(0, (rng() < 0.2 ? rf(0, 25) : rf(20, 1200)) * (licenceType === "Mining" ? 1.4 : 1)));

  // ---- factors (real dates/area/region drive these) ----
  const sub: Record<string, number> = {};
  sub.age = clamp(38 + ageYears * 1.7 + noise(8), 20, 97);
  sub.expiry = dUntilY < 0 ? clamp(28 + noise(10), 12, 50)
    : dUntilY < 1.5 ? clamp(86 - dUntilY * 6 + noise(7))
      : dUntilY < 4 ? clamp(72 - (dUntilY - 1.5) * 4 + noise(7)) : clamp(58 + noise(8));
  sub.commodity = clamp(COMMODITY_DEMAND[primary] + (commodities.length - 1) * 4 + noise(7));
  sub.nearbyMines = clamp(50 + nearbyMines.length * 10 + (42 - minDist) * 0.8 + noise(8));
  sub.drilling = clamp(40 + Math.log10(drillHoles + 1) * 22 + noise(9));
  sub.prospectivity = clamp(PROV_BASE[region] + (primary === "Gold" || primary === "Lithium" ? 6 : 2) + noise(9));
  const neighbourQuality = rf(6, 50);
  sub.adjacency = clamp(46 + neighbourQuality + noise(8));
  sub.ownership = clamp({ Clean: 92, "Single JV": 72, "Multiple parties": 50, Disputed: 28 }[ownershipComplexity] + noise(6));
  sub.encumbrance = clamp(94 - encumbrances.length * 20 + noise(6));
  sub.activity = clamp(38 + neighbourQuality * 0.8 + noise(14));
  sub.data = clamp(64 + drillHoles / 30 + noise(10), 52, 98);

  const factors: ScoreFactor[] = FACTOR_DEFS.map((def) => ({
    key: def.key, label: def.label, weight: def.weight, value: Math.round(sub[def.key]), note: def.hint,
  }));
  const score = computeScore(factors);
  const b = band(score);

  const riskFlags: { label: string; level: RiskLevel }[] = [];
  if (dUntilY < 0) riskFlags.push({ label: "Expired — renewal/forfeiture", level: "high" });
  else if (dUntilY < 1) riskFlags.push({ label: "Expiry < 12 months", level: "elevated" });
  if (ownershipComplexity === "Multiple parties") riskFlags.push({ label: "Multiple-party title", level: "moderate" });
  if (ownershipComplexity === "Disputed") riskFlags.push({ label: "Ownership dispute on record", level: "high" });
  if (encumbrances.length >= 2) riskFlags.push({ label: "Stacked royalty / NSR load", level: "elevated" });
  else if (encumbrances.length === 1) riskFlags.push({ label: "Legacy royalty", level: "low" });
  if (sub.data < 60) riskFlags.push({ label: "Sparse modern data", level: "moderate" });
  if (chance(0.28)) riskFlags.push({ label: "Native title claim overlap", level: "moderate" });
  if (chance(0.2)) riskFlags.push({ label: "Expenditure shortfall", level: "elevated" });

  const action = actionFromScore(score, riskFlags.filter((r) => r.level === "high" || r.level === "elevated").length);

  // ---- AI note ----
  const neighbour = pick([...MIDCAPS]).split(" ")[0];
  const neighbourName = titleCase(pick(MIDCAPS)) + (chance(0.5) ? " Resources" : " Mining");
  const upPool: Record<string, string> = {
    age: `De-risked legacy ground granted ${grantYr}, predating the current ${primary.toLowerCase()} cycle.`,
    expiry: `Approaching expiry (${expiryLabel}) — distressed-entry leverage for an acquirer.`,
    commodity: `${primary} exposure aligned with a structurally tight supply outlook.`,
    nearbyMines: `${nearMine} sits ${nearMineKm} km away — toll-treat / consolidation path.`,
    drilling: `${drillHoles} historic drill holes de-risk targets and cut re-entry spend.`,
    prospectivity: `Favourable ${belt.host} stratigraphy on the ${belt.belt}.`,
    adjacency: `Pinned against ${neighbourName}'s ground — clear takeover optionality.`,
    ownership: `Clean single-party title — fast, low-friction to transact.`,
    activity: `Live neighbouring exploration lifting district heat.`,
    data: `Coverage and recency of records support a confident read.`,
  };
  const riskPool: Record<string, string> = {
    ownership: `Title fragmented across parties — protracted, costly to consolidate.`,
    encumbrance: `Carries a ${royaltyPct}% royalty / NSR that compresses acquirer returns.`,
    expiry: `Expenditure shortfall risk; forfeiture exposure if commitments unmet.`,
    commodity: `${primary} pricing soft near-term with limited re-rating catalyst.`,
    data: `Sparse modern data — rating carries elevated estimation error.`,
    nearbyMines: `No nearby processing — standalone development is capital intensive.`,
    drilling: `Thin drilling history; target geometry remains conceptual.`,
    prospectivity: `Marginal host stratigraphy; mineral-system fit unproven.`,
    adjacency: `Isolated from majors — limited corporate-appeal premium.`,
    activity: `Activity has cooled locally; catalysts are further out.`,
  };
  const contrib = factors.map((f) => ({ key: f.key, c: f.value * f.weight, v: f.value }));
  const upside = Array.from(new Set([...contrib].sort((a, z) => z.c - a.c).slice(0, 5).map((x) => upPool[x.key]))).slice(0, 3);
  const risks = Array.from(new Set([...contrib].sort((a, z) => a.v - z.v).slice(0, 5).map((x) => riskPool[x.key]))).slice(0, 3);
  const bandWord = b === "high" ? "compelling" : b === "mid" ? "credible but unproven" : "speculative";
  const expiryClause = dUntilY < 0 ? "is currently in renewal, a forced event an acquirer can exploit"
    : dUntilY < 1.5 ? `expires in ${expiryLabel}, opening a near-term acquisition window`
      : `runs to ${new Date(expiryDate).getFullYear()}, giving runway to prove value`;
  const closeline = action === "Acquire" ? "we would move to secure exclusivity ahead of the market"
    : action === "Investigate" ? "warranting a focused data-room and title review"
      : action === "Monitor" ? "best tracked for a cheaper entry or a catalyst" : "we would pass absent a material change in terms";
  const thesis = `${raw.id} offers ${bandWord} exposure to ${primary.toLowerCase()} in the ${reg.name} (${DISTRICTS[region][0]} district), ${nearMineKm} km from ${nearMine}. Granted ${grantYr}, the ${areaHa.toLocaleString()}-ha holding ${expiryClause}. Host setting is the ${belt.belt}. On balance the ground screens as ${action.toLowerCase()} — ${closeline}.`;
  const confidence = clamp(Math.round(40 + sub.data * 0.34 + sub.drilling * 0.16 + nearbyMines.length * 2), 38, 95);
  const nextStep = action === "Acquire" ? "Open data room; model acquisition at comparable EV/ha."
    : action === "Investigate" ? "Pull WAMEX reports; verify title and royalty chain."
      : action === "Monitor" ? "Set expiry + neighbour-activity alerts; revisit on catalyst." : "Archive; flag only on ownership or status change.";
  const verdict = action === "Acquire" ? "High-conviction acquisition candidate"
    : action === "Investigate" ? "Worth a serious second look"
      : action === "Monitor" ? (b === "mid" ? "Hold and watch for a catalyst" : "Marginal — monitor only") : "Below threshold — likely pass";

  // ---- register ----
  const fieldNo = raw.id.replace(/[^0-9/]/g, "").split("/")[0] || String(ri(1, 80));
  const mgaZone = Math.floor((raw.lng + 180) / 6) + 1;
  const rentPerYear = Math.round(licenceType === "Exploration" ? blocks * 158 : licenceType === "Prospecting" ? areaHa * 3.6 : licenceType === "Mining" ? areaHa * 18.5 : areaHa * 5);
  const minExpenditure = Math.round(licenceType === "Exploration" ? blocks * rf(1000, 1500) : licenceType === "Prospecting" ? areaHa * rf(45, 75) : licenceType === "Mining" ? areaHa * rf(95, 150) : areaHa * rf(15, 35));
  const register: TenureRegister = {
    mineralField: `${MINERAL_FIELD[region]} M.F. (${fieldNo})`,
    datum: `GDA2020 / MGA Zone ${mgaZone}`,
    coords: `${Math.abs(raw.lat).toFixed(3)}°S  ${raw.lng.toFixed(3)}°E`,
    subBlocks: blocks, rentPerYear, minExpenditure,
    expenditureToDate: Math.round(minExpenditure * Math.max(1, ageYears) * rf(1.1, 2.3)),
    combinedReporting: chance(0.32), nativeTitle: pick(NATIVE_TITLE), heritage: pick(HERITAGE),
    lga: pick(LGA[region]), mapSheet: pick(MAP_SHEET[region]),
    survey: licenceType === "Mining" ? pick(["Surveyed", "Surveyed", "Survey pending"]) : pick(["Graphic", "Surveyed", "Survey pending"]),
    applicationDate: new Date(new Date(grantDate).getTime() - rf(0.3, 1.4) * YEAR).toISOString(),
    lastDealing: { date: new Date(now - rf(0.2, 4) * YEAR).toISOString(), type: pick(DEALINGS) },
  };

  // ---- economics ----
  const evPerHa = Math.round(EV_BASE[primary] * (0.78 + (PROV_BASE[region] / 80) * 0.28) * rf(0.72, 1.4) * (commodities.length > 1 ? 1.1 : 1));
  const impliedEvMidM = +((evPerHa * areaHa) / 1e6).toFixed(2);
  let entry = 0.62;
  if (dUntilY < 1.5) entry -= 0.12;
  if (holderType === "Private" || holderType === "Individual") entry -= 0.1;
  if (ownershipComplexity === "Multiple parties" || ownershipComplexity === "Disputed") entry += 0.08;
  if (score < 60) entry -= 0.06;
  entry = Math.max(0.28, Math.min(0.82, entry + noise(0.04)));
  const acqCostM = +(impliedEvMidM * entry).toFixed(2);
  const maxBidM = +(impliedEvMidM * 0.82).toFixed(2);
  const upliftPct = Math.round((impliedEvMidM / Math.max(0.05, acqCostM) - 1) * 100);
  const holdingCostPa = rentPerYear + minExpenditure;
  const acquirers = Array.from(new Set([titleCase(pick(MIDCAPS)) + " Resources", titleCase(pick(MAJORS)) + " Ltd"]));
  const play: Econ["play"] = upliftPct >= 55 && (dUntilY < 2 || holderType === "Private" || holderType === "Individual") ? "Flip"
    : score >= 80 && nearbyMines.some((m) => m.status === "Producing") ? "Consolidate" : score >= 68 ? "Hold & develop" : "Pass";
  const flipThesis = play === "Flip"
    ? `Secure near the comparable floor (~A$${acqCostM.toFixed(1)}m) and on-sell to ${acquirers[0]} at consolidation value (A$${impliedEvMidM.toFixed(1)}m) — ~${upliftPct}% gross uplift against a modest A$${Math.round(holdingCostPa / 1000)}k/yr carry.`
    : play === "Consolidate" ? `Bolt-on to ${acquirers[0]}'s adjacent footprint; value accrues via shared mill / infrastructure.`
      : play === "Hold & develop" ? `Carry at A$${Math.round(holdingCostPa / 1000)}k/yr and advance low-cost drilling to firm the resource case.`
        : `Economics do not clear the hurdle at current terms; entry only on a distressed / forfeiture event.`;
  const econ: Econ = {
    evPerHa, impliedEvLowM: +(impliedEvMidM * 0.7).toFixed(2), impliedEvMidM, impliedEvHighM: +(impliedEvMidM * 1.3).toFixed(2),
    acqCostM, maxBidM, holdingCostPa, upliftPct, acquirers, flipThesis, play,
  };

  // ---- AI analog-prospectivity target (nearology over real deposits) ----
  const within25 = deposits ? deposits.filter((d) => haversineKm(raw.lat, raw.lng, d.lat, d.lng) <= 25) : [];
  const endowment = within25.length;
  const producingNear = within25.filter((d) => /Producing/i.test(d.stage)).length;
  const nearestKm = near[0]?.km ?? 999;
  const targetScore = Math.round(clamp(
    Math.min(40, endowment * 3) +
    (nearestKm < 5 ? 24 : nearestKm < 12 ? 16 : nearestKm < 25 ? 8 : 0) +
    Math.min(16, producingNear * 4) +
    (drillHoles < 120 ? 16 : drillHoles < 400 ? 8 : 0) +
    noise(6),
  ));
  const analogs = near.slice(0, 3).map((x) => x.d.name);
  const target = {
    score: targetScore, endowment, nearestKm: Math.round(nearestKm),
    analogs,
    rationale: endowment
      ? `${endowment} recorded ${primary.toLowerCase()} occurrence${endowment === 1 ? "" : "s"} within 25 km (nearest ${analogs[0] ?? "—"} at ${Math.round(nearestKm)} km)${producingNear ? `, ${producingNear} producing` : ""}; ${drillHoles < 120 ? "this ground is lightly drilled — strong analog-uplift potential." : "moderately tested — incremental analog potential."}`
      : `Sparse recorded mineralisation nearby; speculative analog case only.`,
  };

  // ---- mission opportunity score (overlooked / near-expiry / old-but-resourced) ----
  const oppSignals: string[] = [];
  const ageYrs = Math.round(ageYears);
  const oldComp = Math.min(25, Math.max(0, (ageYears - 5) * 1.6));
  if (ageYears >= 15) oppSignals.push(`Old (${ageYrs}y)`);
  const expComp = dUntilY < 0 ? 22 : dUntilY < 1 ? 20 : dUntilY < 2 ? 12 : dUntilY < 4 ? 4 : 0;
  if (dUntilY < 0) oppSignals.push("Expired / in renewal");
  else if (dUntilY < 2) oppSignals.push("Near expiry");
  const undComp = Math.min(25, Math.max(0, upliftPct) * 0.17);
  if (upliftPct >= 60) oppSignals.push(`Undervalued +${upliftPct}%`);
  const resComp = Math.min(22, endowment * 1.4 + producingNear * 2);
  if (endowment >= 4) oppSignals.push(`Resourced (${endowment} nearby)`);
  const ovrComp = holderType === "Private" || holderType === "Individual" ? 12 : holderType === "Junior" ? 7 : holderType === "Mid-cap" ? 2 : 0;
  if (holderType === "Private" || holderType === "Individual") oppSignals.push("Privately held");
  const opportunity = {
    score: Math.round(clamp(oldComp + expComp + undComp + resComp + ovrComp)),
    signals: oppSignals.slice(0, 5),
  };

  // ---- timeline (from real dates) ----
  const timeline: TimelineEvent[] = [];
  timeline.push({ date: grantDate, type: "grant", title: `${licenceType} licence granted`, detail: `${raw.id} granted (DMIRS register).` });
  if (chance(0.6)) timeline.push({ date: new Date(new Date(grantDate).getTime() + rf(0.5, 6) * YEAR).toISOString(), type: "transfer", title: "Title dealing", detail: `${register.lastDealing.type} — ${holder}.` });
  const campaigns = ri(1, 3);
  for (let i = 0; i < campaigns; i++) {
    timeline.push({
      date: new Date(now - rf(0.6, Math.max(1, ageYears) * 0.7) * YEAR).toISOString(), type: "drilling",
      title: `${pick(["RC", "Diamond", "Aircore", "RAB"])} drilling — ${ri(6, 60)} holes`,
      detail: `${pick(["Best intercept", "Peak result"])} ${rf(1, 18).toFixed(1)}m @ ${rf(0.8, 14).toFixed(1)} ${primary === "Gold" ? "g/t Au" : primary === "Lithium" ? "% Li₂O" : "% " + primary[0]}.`,
    });
  }
  if (encumbrances.length) timeline.push({ date: new Date(now - rf(0.5, 3) * YEAR).toISOString(), type: "encumbrance", title: "Encumbrance registered", detail: encumbrances[0] });
  timeline.push({ date: new Date(now - rf(2, 60) * DAY).toISOString(), type: "activity", title: "Nearby exploration", detail: `${neighbourName} announced results ${ri(4, 30)} km along strike.` });
  timeline.push({ date: expiryDate, type: "expiry", title: dUntilY < 0 ? "Expiry lapsed" : "Scheduled expiry", detail: dUntilY < 0 ? "Awaiting renewal determination." : "Renewal / surrender decision point." });
  timeline.sort((a, z) => +new Date(a.date) - +new Date(z.date));

  return {
    id: raw.id, licenceType, status, holder, holderType, grantDate, expiryDate, areaHa, blocks, commodities,
    regionId: region, district: pick(DISTRICTS[region]), lng: raw.lng, lat: raw.lat, poly: raw.poly,
    nearbyMines,
    geologySummary: `${belt.host} sequence within the ${belt.belt}. ${pick(["Sheared contact", "Fold-hinge", "Granite–greenstone contact", "BIF-hosted"])} setting prospective for ${primary.toLowerCase()}; ${chance(0.5) ? "interpreted structural corridor mapped from aeromagnetics." : "limited modern geophysical coverage."}`,
    historicalActivity: drillHoles > 200 ? `Extensively explored — ${drillHoles}+ holes across ${campaigns} campaigns; historic non-JORC resource on record.`
      : drillHoles > 40 ? `Moderate history — ${drillHoles} holes, intermittent work; targets remain open at depth.`
        : `Lightly tested — ${drillHoles} holes; reliant on surface geochem and legacy mapping.`,
    drillHoles, riskFlags,
    strategicNotes: `${reg.blurb} ${holderType === "Individual" || holderType === "Private" ? "Privately held — likely undermanaged and open to approach." : holderType === "Major" ? "Held by a major; consolidation only via corporate channels." : "Junior holder — receptive to JV, farm-in or scheme."} Adjoins ${neighbourName} ground to the ${pick(["north", "east", "south", "west"])}.`,
    comps: [], score, factors,
    ai: { rating: clamp(score + Math.round(noise(3)), 1, 100), verdict, upside, risks, thesis, confidence, nextStep },
    action, timeline, ownershipComplexity, encumbrances, register, econ, target, opportunity, scorePercentile: 0,
    lastUpdated: new Date(now - rf(0, 6) * DAY).toISOString(), dealStage: null,
  };
}

/* ---------- enrich a batch + derive comps/alerts/feed/stats ---------- */
const COMP_PROJECTS: [string, RegionId, Commodity][] = [
  ["Gwalia South consolidation", "leonora", "Gold"], ["Mt Holland lithium farm-in", "yilgarn", "Lithium"],
  ["Bardoc gold tenement sale", "kalgoorlie", "Gold"], ["Beyondie REE acquisition", "gascoyne", "Rare Earths"],
  ["Widgiemooltha nickel JV", "coolgardie", "Nickel"], ["Pilgangoora satellite buy", "pilbara", "Lithium"],
  ["Cue gold royalty sale", "murchison", "Gold"], ["Forrestania nickel package", "yilgarn", "Nickel"],
  ["Laverton gold farm-in", "eastgoldfields", "Gold"], ["Marble Bar gold tenement sale", "pilbara", "Gold"],
  ["Greenbushes-adjacent acquisition", "southwest", "Lithium"], ["Sandstone gold consolidation", "murchison", "Gold"],
  ["Savannah base-metals JV", "kimberley", "Copper"], ["Kambalda nickel tenement sale", "kalgoorlie", "Nickel"],
];

export function enrichAll(raws: RawTenement[], now = Date.now(), deposits: Deposit[] = []) {
  const tenements = raws.map((r) => enrichTenement(r, now, deposits)).sort((a, z) => z.score - a.score);

  // percentile within region
  const byRegion: Record<string, Tenement[]> = {};
  tenements.forEach((t) => ((byRegion[t.regionId] ??= []).push(t)));
  Object.values(byRegion).forEach((arr) => arr.forEach((t) => {
    const below = arr.filter((o) => o.score < t.score).length;
    t.scorePercentile = arr.length > 1 ? Math.round((below / (arr.length - 1)) * 100) : 100;
  }));

  const rng = mulberry32(0x51b7);
  const rf = (a: number, b: number) => a + rng() * (b - a);
  const ri = (a: number, b: number) => Math.floor(a + rng() * (b - a + 1));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  const comps: CompTxn[] = COMP_PROJECTS.map(([project, region, commodity], i) => {
    const areaHa = Math.round(rf(800, 26000));
    const perHaBase = EV_BASE[commodity];
    const evPerHa = Math.round(perHaBase * rf(0.55, 1.9));
    const considerationM = +((evPerHa * areaHa) / 1e6).toFixed(1);
    return {
      id: `C${100 + i}`, project, region, commodity,
      date: new Date(now - ri(2, 40) * 30 * DAY).toISOString(), areaHa, considerationM, evPerHa,
      type: pick(["Acquisition", "Farm-in", "JV", "Royalty sale", "Tenement sale"] as CompTxn["type"][]),
      note: `${commodity} ground, ${REGION_MAP[region].name}. ${pick(["Cash + scrip", "All cash", "Staged earn-in", "Scrip + royalty"])}.`,
    };
  });
  tenements.forEach((t) => {
    const rel = comps.filter((c) => c.region === t.regionId || c.commodity === t.commodities[0]);
    t.comps = (rel.length ? rel : comps).slice(0, 3).map((c) => c.id);
  });

  // alerts derived from REAL register attributes (expiry, status, score, AI target)
  const raw: Alert[] = [];
  let an = 0;
  const push = (t: Tenement, type: AlertType, sev: AlertSeverity, title: string, message: string, ageDays: number) =>
    raw.push({ id: `A${200 + an++}`, type, severity: sev, tenementId: t.id, title, message, timestamp: new Date(now - ageDays * DAY).toISOString(), read: false });
  for (const t of tenements) {
    const dUntil = (+new Date(t.expiryDate) - now) / YEAR;
    const tgt = t.target?.score ?? 0;
    if (dUntil < 0)
      push(t, "expiry", "critical", `Expired — ${t.id}`, `${t.id} (${t.holder}) has lapsed and is in renewal/forfeiture — pegging or acquisition opportunity.`, rf(0, 3));
    else if (dUntil < 1)
      push(t, "expiry", "high", `Expiry approaching — ${t.id}`, `${t.id} (${t.holder}) expires in ~${Math.max(1, Math.round(dUntil * 12))} months. Renewal or acquisition window opening.`, rf(0, 6));
    if (t.status === "Pending" || t.status === "Application")
      push(t, "title", "medium", `Pending on register — ${t.id}`, `${t.id} is ${t.status.toLowerCase()} with DMIRS; monitor for grant or competing application.`, rf(0, 8));
    if (tgt >= 78)
      push(t, "adjacency", "high", `High prospectivity target — ${t.id}`, `${t.id} scores ${tgt}/100 on analog targeting. ${t.target?.rationale ?? ""}`, rf(0, 9));
    else if (t.score >= 85 && dUntil > 0 && dUntil < 2)
      push(t, "heat", "high", `Acquire-grade window — ${t.id}`, `${t.id} screens Acquire (${t.score}/100) with expiry in ${dUntil.toFixed(1)}y — time-boxed opportunity.`, rf(0, 7));
  }
  const sevRank: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  raw.sort((a, z) => sevRank[a.severity] - sevRank[z.severity] || +new Date(z.timestamp) - +new Date(a.timestamp));
  const alerts: Alert[] = raw.slice(0, 40).map((a, i) => ({ ...a, read: i % 5 === 4 }));

  const feedTpl: { type: FeedEventType; text: (t: Tenement) => string }[] = [
    { type: "application", text: (t) => `New ${t.licenceType.toLowerCase()} application lodged near ${t.district} (${REGION_MAP[t.regionId].name}).` },
    { type: "expiry", text: (t) => `${t.id} flagged for expiry review — ${t.holder}.` },
    { type: "transfer", text: (t) => `Title transfer registered on ${t.id}.` },
    { type: "exploration", text: (t) => `Drilling reported ${ri(3, 28)} km from ${t.id}: ${rf(2, 12).toFixed(1)}m @ ${rf(1, 9).toFixed(1)} g/t.` },
    { type: "score", text: (t) => `Haxax Score on ${t.id} ${rng() < 0.5 ? "rose" : "eased"} to ${t.score} after data refresh.` },
  ];
  const feed: FeedEvent[] = Array.from({ length: 24 }, (_, i) => {
    const t = pick(tenements); const tpl = pick(feedTpl);
    return { id: `F${i}-${ri(100, 999)}`, type: tpl.type, tenementId: t.id, text: tpl.text(t), timestamp: new Date(now - i * rf(40, 600) * 1000).toISOString() };
  }).sort((a, z) => +new Date(z.timestamp) - +new Date(a.timestamp));

  const stats = {
    tenements: tenements.length,
    deposits: tenements.reduce((a, t) => a + t.nearbyMines.length, 0),
    drillHoles: tenements.reduce((a, t) => a + t.drillHoles, 0),
    events: tenements.reduce((a, t) => a + t.timeline.length, 0),
    comps: comps.length, alerts: alerts.length,
    totalAreaHa: tenements.reduce((a, t) => a + t.areaHa, 0),
    highScore: tenements.filter((t) => t.score >= 85).length,
  };

  return { tenements, comps, alerts, feed, stats, deposits };
}
