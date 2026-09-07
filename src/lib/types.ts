/* ============================================================
   HAXAX — Domain types
   ============================================================ */

export type Commodity =
  | "Gold"
  | "Lithium"
  | "Iron Ore"
  | "Nickel"
  | "Rare Earths"
  | "Copper"
  | "Cobalt"
  | "Manganese";

export type LicenceType =
  | "Exploration"
  | "Prospecting"
  | "Mining"
  | "Retention"
  | "Miscellaneous";

export type TenementStatus =
  | "Live"
  | "Pending"
  | "Application"
  | "Granted"
  | "Expiring";

export type RegionId =
  | "pilbara"
  | "eastgoldfields"
  | "kalgoorlie"
  | "leonora"
  | "coolgardie"
  | "yilgarn"
  | "murchison"
  | "gascoyne"
  | "kimberley"
  | "southwest";

export type SuggestedAction =
  | "Acquire"
  | "Investigate"
  | "Monitor"
  | "Avoid";

export type DealStage =
  | "lead"
  | "reviewing"
  | "contacted"
  | "diligence"
  | "bid"
  | "passed";

export type RiskLevel = "low" | "moderate" | "elevated" | "high";

export interface Region {
  id: RegionId;
  name: string;
  /** centroid in lng/lat */
  lng: number;
  lat: number;
  /** rough bounds [west, south, east, north] for fly-to framing */
  bounds: [number, number, number, number];
  blurb: string;
}

export interface ScoreFactor {
  key: string;
  label: string;
  /** 0-100 sub-score */
  value: number;
  /** weight 0-1, weights across factors sum to 1 */
  weight: number;
  note: string;
}

export interface TimelineEvent {
  date: string; // ISO
  type:
    | "grant"
    | "transfer"
    | "drilling"
    | "report"
    | "application"
    | "status"
    | "expiry"
    | "activity"
    | "encumbrance";
  title: string;
  detail: string;
}

export interface AIOpinion {
  rating: number; // 0-100
  verdict: string; // one-liner
  upside: string[]; // 3
  risks: string[]; // 3
  thesis: string; // paragraph
  confidence: number; // 0-100
  nextStep: string;
}

/** Statutory tenure / register metadata — every field sourced from the live DMIRS register. */
export interface TenureRegister {
  datum: string; // e.g. "GDA2020 / MGA Zone 51" (standard CRS)
  coords: string; // formatted centroid (from real geometry)
  subBlocks: number; // graticular blocks (from real area)
  surveyStatus: string; // real DMIRS survstatus
}

export interface Tenement {
  id: string; // e.g. E47/3812
  licenceType: LicenceType;
  status: TenementStatus;
  holder: string; // primary holder (holder1)
  holders: string[]; // all registered holders
  holderAddress?: string; // registered address of the primary holder
  holderType: "Major" | "Mid-cap" | "Junior" | "Private" | "Individual"; // inferred from holder name
  grantDate: string; // ISO — real
  startDate: string; // ISO — real
  expiryDate: string; // ISO — real
  areaHa: number; // from real polygon geometry
  blocks: number; // graticular blocks (derived from area)
  commodities: Commodity[]; // inferred from nearest MINEDEX deposit
  regionId: RegionId;
  district: string;
  /** centroid */
  lng: number;
  lat: number;
  /** polygon vertices in lng/lat (closed implicitly) */
  poly: [number, number][];
  nearbyMines: { name: string; commodity: Commodity; distanceKm: number; status: string }[]; // real MINEDEX
  endowment: number; // real recorded deposits within ~25 km
  drillHolesNearby: number; // real drill collars within ~10 km (0 if not yet computed)
  surveyStatus: string; // real DMIRS survey status
  specialInterest?: string; // real DMIRS special-interest flag
  riskFlags: { label: string; level: RiskLevel }[]; // derived only from real dates / holder count
  score: number; // transparent indicator computed from real inputs only (no randomness)
  factors: ScoreFactor[];
  ai: AIOpinion; // narrative grounded only in the real facts above
  action: SuggestedAction;
  timeline: TimelineEvent[]; // real register dates only
  ownershipComplexity: "Clean" | "Single JV" | "Multiple parties"; // from real holder count
  register: TenureRegister;
  context?: RealContext; // resolved on-demand from live geology/native-title/etc. layers
  target?: TargetSignal;
  opportunity?: OpportunitySignal;
  scorePercentile: number; // 0-100 percentile within its region
  lastUpdated: string; // ISO
  dealStage: DealStage | null;
}

/** Real statutory / geological context, resolved on-demand from live DMIRS/SLIP layers.
   Every field here is sourced directly from a government spatial service — nothing modelled. */
export interface RealContext {
  geology: { unit: string; code: string; description: string } | null; // GSWA interpreted bedrock geology
  mineralField: { field: string; district: string; number: string } | null; // DMIRS Mineral Field Boundaries
  lga: string | null; // Local Government Authority (Landgate)
  nativeTitle: { name: string; status: string; type: string; reference: string } | null; // NNTT / Fed Court
  mapSheet: string | null; // 1:250 000 geological map sheet
  wamexReports: number | null; // real WAMEX exploration reports within ~10 km
  drillHolesNearby: number | null; // real drill collars within ~10 km
  source: string; // attribution
  fetchedAt: string; // ISO
}

/** AI analog-prospectivity signal — likelihood of an undiscovered analogous deposit. */
export interface TargetSignal {
  score: number; // 0-100 prospectivity-target score
  endowment: number; // recorded deposits within ~25 km
  nearestKm: number; // distance to nearest recorded deposit
  analogs: string[]; // nearest analog deposit names
  rationale: string;
}

/** Mission score — overlooked / near-expiry / old-but-still-resourced opportunity. */
export interface OpportunitySignal {
  score: number; // 0-100
  signals: string[]; // contributing tags, e.g. "Old (31y)", "Near expiry", "Undervalued +120%"
}

export type AlertType =
  | "expiry"
  | "competitor"
  | "title"
  | "anomaly"
  | "heat"
  | "adjacency";

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  tenementId: string;
  title: string;
  message: string;
  timestamp: string; // ISO
  read: boolean;
}

export type FeedEventType =
  | "application"
  | "expiry"
  | "transfer"
  | "status"
  | "exploration"
  | "score";

export interface FeedEvent {
  id: string;
  type: FeedEventType;
  tenementId: string;
  text: string;
  timestamp: string; // ISO
}

export interface LayerState {
  tenements: boolean;
  mines: boolean;
  targets: boolean;
  geology: boolean;
  drillholes: boolean;
  faults: boolean;
  competitor: boolean;
  expiry: boolean;
  royalty: boolean;
  activity: boolean;
}

export type LayerKey = keyof LayerState;
