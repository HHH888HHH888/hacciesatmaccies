/* ============================================================
   HAXAX — Seed data

   Deterministic, attribute-driven demo data for Western Australia.
   Geography is real (regions, mines, belts); holders and individual
   tenements are fictional. Scores emerge from the weighted factor
   model in scoring.ts, so the breakdown always reconciles.
   ============================================================ */

import type {
  Alert,
  AlertSeverity,
  AlertType,
  Commodity,
  CompTxn,
  Econ,
  FeedEvent,
  FeedEventType,
  LicenceType,
  RegionId,
  RiskLevel,
  ScoreFactor,
  Tenement,
  TenementStatus,
  TenureRegister,
  TimelineEvent,
} from "./types";
import { REGIONS, REGION_MAP } from "./geo";
import { FACTOR_DEFS, actionFromScore, band, computeScore } from "./scoring";

/** Anchor "now" — Perth time, mid-2026. */
export const NOW = new Date("2026-06-16T09:30:00+08:00").getTime();
const DAY = 86400000;
const YEAR = 365.25 * DAY;

/* ---------- deterministic PRNG ---------- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x9a4c11);
const rand = () => rng();
const ri = (a: number, b: number) => Math.floor(a + rng() * (b - a + 1));
const rf = (a: number, b: number) => a + rng() * (b - a);
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const chance = (p: number) => rng() < p;
// centre-biased noise in [-r, r]
const noise = (r: number) => (rng() + rng() + rng() - 1.5) * (r / 1.5);
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/* ---------- pools ---------- */
const HOLDERS: Record<Tenement["holderType"], string[]> = {
  Major: ["Westralia Iron Ltd", "Sentinel Mining Corp", "Pilbara Resources Group", "Cygnet Metals Ltd"],
  "Mid-cap": [
    "Goldfields Star Resources",
    "Norseman Gold NL",
    "Yandal Mining Ltd",
    "Carosue Resources Ltd",
    "Kambalda Nickel Co",
    "Leinster Metals Ltd",
  ],
  Junior: [
    "Leonora Gold NL",
    "Coolgardie Discovery Ltd",
    "Murchison Metals Group",
    "Yilgarn Star Exploration",
    "Bardoc Minerals Ltd",
    "Widgie Lithium Ltd",
    "Laverton Resources NL",
    "Menzies Gold Ltd",
    "Cue Copper Ltd",
    "Sandstone Exploration Ltd",
    "Ora Banda Frontier NL",
    "Kookynie Resources Ltd",
    "Paddington Metals Ltd",
    "Mt Magnet South NL",
    "Davyhurst Gold Ltd",
  ],
  Private: [
    "Bulletin Holdings Pty Ltd",
    "Davyhurst Nominees Pty Ltd",
    "Comet Vale Pastoral Co",
    "Niagara Capital Pty Ltd",
    "Broad Arrow Investments",
  ],
  Individual: ["B. Hannan", "P. O'Connor", "W. Brookman Estate", "D. Lindsay", "T. Flanagan"],
};

const DISTRICTS: Record<RegionId, string[]> = {
  pilbara: ["Newman", "Nullagine", "Marble Bar", "Pilgangoora", "Wodgina", "Tom Price"],
  eastgoldfields: ["Laverton", "Leinster", "Wiluna", "Yandal", "Carosue Dam"],
  kalgoorlie: ["Kalgoorlie", "Boulder", "Kanowna", "Kambalda", "St Ives"],
  leonora: ["Leonora", "Gwalia", "Mt Morgans", "Murrin Murrin", "Tarmoola"],
  coolgardie: ["Coolgardie", "Bullabulling", "Widgiemooltha", "Higginsville"],
  yilgarn: ["Southern Cross", "Marvel Loch", "Bullfinch", "Forrestania"],
  murchison: ["Mt Magnet", "Cue", "Meekatharra", "Sandstone", "Big Bell"],
  gascoyne: ["Gascoyne Junction", "Mt Augustus", "Gifford Creek"],
  kimberley: ["Halls Creek", "Kununurra", "Savannah", "Nicholsons"],
  southwest: ["Greenbushes", "Donnybrook", "Collie", "Boddington"],
};

