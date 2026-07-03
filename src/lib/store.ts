/* ============================================================
   HAXAX — global state (zustand)
   ============================================================ */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Alert,
  Commodity,
  CompTxn,
  DealStage,
  FeedEvent,
  LayerKey,
  LayerState,
  LicenceType,
  RegionId,
  SuggestedAction,
  Tenement,
  TenementStatus,
} from "./types";
import type { Deposit } from "./enrich";
import { ALERTS, COMPS, FEED, STATS, TENEMENTS } from "./seed";

export type DataStatus = "loading" | "live" | "mock" | "error";
export type Stats = typeof STATS;

export interface DataPayload {
  tenements: Tenement[];
  comps: CompTxn[];
  alerts: Alert[];
  feed: FeedEvent[];
  stats: Stats;
  deposits?: Deposit[];
  drillPoints?: { lng: number; lat: number }[];
  source?: string;
  live?: boolean;
  generatedAt?: string;
  regions?: number;
}

export type Theme = "dark" | "light";

export interface Filters {
  query: string;
  commodities: Commodity[];
  regions: RegionId[];
  licenceTypes: LicenceType[];
  statuses: TenementStatus[];
  actions: SuggestedAction[];
  holderTypes: string[];
  scoreMin: number;
  expiryMonths: number | null;
  onlyWatchlist: boolean;
}

const DEFAULT_FILTERS: Filters = {
  query: "",
  commodities: [],
  regions: [],
  licenceTypes: [],
  statuses: [],
  actions: [],
  holderTypes: [],
  scoreMin: 0,
  expiryMonths: null,
  onlyWatchlist: false,
};

const DEFAULT_LAYERS: LayerState = {
  tenements: true,
  mines: true,
  targets: false,
  geology: false,
  drillholes: false,
  faults: false,
  competitor: false,
  expiry: false,
  royalty: false,
  activity: false,
};

interface Store {
  // data (live WA register or bundled fallback)
  tenements: Tenement[];
  comps: CompTxn[];
  deposits: Deposit[];
  drillPoints: { lng: number; lat: number }[];
  stats: Stats;
  dataStatus: DataStatus;
  dataSource: string;
  dataGeneratedAt: string | null;
  dataRegions: number;
  setData: (p: DataPayload, status: "live" | "mock") => void;
  setDataStatus: (s: DataStatus) => void;
  addTenement: (t: Tenement) => void;

  // theme
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;

  // selection
  selectedId: string | null;
  hoverId: string | null;
  select: (id: string | null) => void;
  setHover: (id: string | null) => void;

  // filters
  filters: Filters;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  toggleArrayFilter: <K extends "commodities" | "regions" | "licenceTypes" | "statuses" | "actions">(
    key: K,
    value: Filters[K][number],
  ) => void;
  resetFilters: () => void;

  // map
  layers: LayerState;
  toggleLayer: (k: LayerKey) => void;
  layerOpacity: number;
  setLayerOpacity: (n: number) => void;
  scanMode: boolean;
  toggleScan: () => void;
  flyTo: { region: RegionId; nonce: number } | null;
  requestFlyTo: (region: RegionId) => void;

  // watchlist
  watchlist: string[];
  toggleWatch: (id: string) => void;
  isWatched: (id: string) => boolean;

  // deals
  deals: Record<string, DealStage | null>;
  moveDeal: (id: string, stage: DealStage) => void;

  // alerts
  alerts: Alert[];
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;

  // feed
  feed: FeedEvent[];
  pushFeed: (e: FeedEvent) => void;

  // command bar
  commandOpen: boolean;
  setCommandOpen: (b: boolean) => void;

  // last data refresh (for "live" timestamps)
  lastSync: number;
  bumpSync: () => void;

