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

export interface CompTxn {
  id: string;
  project: string;
  region: RegionId;
  commodity: Commodity;
  date: string;
  areaHa: number;
  considerationM: number; // A$ millions
  evPerHa: number; // A$ / ha
  type: "Acquisition" | "Farm-in" | "JV" | "Royalty sale" | "Tenement sale";
  note: string;
}

/** Statutory tenure / register metadata (TENGRAPH / DMIRS style). */
export interface TenureRegister {
  mineralField: string;
  datum: string; // e.g. "GDA2020 / MGA Zone 51"
  coords: string; // formatted centroid
  subBlocks: number;
  rentPerYear: number; // A$
  minExpenditure: number; // A$/yr commitment
  expenditureToDate: number; // A$ cumulative
  combinedReporting: boolean;
  nativeTitle: string;
  heritage: string;
  lga: string; // local government area
  mapSheet: string; // 1:250k sheet
  survey: string;
  applicationDate: string; // ISO
  lastDealing: { date: string; type: string };
}

/** Acquisition / flip economics — the buy-or-flip lens. */
export interface Econ {
  evPerHa: number; // comparable mean
  impliedEvLowM: number;
  impliedEvMidM: number;
  impliedEvHighM: number;
  acqCostM: number; // estimated cost to secure
  maxBidM: number; // recommended ceiling
  holdingCostPa: number; // rent + min expenditure (A$/yr)
  upliftPct: number; // flip margin at mid EV vs acq cost
  acquirers: string[]; // likely strategic buyers
  flipThesis: string;
  play: "Flip" | "Hold & develop" | "Consolidate" | "Pass";
}

export interface Tenement {
  id: string; // e.g. E47/3812
  licenceType: LicenceType;
  status: TenementStatus;
  holder: string;
  holderType: "Major" | "Mid-cap" | "Junior" | "Private" | "Individual";
  grantDate: string; // ISO
  expiryDate: string; // ISO
  areaHa: number;
  blocks: number;
  commodities: Commodity[];
  regionId: RegionId;
  district: string;
  /** centroid */
  lng: number;
  lat: number;
  /** polygon vertices in lng/lat (closed implicitly) */
  poly: [number, number][];
  nearbyMines: { name: string; commodity: Commodity; distanceKm: number; status: string }[];
  geologySummary: string;
  historicalActivity: string;
  drillHoles: number;
  riskFlags: { label: string; level: RiskLevel }[];
  strategicNotes: string;
  comps: string[]; // ids referencing CompTxn
  score: number;
  factors: ScoreFactor[];
  ai: AIOpinion;
  action: SuggestedAction;
  timeline: TimelineEvent[];
  ownershipComplexity: "Clean" | "Single JV" | "Multiple parties" | "Disputed";
  encumbrances: string[];
  register: TenureRegister;
  econ: Econ;
  target?: TargetSignal;
  opportunity?: OpportunitySignal;
  scorePercentile: number; // 0-100 percentile within its region
  lastUpdated: string; // ISO
  dealStage: DealStage | null;
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