const FIELD: Record<RegionId, number[]> = {
  pilbara: [45, 46, 47],
  eastgoldfields: [38, 39, 40],
  kalgoorlie: [15, 16, 26, 27],
  leonora: [37],
  coolgardie: [15, 16],
  yilgarn: [77],
  murchison: [20, 21, 51, 58, 59],
  gascoyne: [8, 9, 52],
  kimberley: [80],
  southwest: [70, 1, 4],
};

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
  pilbara: [["Mt Whaleback", "Iron Ore"], ["Pilgangoora", "Lithium"], ["Wodgina", "Lithium"], ["Hemi", "Gold"], ["Nullagine", "Gold"]],
  eastgoldfields: [["Sunrise Dam", "Gold"], ["Wallaby", "Gold"], ["Murrin Murrin", "Nickel"], ["King of the Hills", "Gold"], ["Mt Weld", "Rare Earths"]],
  kalgoorlie: [["Super Pit (KCGM)", "Gold"], ["St Ives", "Gold"], ["Kanowna Belle", "Gold"], ["Kambalda Nickel", "Nickel"]],
  leonora: [["Gwalia", "Gold"], ["King of the Hills", "Gold"], ["Thunderbox", "Gold"], ["Murrin Murrin", "Nickel"]],
  coolgardie: [["Bullabulling", "Gold"], ["Higginsville", "Gold"], ["Mt Marion", "Lithium"], ["Widgiemooltha Nickel", "Nickel"]],
  yilgarn: [["Marvel Loch", "Gold"], ["Forrestania", "Nickel"], ["Mt Holland", "Lithium"], ["Bounty", "Gold"]],
  murchison: [["Big Bell", "Gold"], ["Cue Central", "Gold"], ["Mt Magnet", "Gold"], ["DeGrussa", "Copper"]],
  gascoyne: [["Mt Augustus", "Gold"], ["Gifford Creek", "Rare Earths"], ["Abra", "Copper"]],
  kimberley: [["Savannah", "Nickel"], ["Nicholsons", "Gold"], ["Koongie Park", "Copper"]],
  southwest: [["Greenbushes", "Lithium"], ["Boddington", "Gold"], ["Mt Holland", "Lithium"]],
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
  Lithium: 92,
  "Rare Earths": 90,
  Gold: 87,
  Copper: 84,
  Nickel: 70,
  Cobalt: 68,
  "Iron Ore": 66,
  Manganese: 60,
};

/** Indicative EV/ha base rates (A$/ha) used for implied valuation. */
const EV_BASE: Record<Commodity, number> = {
  Lithium: 1900, "Rare Earths": 1400, Gold: 920, Copper: 720,
  Nickel: 640, Cobalt: 560, "Iron Ore": 400, Manganese: 320,
};

const MINERAL_FIELD: Record<RegionId, string> = {
  pilbara: "Pilbara", eastgoldfields: "Mt Margaret", kalgoorlie: "East Coolgardie",
  leonora: "Mt Margaret", coolgardie: "Coolgardie", yilgarn: "Yilgarn",
  murchison: "Murchison", gascoyne: "Gascoyne", kimberley: "Kimberley", southwest: "Greenbushes",
};

const LGA: Record<RegionId, string[]> = {
  pilbara: ["Shire of Ashburton", "Town of Port Hedland", "Shire of East Pilbara"],
  eastgoldfields: ["Shire of Laverton", "Shire of Leonora", "Shire of Wiluna", "Shire of Menzies"],
  kalgoorlie: ["City of Kalgoorlie-Boulder", "Shire of Coolgardie"],
  leonora: ["Shire of Leonora", "Shire of Menzies"],
  coolgardie: ["Shire of Coolgardie", "Shire of Dundas"],
  yilgarn: ["Shire of Yilgarn", "Shire of Westonia"],
  murchison: ["Shire of Mount Magnet", "Shire of Cue", "Shire of Meekatharra", "Shire of Sandstone"],
  gascoyne: ["Shire of Upper Gascoyne", "Shire of Meekatharra"],
  kimberley: ["Shire of Halls Creek", "Shire of Wyndham-East Kimberley"],
  southwest: ["Shire of Bridgetown-Greenbushes", "Shire of Donnybrook-Balingup", "Shire of Collie"],
};

const MAP_SHEET: Record<RegionId, string[]> = {
  pilbara: ["SF50-05 Roebourne", "SF51-09 Nullagine", "SF50-09 Pyramid"],
  eastgoldfields: ["SH51-02 Laverton", "SG51-16 Duketon", "SG51-12 Sir Samuel"],
  kalgoorlie: ["SH51-09 Kalgoorlie", "SH51-13 Widgiemooltha"],
  leonora: ["SH51-01 Leonora", "SG51-13 Sir Samuel"],
  coolgardie: ["SH51-09 Kalgoorlie", "SH51-13 Widgiemooltha"],
  yilgarn: ["SH50-12 Southern Cross", "SH50-16 Hyden"],
  murchison: ["SG50-12 Cue", "SG50-16 Mount Magnet", "SG50-11 Belele"],
  gascoyne: ["SG50-03 Glenburgh", "SG50-07 Mount Egerton"],
  kimberley: ["SE52-09 Dixon Range", "SE52-13 Gordon Downs"],
  southwest: ["SI50-05 Collie", "SI50-01 Pinjarra"],
};

const NATIVE_TITLE = [
  "Determination — native title exists", "Registered claim overlap", "ILUA executed",
  "s31 agreement in place", "No claim on record",
];
const HERITAGE = [
  "Heritage agreement in place", "Survey completed — no sites", "Survey outstanding",
  "Registered sites within boundary", "Avoidance areas mapped",
];
const SURVEY = ["Graphic", "Surveyed", "Survey pending"];
const DEALINGS = ["Transfer of interest", "Change of name", "Mortgage registered", "Sub-lease granted", "Caveat lodged", "Renewal granted"];

const LICENCE_PREFIX: Record<LicenceType, string> = {
  Exploration: "E",
  Prospecting: "P",
  Mining: "M",
  Retention: "R",
  Miscellaneous: "L",
};

const REGION_COUNTS: Record<RegionId, number> = {
  kalgoorlie: 11,
  leonora: 8,
  eastgoldfields: 9,
  coolgardie: 6,
  yilgarn: 7,
  murchison: 7,
  pilbara: 8,
  gascoyne: 4,
  kimberley: 3,
  southwest: 4,
};