  // access lock (server-side gate + accounts)
  auth: { ready: boolean; gate: boolean; account: string | null; accounts: string[] };
  refreshAuth: () => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  login: (account: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

/* per-account persistence: watchlist/deals/theme are stored under a key
   scoped to the signed-in account, so each account is its own clean slate. */
let currentAccount: string | null = null;
const accountStorage = {
  getItem: (name: string) => (currentAccount ? localStorage.getItem(`${name}:${currentAccount}`) : null),
  setItem: (name: string, value: string) => { if (currentAccount) localStorage.setItem(`${name}:${currentAccount}`, value); },
  removeItem: (name: string) => { if (currentAccount) localStorage.removeItem(`${name}:${currentAccount}`); },
};

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      // data — starts on the bundled demo set, swapped for live on bootstrap
      tenements: TENEMENTS,
      comps: COMPS,
      deposits: [],
      drillPoints: [],
      stats: STATS,
      dataStatus: "loading",
      dataSource: "Connecting to WA register…",
      dataGeneratedAt: null,
      dataRegions: 0,
      setDataStatus: (s) => set({ dataStatus: s }),
      addTenement: (t) =>
        set((s) => (s.tenements.some((x) => x.id === t.id) ? {} : { tenements: [t, ...s.tenements] })),
      setData: (p, status) =>
        set((state) => {
          const ids = new Set(p.tenements.map((t) => t.id));
          // brand-new accounts start empty; only carry forward the account's own valid entries
          const watchlist = state.watchlist.filter((id) => ids.has(id));
          const deals: Record<string, DealStage | null> = {};
          Object.entries(state.deals).forEach(([id, st]) => { if (ids.has(id) && st) deals[id] = st; });
          return {
            tenements: p.tenements, comps: p.comps, deposits: p.deposits ?? [], drillPoints: p.drillPoints ?? [], alerts: p.alerts, feed: p.feed, stats: p.stats,
            watchlist, deals, dataStatus: status,
            dataSource: p.source ?? (status === "live" ? "Live WA register" : "Offline cache"),
            dataGeneratedAt: p.generatedAt ?? null, dataRegions: p.regions ?? 0,
            lastSync: Date.now(),
          };
        }),

      theme: "dark",
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setTheme: (t) => set({ theme: t }),

      selectedId: null,
      hoverId: null,
      select: (id) => set({ selectedId: id }),
      setHover: (id) => set({ hoverId: id }),

      filters: DEFAULT_FILTERS,
      setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
      toggleArrayFilter: (key, value) =>
        set((s) => {
          const arr = s.filters[key] as unknown[];
          const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
          return { filters: { ...s.filters, [key]: next } } as Partial<Store>;
        }),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),

      layers: DEFAULT_LAYERS,
      toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
      layerOpacity: 0.85,
      setLayerOpacity: (n) => set({ layerOpacity: n }),
      scanMode: false,
      toggleScan: () => set((s) => ({ scanMode: !s.scanMode })),
      flyTo: null,
      requestFlyTo: (region) => set((s) => ({ flyTo: { region, nonce: (s.flyTo?.nonce ?? 0) + 1 } })),

      watchlist: [],
      toggleWatch: (id) =>
        set((s) => ({
          watchlist: s.watchlist.includes(id) ? s.watchlist.filter((x) => x !== id) : [...s.watchlist, id],
        })),
      isWatched: (id) => get().watchlist.includes(id),

      deals: {},
      moveDeal: (id, stage) => set((s) => ({ deals: { ...s.deals, [id]: stage } })),

      alerts: ALERTS,
      markAlertRead: (id) =>
        set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)) })),
      markAllAlertsRead: () => set((s) => ({ alerts: s.alerts.map((a) => ({ ...a, read: true })) })),

      feed: FEED,
      pushFeed: (e) => set((s) => ({ feed: [e, ...s.feed].slice(0, 60) })),

      commandOpen: false,
      setCommandOpen: (b) => set({ commandOpen: b }),

      lastSync: Date.now(),
      bumpSync: () => set({ lastSync: Date.now() }),

      auth: { ready: false, gate: false, account: null, accounts: ["Admin", "Guest"] },
      refreshAuth: async () => {
        try {
          const r = await fetch("/api/auth/me");
          const d = await r.json();
          if (d.account) { currentAccount = d.account; await useStore.persist.rehydrate(); }
          set({ auth: { ready: true, gate: !!d.gate, account: d.account ?? null, accounts: d.accounts ?? ["Admin", "Guest"] } });
        } catch {
          set((s) => ({ auth: { ...s.auth, ready: true } }));
        }
      },
      unlock: async (password) => {
        try {
          const r = await fetch("/api/auth/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
          if (!r.ok) return false;
          set((s) => ({ auth: { ...s.auth, gate: true } }));
          return true;
        } catch { return false; }
      },
      login: async (account, password) => {
        try {
          const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account, password }) });
          if (!r.ok) return false;
          // fresh slate, then load this account's own saved state (if any)
          set({ watchlist: [], deals: {} });
          currentAccount = account;
          await useStore.persist.rehydrate();
          set((s) => ({ auth: { ...s.auth, account } }));
          return true;
        } catch { return false; }
      },
      logout: async () => {
        try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
        currentAccount = null;
        set((s) => ({ auth: { ...s.auth, gate: false, account: null }, watchlist: [], deals: {}, selectedId: null }));
      },
    }),
    {
      name: "haxax",
      storage: createJSONStorage(() => accountStorage),
      partialize: (s) => ({ theme: s.theme, watchlist: s.watchlist, deals: s.deals }),
    },
  ),
);

/* ---------- derived selectors ---------- */
export function applyFilters(tenements: Tenement[], f: Filters, watchlist: string[]): Tenement[] {
  const q = f.query.trim().toLowerCase();
  return tenements.filter((t) => {
    if (f.onlyWatchlist && !watchlist.includes(t.id)) return false;
    if (f.scoreMin > 0 && t.score < f.scoreMin) return false;
    if (f.commodities.length && !t.commodities.some((c) => f.commodities.includes(c))) return false;
    if (f.regions.length && !f.regions.includes(t.regionId)) return false;
    if (f.licenceTypes.length && !f.licenceTypes.includes(t.licenceType)) return false;
    if (f.statuses.length && !f.statuses.includes(t.status)) return false;
    if (f.actions.length && !f.actions.includes(t.action)) return false;
    if (f.holderTypes.length && !f.holderTypes.includes(t.holderType)) return false;
    if (f.expiryMonths != null && (+new Date(t.expiryDate) - Date.now()) / 86400000 > f.expiryMonths * 30.4) return false;
    if (q) {
      const hay = `${t.id} ${t.holder} ${t.district} ${t.commodities.join(" ")} ${t.regionId}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function activeFilterCount(f: Filters): number {
  return (
    f.commodities.length +
    f.regions.length +
    f.licenceTypes.length +
    f.statuses.length +
    f.actions.length +
    f.holderTypes.length +
    (f.scoreMin > 0 ? 1 : 0) +
    (f.expiryMonths != null ? 1 : 0) +
    (f.onlyWatchlist ? 1 : 0)
  );
}

/** Natural-language query → structured filter via MiniMax (server). */
export async function askHaxax(q: string): Promise<{ ok: boolean }> {
  try {
    const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) });
    if (!res.ok) return { ok: false };
    const d = await res.json();
    if (!d || d.enabled === false) return { ok: false };
    const f: Filters = { ...DEFAULT_FILTERS };
    if (Array.isArray(d.commodities)) f.commodities = d.commodities;
    if (Array.isArray(d.regions)) f.regions = d.regions;
    if (Array.isArray(d.licenceTypes)) f.licenceTypes = d.licenceTypes;
    if (Array.isArray(d.statuses)) f.statuses = d.statuses;
    if (Array.isArray(d.actions)) f.actions = d.actions;
    if (Array.isArray(d.holderTypes)) f.holderTypes = d.holderTypes;
    if (typeof d.scoreMin === "number") f.scoreMin = Math.max(0, Math.min(100, d.scoreMin));
    if (typeof d.expiryMonths === "number") f.expiryMonths = d.expiryMonths;
    if (typeof d.onlyWatchlist === "boolean") f.onlyWatchlist = d.onlyWatchlist;
    useStore.setState({ filters: f });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Non-reactive lookup (safe outside React). */
export function getTenement(id: string): Tenement | undefined {
  return useStore.getState().tenements.find((t) => t.id === id);
}

/** Assess any WA tenement by ID: use the loaded set, else pull & score it live. */
export async function assessTenement(id: string): Promise<{ ok: boolean; id?: string }> {
  const key = (s: string) => s.toUpperCase().replace(/\s+/g, "");
  const existing = useStore.getState().tenements.find((t) => key(t.id) === key(id));
  if (existing) return { ok: true, id: existing.id };
  try {
    const res = await fetch(`/api/lookup?id=${encodeURIComponent(id.trim())}`);
    if (!res.ok) return { ok: false };
    const t = (await res.json()) as Tenement;
    if (!t || !t.id) return { ok: false };
    useStore.getState().addTenement(t);
    return { ok: true, id: t.id };
  } catch {
    return { ok: false };
  }
}

/** Fetch the live WA register on startup, retrying while it warms up; fall back to bundled cache only if it never comes. */
export async function bootstrapData(): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch("/api/data", { signal: ctrl.signal });
      clearTimeout(to);
      if (res.status === 401) { await useStore.getState().refreshAuth(); return; } // session lapsed → back to gate
      if (res.ok) {
        const data = (await res.json()) as DataPayload;
        if (data && Array.isArray(data.tenements) && data.tenements.length > 0) {
          useStore.getState().setData(data, "live");
          return;
        }
      }
    } catch { /* not ready — retry */ }
    useStore.getState().setDataStatus("loading"); // keep the splash while the register warms up
    await new Promise((r) => setTimeout(r, 3000));
  }
  useStore.getState().setData(
    { tenements: TENEMENTS, comps: COMPS, alerts: ALERTS, feed: FEED, stats: STATS, source: "Offline cache — live register unreachable" },
    "mock",
  );
}