/* ---------- geometry: graticular block polygons ---------- */
function blockPoly(lng: number, lat: number, areaHa: number): [number, number][] {
  // 1°×1° ≈ ~1.08M ha near 28°S; derive a half-extent in degrees.
  const deg = Math.sqrt(areaHa / 1_080_000);
  const aspect = rf(0.7, 1.5);
  const hw = (deg * aspect) / 2;
  const hh = deg / aspect / 2;
  const w = lng - hw, e = lng + hw, s = lat - hh, n = lat + hh;
  // graticular: optionally step one corner to read like real WA blocks
  if (chance(0.55)) {
    const sx = hw * rf(0.3, 0.6);
    const sy = hh * rf(0.3, 0.6);
    return [
      [w, n], [e - sx, n], [e - sx, n - sy], [e, n - sy],
      [e, s], [w, s],
    ];
  }
  return [[w, n], [e, n], [e, s], [w, s]];
}

/* ---------- AI reason templates ---------- */
function upsideFor(key: string, t: Partial<Tenement> & Record<string, any>): string {
  const c = t.commodities?.[0] ?? "gold";
  switch (key) {
    case "age": return `De-risked legacy ground granted ${t.grantYr}, predating the current ${c} cycle.`;
    case "expiry": return `Approaching expiry (${t.expiryLabel}) — distressed-entry leverage for an acquirer.`;
    case "commodity": return `${c} exposure aligned with a structurally tight supply outlook.`;
    case "nearbyMines": return `${t.nearMine} sits ${t.nearMineKm} km away — toll-treat / consolidation path.`;
    case "drilling": return `${t.drillHoles} historic drill holes de-risk targets and cut re-entry spend.`;
    case "prospectivity": return `Favourable ${t.host} stratigraphy on the ${t.belt}.`;
    case "adjacency": return `Pinned against ${t.neighbour}'s ground — clear takeover optionality.`;
    case "activity": return `Live neighbouring exploration and raisings lifting district heat.`;
    case "ownership": return `Clean single-party title — fast, low-friction to transact.`;
    default: return `Coverage and recency of records support a confident read.`;
  }
}
function riskFor(key: string, t: Partial<Tenement> & Record<string, any>): string {
  const c = t.commodities?.[0] ?? "gold";
  switch (key) {
    case "ownership": return `Title fragmented across parties — protracted, costly to consolidate.`;
    case "encumbrance": return `Carries a ${t.royaltyPct}% royalty / NSR that compresses acquirer returns.`;
    case "expiry": return `Expenditure shortfall risk; forfeiture exposure if commitments unmet.`;
    case "commodity": return `${c} pricing soft near-term with limited re-rating catalyst.`;
    case "data": return `Sparse modern data — rating carries elevated estimation error.`;
    case "nearbyMines": return `No nearby processing — standalone development is capital intensive.`;
    case "drilling": return `Thin drilling history; target geometry remains conceptual.`;
    case "prospectivity": return `Marginal host stratigraphy; mineral-system fit unproven.`;
    case "adjacency": return `Isolated from majors — limited corporate-appeal premium.`;
    default: return `Activity has cooled locally; catalysts are further out.`;
  }
}

/* ---------- build one tenement ---------- */
let idCounter = 0;
const usedIds = new Set<string>();
function makeId(region: RegionId, type: LicenceType): string {
  const prefix = LICENCE_PREFIX[type];
  const field = pick(FIELD[region]);
  let id = "";
  do {
    id = `${prefix}${String(field).padStart(2, "0")}/${ri(60, 5200)}`;
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

function buildTenement(region: RegionId): Tenement {
  idCounter++;
  const reg = REGION_MAP[region];
  const [w, s, e, n] = reg.bounds;
  const lng = clamp(rf(w + (e - w) * 0.12, e - (e - w) * 0.12), -200, 200);
  const lat = rf(s + (n - s) * 0.12, n - (n - s) * 0.12);

  const typeRoll = rng();
  const licenceType: LicenceType =
    typeRoll < 0.5 ? "Exploration" : typeRoll < 0.72 ? "Prospecting" : typeRoll < 0.88 ? "Mining" : typeRoll < 0.95 ? "Retention" : "Miscellaneous";

  const id = makeId(region, licenceType);

  // commodities
  const commodities: Commodity[] = [];
  const primary = pick(REGION_COMMODITIES[region]);
  commodities.push(primary);
  if (chance(0.4)) {
    const c2 = pick(REGION_COMMODITIES[region]);
    if (!commodities.includes(c2)) commodities.push(c2);
  }

  // dates
  const ageYears = rf(3, 38) * (chance(0.4) ? rf(0.9, 1.25) : 1);
  const grantDate = new Date(NOW - ageYears * YEAR).toISOString();
  const grantYr = new Date(grantDate).getFullYear();
  const expiryOffset = (() => {
    const r = rng();
    if (r < 0.1) return rf(-1.2, -0.05) * YEAR; // expired
    if (r < 0.28) return rf(0.05, 1.4) * YEAR; // expiring soon
    if (r < 0.7) return rf(1.4, 4) * YEAR;
    return rf(4, 6.5) * YEAR;
  })();
  const expiryDate = new Date(NOW + expiryOffset).toISOString();
  const dUntilY = expiryOffset / YEAR;
  const expiryLabel =
    dUntilY < 0 ? "expired" : dUntilY < 1 ? `${Math.round(dUntilY * 12)} months` : `${dUntilY.toFixed(1)} years`;

  // area
  const areaHa =
    licenceType === "Prospecting" ? rf(120, 900)
      : licenceType === "Mining" ? rf(400, 3500)
        : licenceType === "Exploration" ? rf(1500, 28000)
          : rf(300, 4000);
  const blocks = Math.max(1, Math.round(areaHa / 320));

  // nearby mines
  const pool = NEARBY[region];
  const nm = ri(1, Math.min(4, pool.length));
  const chosen = [...pool].sort(() => rng() - 0.5).slice(0, nm);
  const nearbyMines = chosen.map(([name, commodity]) => ({
    name,
    commodity,
    distanceKm: Math.round(rf(2, 42)),
    status: pick(["Producing", "Producing", "Care & maintenance", "Development", "Historic"]),
  }));
  const nearMine = nearbyMines[0].name;
  const nearMineKm = nearbyMines[0].distanceKm;
  const minDist = Math.min(...nearbyMines.map((m) => m.distanceKm));

  // ownership & encumbrance
  const holderType: Tenement["holderType"] = pick(
    region === "pilbara" || region === "southwest"
      ? (["Junior", "Mid-cap", "Major", "Junior", "Private"] as const)
      : (["Junior", "Junior", "Mid-cap", "Private", "Individual"] as const),
  );
  const holder = pick(HOLDERS[holderType]);
  const ownershipComplexity: Tenement["ownershipComplexity"] = pick([
    "Clean", "Clean", "Single JV", "Multiple parties", chance(0.15) ? "Disputed" : "Clean",
  ]);
  const royaltyPct = +(rf(1, 3.5).toFixed(1));
  const encumbrances: string[] = [];
  if (chance(0.5)) encumbrances.push(`${royaltyPct}% gross royalty (legacy vendor)`);
  if (chance(0.22)) encumbrances.push("Net smelter return — 1.5% NSR");
  if (chance(0.18)) encumbrances.push("Registered caveat — financier security");
  if (chance(0.12)) encumbrances.push("Cross-tenement access deed");

  const drillHoles = Math.round(Math.max(0, (rng() < 0.2 ? rf(0, 25) : rf(20, 1200)) * (licenceType === "Mining" ? 1.4 : 1)));

  // ---- factor sub-scores (0-100) ----
  const belt = BELT[region];
  const sub: Record<string, number> = {};
  sub.age = clamp(38 + ageYears * 1.7 + noise(8), 20, 97);
  sub.expiry =
    dUntilY < 0 ? clamp(28 + noise(10), 12, 50)
      : dUntilY < 1.5 ? clamp(86 - dUntilY * 6 + noise(7))
        : dUntilY < 4 ? clamp(72 - (dUntilY - 1.5) * 4 + noise(7))
          : clamp(58 + noise(8));
  sub.commodity = clamp(COMMODITY_DEMAND[primary] + (commodities.length - 1) * 4 + noise(7));
  sub.nearbyMines = clamp(50 + nearbyMines.length * 10 + (42 - minDist) * 0.8 + noise(8));
  sub.drilling = clamp(40 + Math.log10(drillHoles + 1) * 22 + noise(9));
  const provBase: Record<RegionId, number> = {
    kalgoorlie: 90, leonora: 88, eastgoldfields: 86, coolgardie: 82, yilgarn: 80,
    murchison: 78, pilbara: 84, gascoyne: 70, kimberley: 68, southwest: 87,
  };
  sub.prospectivity = clamp(provBase[region] + (primary === "Gold" || primary === "Lithium" ? 6 : 2) + noise(9));
  const neighbourQuality = rf(6, 50);
  sub.adjacency = clamp(46 + neighbourQuality + noise(8));
  sub.ownership = clamp(
    { Clean: 92, "Single JV": 72, "Multiple parties": 50, Disputed: 28 }[ownershipComplexity] + noise(6),
  );
  sub.encumbrance = clamp(94 - encumbrances.length * 20 + noise(6));
  sub.activity = clamp(38 + neighbourQuality * 0.8 + noise(14));
  sub.data = clamp(64 + drillHoles / 30 + noise(10), 52, 98);

  const factors: ScoreFactor[] = FACTOR_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    weight: def.weight,
    value: Math.round(sub[def.key]),
    note: def.hint,
  }));
  const score = computeScore(factors);
  const b = band(score);

  // risk flags
  const riskFlags: { label: string; level: RiskLevel }[] = [];
  if (dUntilY < 0) riskFlags.push({ label: "Expired — renewal/forfeiture", level: "high" });
  else if (dUntilY < 1) riskFlags.push({ label: "Expiry < 12 months", level: "elevated" });
  if (ownershipComplexity === "Multiple parties") riskFlags.push({ label: "Multiple-party title", level: "moderate" });
  if (ownershipComplexity === "Disputed") riskFlags.push({ label: "Ownership dispute on record", level: "high" });
  if (encumbrances.length >= 2) riskFlags.push({ label: "Stacked royalty / NSR load", level: "elevated" });
  else if (encumbrances.length === 1) riskFlags.push({ label: "Legacy royalty", level: "low" });
  if (sub.data < 60) riskFlags.push({ label: "Sparse modern data", level: "moderate" });
  if (chance(0.3)) riskFlags.push({ label: "Native title claim overlap", level: "moderate" });
  if (chance(0.22)) riskFlags.push({ label: "Heritage survey outstanding", level: "low" });
  if (chance(0.2)) riskFlags.push({ label: "Expenditure shortfall", level: "elevated" });

  const action = actionFromScore(score, riskFlags.filter((r) => r.level === "high" || r.level === "elevated").length);

  // ---- AI opinion ----
  const ctx = {
    commodities, grantYr, expiryLabel, drillHoles, nearMine, nearMineKm,
    host: belt.host, belt: belt.belt, neighbour: pick(HOLDERS["Mid-cap"]), royaltyPct,
  };
  // top contributors → upside, bottom → risk
  const contrib = factors.map((f) => ({ key: f.key, c: f.value * f.weight, v: f.value }));
  const upKeys = [...contrib].sort((a, z) => z.c - a.c).slice(0, 5).map((x) => x.key);
  const riskKeys = [...contrib].sort((a, z) => a.v - z.v).slice(0, 5).map((x) => x.key);
  const upside = dedupe(upKeys.map((k) => upsideFor(k, ctx))).slice(0, 3);
  const risks = dedupe(riskKeys.map((k) => riskFor(k, ctx))).slice(0, 3);

  const bandWord = b === "high" ? "compelling" : b === "mid" ? "credible but unproven" : "speculative";
  const expiryClause =
    dUntilY < 0 ? "is currently in renewal, a forced event an acquirer can exploit"
      : dUntilY < 1.5 ? `expires in ${expiryLabel}, opening a near-term acquisition window`
        : `runs to ${new Date(expiryDate).getFullYear()}, giving runway to prove value`;
  const closeline =
    action === "Acquire" ? "we would move to secure exclusivity ahead of the market"
      : action === "Investigate" ? "warranting a focused data-room and title review"
        : action === "Monitor" ? "best tracked for a cheaper entry or a catalyst"
          : "we would pass absent a material change in terms";
  const thesis =
    `${id} offers ${bandWord} exposure to ${primary.toLowerCase()} in the ${reg.name} (${DISTRICTS[region][0]} district), ` +
    `${nearMineKm} km from ${nearMine}. Granted ${grantYr}, the ${Math.round(areaHa).toLocaleString()}-ha holding ${expiryClause}. ` +
    `Host setting is the ${belt.belt}. On balance the ground screens as ${action.toLowerCase()} — ${closeline}.`;

  const confidence = clamp(Math.round(40 + sub.data * 0.34 + sub.drilling * 0.16 + nearbyMines.length * 2), 38, 95);
  const nextStep =
    action === "Acquire" ? "Open data room; model acquisition at comparable EV/ha."
      : action === "Investigate" ? "Pull WAMEX reports; verify title and royalty chain."
        : action === "Monitor" ? "Set expiry + neighbour-activity alerts; revisit on catalyst."
          : "Archive; flag only on ownership or status change.";

  // ---- timeline ----
  const timeline: TimelineEvent[] = [];
  timeline.push({ date: grantDate, type: "grant", title: `${licenceType} licence granted`, detail: `${id} granted to original holder.` });
  if (chance(0.7)) {
    const tDate = new Date(new Date(grantDate).getTime() + rf(0.5, 6) * YEAR).toISOString();
    timeline.push({ date: tDate, type: "transfer", title: "Title transfer", detail: `Transferred to ${holder}.` });
  }
  const campaigns = ri(1, 3);
  for (let i = 0; i < campaigns; i++) {
    const cd = new Date(NOW - rf(0.6, ageYears * 0.7) * YEAR).toISOString();
    timeline.push({
      date: cd, type: "drilling",
      title: `${pick(["RC", "Diamond", "Aircore", "RAB"])} drilling — ${ri(6, 60)} holes`,
      detail: `${pick(["Best intercept", "Peak result"])} ${rf(1, 18).toFixed(1)}m @ ${rf(0.8, 14).toFixed(1)} ${primary === "Gold" ? "g/t Au" : primary === "Lithium" ? "% Li₂O" : "% " + primary[0]}.`,
    });
  }
  if (chance(0.6)) timeline.push({ date: new Date(NOW - rf(0.2, 2) * YEAR).toISOString(), type: "report", title: "WAMEX report lodged", detail: "Annual technical report submitted to DMIRS." });
  if (encumbrances.length) timeline.push({ date: new Date(NOW - rf(0.5, 3) * YEAR).toISOString(), type: "encumbrance", title: "Encumbrance registered", detail: encumbrances[0] });
  timeline.push({ date: new Date(NOW - rf(2, 60) * DAY).toISOString(), type: "activity", title: "Nearby exploration", detail: `${pick(HOLDERS["Junior"])} announced results ${ri(4, 30)} km along strike.` });
  timeline.push({ date: expiryDate, type: "expiry", title: dUntilY < 0 ? "Expiry lapsed" : "Scheduled expiry", detail: dUntilY < 0 ? "Awaiting renewal determination." : "Renewal / surrender decision point." });
  timeline.sort((a, z) => +new Date(a.date) - +new Date(z.date));

  const strategicNotes =
    `${reg.blurb} ${holderType === "Individual" || holderType === "Private" ? "Privately held — likely undermanaged and open to approach." : holderType === "Major" ? "Held by a major; consolidation only via corporate channels." : "Junior holder — receptive to JV, farm-in or scheme."} ` +
    `Adjoins ${ctx.neighbour} ground to the ${pick(["north", "east", "south", "west"])}.`;

  const geologySummary =
    `${belt.host} sequence within the ${belt.belt}. ${pick(["Sheared contact", "Fold-hinge", "Granite–greenstone contact", "BIF-hosted"])} setting prospective for ${primary.toLowerCase()}; ${chance(0.5) ? "interpreted structural corridor mapped from aeromagnetics." : "limited modern geophysical coverage."}`;

  const historicalActivity =
    drillHoles > 200
      ? `Extensively explored — ${drillHoles}+ holes across ${campaigns} campaigns since the 1990s; historic non-JORC resource on record.`
      : drillHoles > 40
        ? `Moderate history — ${drillHoles} holes, intermittent work; targets remain open at depth.`
        : `Lightly tested — ${drillHoles} holes; largely reliant on surface geochem and legacy mapping.`;

  const status: TenementStatus =
    dUntilY < 0 ? "Pending" : licenceType === "Mining" || chance(0.7) ? "Live" : chance(0.5) ? "Granted" : dUntilY < 1 ? "Expiring" : "Live";

  // ---- tenure register ----
  const fieldNo = id.slice(1, id.indexOf("/"));
  const mgaZone = Math.floor((lng + 180) / 6) + 1;
  const rentPerYear = Math.round(
    licenceType === "Exploration" ? blocks * 158
      : licenceType === "Prospecting" ? areaHa * 3.6
        : licenceType === "Mining" ? areaHa * 18.5
          : areaHa * 5,
  );
  const minExpenditure = Math.round(
    licenceType === "Exploration" ? blocks * rf(1000, 1500)
      : licenceType === "Prospecting" ? areaHa * rf(45, 75)
        : licenceType === "Mining" ? areaHa * rf(95, 150)
          : licenceType === "Retention" ? areaHa * rf(20, 40)
            : areaHa * rf(10, 20),
  );
  const register: TenureRegister = {
    mineralField: `${MINERAL_FIELD[region]} M.F. (${fieldNo})`,
    datum: `GDA2020 / MGA Zone ${mgaZone}`,
    coords: `${Math.abs(lat).toFixed(3)}°S  ${lng.toFixed(3)}°E`,
    subBlocks: blocks,
    rentPerYear,
    minExpenditure,
    expenditureToDate: Math.round(minExpenditure * ageYears * rf(1.1, 2.3)),
    combinedReporting: chance(0.32),
    nativeTitle: pick(NATIVE_TITLE),
    heritage: pick(HERITAGE),
    lga: pick(LGA[region]),
    mapSheet: pick(MAP_SHEET[region]),
    survey: licenceType === "Mining" ? pick(["Surveyed", "Surveyed", "Survey pending"]) : pick(SURVEY),
    applicationDate: new Date(new Date(grantDate).getTime() - rf(0.3, 1.4) * YEAR).toISOString(),
    lastDealing: { date: new Date(NOW - rf(0.2, 4) * YEAR).toISOString(), type: pick(DEALINGS) },
  };

  // ---- acquisition / flip economics ----
  const evPerHa = Math.round(
    EV_BASE[primary] * (0.78 + (provBase[region] / 80) * 0.28) * rf(0.72, 1.4) * (commodities.length > 1 ? 1.1 : 1),
  );
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
  const acquirers = [...HOLDERS.Major, ...HOLDERS["Mid-cap"]].filter((h) => h !== holder).sort(() => rng() - 0.5).slice(0, 2);
  const play: Econ["play"] =
    upliftPct >= 55 && (dUntilY < 2 || holderType === "Private" || holderType === "Individual") ? "Flip"
      : score >= 80 && nearbyMines.some((m) => m.status === "Producing") ? "Consolidate"
        : score >= 68 ? "Hold & develop"
          : "Pass";
  const flipThesis =
    play === "Flip"
      ? `Secure near the comparable floor (~A$${acqCostM.toFixed(1)}m) and on-sell to ${acquirers[0]} or ${acquirers[1]} at consolidation value (A$${impliedEvMidM.toFixed(1)}m) — ~${upliftPct}% gross uplift against a modest A$${Math.round(holdingCostPa / 1000)}k/yr carry.`
      : play === "Consolidate"
        ? `Bolt-on to ${acquirers[0]}'s adjacent footprint; value accrues via shared mill / infrastructure rather than a standalone flip.`
        : play === "Hold & develop"
          ? `Carry at A$${Math.round(holdingCostPa / 1000)}k/yr and advance low-cost drilling to firm the resource case ahead of any divestment.`
          : `Economics do not clear the hurdle at current terms; entry only justified on a distressed / forfeiture event.`;
  const econ: Econ = {
    evPerHa,
    impliedEvLowM: +(impliedEvMidM * 0.7).toFixed(2),
    impliedEvMidM,
    impliedEvHighM: +(impliedEvMidM * 1.3).toFixed(2),
    acqCostM, maxBidM, holdingCostPa, upliftPct, acquirers, flipThesis, play,
  };

  return {
    id, licenceType, status, holder, holderType, grantDate, expiryDate,
    areaHa: Math.round(areaHa), blocks, commodities, regionId: region, district: pick(DISTRICTS[region]),
    lng, lat, poly: blockPoly(lng, lat, areaHa), nearbyMines, geologySummary, historicalActivity,
    drillHoles, riskFlags, strategicNotes, comps: [], score, factors,
    ai: { rating: clamp(score + Math.round(noise(3)), 1, 100), verdict: verdictFor(action, b), upside, risks, thesis, confidence, nextStep },
    action, timeline, ownershipComplexity, encumbrances, register, econ, scorePercentile: 0,
    lastUpdated: new Date(NOW - rf(0, 14) * DAY).toISOString(),
    dealStage: null,
  };
}

function verdictFor(action: string, b: string): string {
  if (action === "Acquire") return "High-conviction acquisition candidate";
  if (action === "Investigate") return "Worth a serious second look";
  if (action === "Monitor") return b === "mid" ? "Hold and watch for a catalyst" : "Marginal — monitor only";
  return "Below threshold — likely pass";
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/* ---------- build all tenements ---------- */
function buildAll(): Tenement[] {
  const out: Tenement[] = [];
  (Object.keys(REGION_COUNTS) as RegionId[]).forEach((region) => {
    for (let i = 0; i < REGION_COUNTS[region]; i++) out.push(buildTenement(region));
  });
  return out.sort((a, z) => z.score - a.score);
}

export const TENEMENTS: Tenement[] = buildAll();

/* score percentile within each region */
(() => {
  const byRegion: Record<string, Tenement[]> = {};
  TENEMENTS.forEach((t) => ((byRegion[t.regionId] ??= []).push(t)));
  Object.values(byRegion).forEach((arr) => {
    arr.forEach((t) => {
      const below = arr.filter((o) => o.score < t.score).length;
      t.scorePercentile = arr.length > 1 ? Math.round((below / (arr.length - 1)) * 100) : 100;
    });
  });
})();

/* ---------- comparables ---------- */
const COMP_PROJECTS: [string, RegionId, Commodity][] = [
  ["Gwalia South consolidation", "leonora", "Gold"],
  ["Mt Holland lithium farm-in", "yilgarn", "Lithium"],
  ["Bardoc gold tenement sale", "kalgoorlie", "Gold"],
  ["Beyondie REE acquisition", "gascoyne", "Rare Earths"],
  ["Widgiemooltha nickel JV", "coolgardie", "Nickel"],
  ["Pilgangoora satellite buy", "pilbara", "Lithium"],
  ["Cue gold royalty sale", "murchison", "Gold"],
  ["Forrestania nickel package", "yilgarn", "Nickel"],
  ["Laverton gold farm-in", "eastgoldfields", "Gold"],
  ["Marble Bar gold tenement sale", "pilbara", "Gold"],
  ["Greenbushes-adjacent acquisition", "southwest", "Lithium"],
  ["Sandstone gold consolidation", "murchison", "Gold"],
  ["Savannah base-metals JV", "kimberley", "Copper"],
  ["Kambalda nickel tenement sale", "kalgoorlie", "Nickel"],
];

export const COMPS: CompTxn[] = COMP_PROJECTS.map(([project, region, commodity], i) => {
  const areaHa = Math.round(rf(800, 26000));
  const perHaBase = { Lithium: 1900, "Rare Earths": 1400, Gold: 900, Copper: 700, Nickel: 620, Cobalt: 540, "Iron Ore": 380, Manganese: 300 }[commodity];
  const evPerHa = Math.round(perHaBase * rf(0.55, 1.9));
  const considerationM = +((evPerHa * areaHa) / 1_000_000).toFixed(1);
  const monthsAgo = ri(2, 40);
  return {
    id: `C${100 + i}`,
    project, region, commodity,
    date: new Date(NOW - monthsAgo * 30 * DAY).toISOString(),
    areaHa, considerationM, evPerHa,
    type: pick(["Acquisition", "Farm-in", "JV", "Royalty sale", "Tenement sale"]),
    note: `${commodity} ground, ${REGION_MAP[region].name}. ${pick(["Cash + scrip", "All cash", "Staged earn-in", "Scrip + royalty"])}.`,
  };
});

// attach 2-3 relevant comps to each tenement
TENEMENTS.forEach((t) => {
  const rel = COMPS.filter((c) => c.region === t.regionId || c.commodity === t.commodities[0]);
  t.comps = (rel.length ? rel : COMPS).slice(0, 3).map((c) => c.id);
});

/* ---------- deal pipeline seeding ---------- */
const DEAL_STAGES = ["lead", "reviewing", "contacted", "diligence", "bid", "passed"] as const;
TENEMENTS.slice(0, 22).forEach((t, i) => {
  // bias higher-score tenements toward later stages
  const stageIdx = t.score >= 85 ? ri(2, 4) : t.score >= 70 ? ri(0, 3) : ri(0, 1) || (chance(0.3) ? 5 : 0);
  t.dealStage = DEAL_STAGES[Math.min(5, stageIdx)] as Tenement["dealStage"];
  if (i % 7 === 0) t.dealStage = "passed";
});

/* ---------- initial watchlist ---------- */
export const INITIAL_WATCHLIST: string[] = TENEMENTS.filter((t) => t.score >= 82).slice(0, 6).map((t) => t.id);

/* ---------- alerts ---------- */
const ALERT_DEFS: { type: AlertType; sev: AlertSeverity; title: (t: Tenement) => string; msg: (t: Tenement) => string }[] = [
  { type: "expiry", sev: "high", title: (t) => `Expiry approaching — ${t.id}`, msg: (t) => `${t.id} (${t.holder}) lapses soon. Renewal or acquisition window opening.` },
  { type: "competitor", sev: "medium", title: (t) => `Competitor movement near ${t.id}`, msg: (t) => `New application pegged adjacent to ${t.id} in ${t.district}.` },
  { type: "title", sev: "medium", title: (t) => `Title change — ${t.id}`, msg: (t) => `Holder of ${t.id} updated on the register. Verify chain of title.` },
  { type: "anomaly", sev: "low", title: (t) => `Data anomaly — ${t.id}`, msg: (t) => `Area discrepancy detected between TENGRAPH and internal record for ${t.id}.` },
  { type: "heat", sev: "medium", title: (t) => `District heat — ${REGION_MAP[t.regionId].name}`, msg: (t) => `Elevated pegging and raisings across ${REGION_MAP[t.regionId].name}; ${t.id} in-zone.` },
  { type: "adjacency", sev: "high", title: (t) => `Strategic adjacency — ${t.id}`, msg: (t) => `${t.id} now abuts a producer's expanding footprint. Consolidation premium likely.` },
];

export const ALERTS: Alert[] = (() => {
  const out: Alert[] = [];
  let n = 0;
  const pool = [...TENEMENTS].sort(() => rng() - 0.5);
  pool.slice(0, 26).forEach((t) => {
    const def = ((): typeof ALERT_DEFS[number] => {
      const dUntil = (+new Date(t.expiryDate) - NOW) / YEAR;
      if (dUntil < 1) return ALERT_DEFS[0];
      if (t.score >= 84) return ALERT_DEFS[5];
      return pick(ALERT_DEFS);
    })();
    const sev: AlertSeverity = def.type === "expiry" && (+new Date(t.expiryDate) - NOW) / YEAR < 0 ? "critical" : def.sev;
    out.push({
      id: `A${200 + n++}`, type: def.type, severity: sev, tenementId: t.id,
      title: def.title(t), message: def.msg(t),
      timestamp: new Date(NOW - rf(0.02, 10) * DAY).toISOString(), read: chance(0.25),
    });
  });
  return out.sort((a, z) => +new Date(z.timestamp) - +new Date(a.timestamp));
})();

/* ---------- live feed (seed + synthesiser) ---------- */
const FEED_TEMPLATES: { type: FeedEventType; text: (t: Tenement) => string }[] = [
  { type: "application", text: (t) => `New ${t.licenceType.toLowerCase()} application lodged near ${t.district} (${REGION_MAP[t.regionId].name}).` },
  { type: "expiry", text: (t) => `${t.id} flagged for expiry review — ${t.holder}.` },
  { type: "transfer", text: (t) => `Title transfer registered on ${t.id}.` },
  { type: "status", text: (t) => `${t.id} status moved to ${pick(["Live", "Pending", "Granted"])}.` },
  { type: "exploration", text: (t) => `Drilling reported ${ri(3, 28)} km from ${t.id}: ${rf(2, 12).toFixed(1)}m @ ${rf(1, 9).toFixed(1)} g/t.` },
  { type: "score", text: (t) => `Haxax Score on ${t.id} ${chance(0.5) ? "rose" : "eased"} to ${t.score} after data refresh.` },
];

function feedEventAt(ts: number): FeedEvent {
  const t = TENEMENTS[Math.floor(rng() * TENEMENTS.length)];
  const tpl = pick(FEED_TEMPLATES);
  return { id: `F${Math.floor(ts)}-${ri(100, 999)}`, type: tpl.type, tenementId: t.id, text: tpl.text(t), timestamp: new Date(ts).toISOString() };
}

export const FEED: FeedEvent[] = Array.from({ length: 24 }, (_, i) =>
  feedEventAt(NOW - i * rf(40, 600) * 1000),
).sort((a, z) => +new Date(z.timestamp) - +new Date(a.timestamp));

/** Non-deterministic live event for the ticker simulation. */
export function synthFeedEvent(): FeedEvent {
  const t = TENEMENTS[Math.floor(Math.random() * TENEMENTS.length)];
  const tpl = FEED_TEMPLATES[Math.floor(Math.random() * FEED_TEMPLATES.length)];
  return {
    id: `F${Date.now()}-${Math.floor(Math.random() * 999)}`,
    type: tpl.type, tenementId: t.id, text: tpl.text(t), timestamp: new Date().toISOString(),
  };
}

export function getTenement(id: string): Tenement | undefined {
  return TENEMENTS.find((t) => t.id === id);
}

/* ---------- aggregate stats for dashboards / data health ---------- */
export const STATS = {
  tenements: TENEMENTS.length,
  deposits: TENEMENTS.reduce((a, t) => a + t.nearbyMines.length, 0),
  drillHoles: TENEMENTS.reduce((a, t) => a + t.drillHoles, 0),
  events: TENEMENTS.reduce((a, t) => a + t.timeline.length, 0),
  comps: COMPS.length,
  alerts: ALERTS.length,
  totalAreaHa: TENEMENTS.reduce((a, t) => a + t.areaHa, 0),
  highScore: TENEMENTS.filter((t) => t.score >= 85).length,
};
