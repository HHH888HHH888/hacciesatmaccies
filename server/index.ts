/* ============================================================
   HAXAX — live data service

   Fetches real Western Australian mining-tenement records from the
   public SLIP / DMIRS ArcGIS REST service, normalises them, runs
   them through the Haxax enrichment + scoring model, and serves a
   single JSON payload the web app bootstraps from.

   Source: SLIP_Public_Services / Industry_and_Mining
           "Mining Tenements (DMIRS-003)"  (no API key required)
   ============================================================ */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

/* load .env (project root) into process.env — no dependency, runs before anything reads env */
(() => {
  try {
    const p = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v && !(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch { /* ignore */ }
})();

import { REGIONS } from "../src/lib/geo";
import { depositStageLabel, enrichAll, enrichTenement, mapDepositCommodity, type Deposit, type RawTenement } from "../src/lib/enrich";
import type { Alert, AlertSeverity, AlertType, Tenement } from "../src/lib/types";
import { aiEnabled, aiProvider, clearOpinionCache, generateMemo, generateOpinion, interpretQuery } from "./ai";
import { checkAccess, hasSession, sessionToken } from "./auth";

// Prefer HAXAX_API_PORT locally (set in .env) so we never collide with Vite's PORT.
// Fall back to PORT for hosts that inject it (Render, Railway, etc.), then 8787.
const PORT = Number(process.env.HAXAX_API_PORT ?? process.env.PORT ?? 8787);
const SLIP =
  "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer/3/query";
const MINEDEX =
  "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer/0/query";
const DRILLHOLES =
  "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer/1/query";
// real context layers (all public SLIP/DMIRS, no key) — used on-demand per tenement
const SVC = "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services";
const L_GEOLOGY = `${SVC}/Geology_and_Soils_Map/MapServer/4/query`;      // 1:500k interpreted bedrock geology
const L_MINFIELD = `${SVC}/Industry_and_Mining/MapServer/4/query`;       // Mineral Field Boundaries (DMIRS-005)
const L_LGA = `${SVC}/Boundaries/MapServer/14/query`;                    // Local Government Authority
const L_NT_DET = `${SVC}/Boundaries/MapServer/24/query`;                 // Native Title (Determination)
const L_NT_CLAIM = `${SVC}/Boundaries/MapServer/21/query`;               // Native Title (NNTT claim)
const L_WAMEX = `${SVC}/Industry_and_Mining/MapServer/22/query`;         // WAMEX exploration reports
const L_MAPSHEET = `${SVC}/Industry_and_Mining/MapServer/40/query`;      // 1:250k geological map sheet index
const SLIP_DEAD = `${SVC}/Industry_and_Mining/MapServer/15/query`;       // Tenements - DEAD (DMIRS-026) — the expired/surrendered archive
const DEAD_OUT_FIELDS = "fmt_tenid,type,tenstatus,survstatus,grantdate,startdate,enddate"; // reduced fields DMIRS publishes for dead tenements
const DEPOSITS_PER_REGION = 140;
const DRILLHOLES_PER_REGION = 160;
const PER_REGION = 26; // bound volume; ~10 regions → ~240 live tenements
const REFRESH_MS = 30 * 60 * 1000;
const OUT_FIELDS = "fmt_tenid,type,tenstatus,survstatus,special_in,holder1,holder2,holder3,holder4,holder5,addr1,holdercnt,legal_area,unit_of_me,grantdate,startdate,enddate";

type Payload = ReturnType<typeof enrichAll>;
interface Cache {
  data: (Payload & { source: string; live: boolean; generatedAt: string; regions: number; drillPoints: { lng: number; lat: number }[]; registerTotal: number; sourceExtract: string | null }) | null;
  fetchedAt: number;
  refreshing: boolean;
  lastError: string | null;
}
const cache: Cache = { data: null, fetchedAt: 0, refreshing: false, lastError: null };

/* ---------- geometry helpers ---------- */
function simplifyRing(ring: number[][], max = 26): [number, number][] {
  if (!ring || ring.length <= max) return (ring ?? []).map((p) => [p[0], p[1]] as [number, number]);
  const step = Math.ceil(ring.length / max);
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i += step) out.push([ring[i][0], ring[i][1]]);
  return out;
}
function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a / 2);
}
function outerRing(geom: any): number[][] | null {
  if (!geom) return null;
  if (geom.type === "Polygon") return geom.coordinates?.[0] ?? null;
  if (geom.type === "MultiPolygon") {
    let best: number[][] | null = null, bestA = -1;
    for (const poly of geom.coordinates ?? []) {
      const r = poly?.[0];
      if (r) { const a = ringArea(r); if (a > bestA) { bestA = a; best = r; } }
    }
    return best;
  }
  return null;
}
function centroid(ring: [number, number][]): { lng: number; lat: number } {
  const n = ring.length || 1;
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return { lng: x / n, lat: y / n };
}
/** Area of a lng/lat ring in hectares (planar approx at the ring's latitude). */
function ringAreaHa(ring: number[][], lat: number): number {
  if (!ring || ring.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  const sqDeg = Math.abs(a / 2);
  const kmLat = 110.574, kmLng = 111.32 * Math.cos((lat * Math.PI) / 180);
  return sqDeg * kmLat * kmLng * 100; // km² → ha
}
function titleCaseLite(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bNl\b/g, "NL").replace(/\bPty\b/g, "Pty");
}
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function unitHectares(area: number, unit: string | null): number {
  if (!area || !isFinite(area)) return 0;
  const u = (unit ?? "").toUpperCase();
  if (u.includes("KM")) return area * 100;
  if (u.includes("BL")) return area * 300; // graticular block ≈ 3 km² ≈ 300 ha
  return area; // HA.
}

/* ---------- real on-demand context lookups (point-in-polygon over public layers) ---------- */
async function arcgisPointAttrs(url: string, lng: number, lat: number, outFields = "*"): Promise<any | null> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields, returnGeometry: "false", f: "json",
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${url}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
    if (!res.ok) return null;
    const j: any = await res.json();
    return j.features?.[0]?.attributes ?? null;
  } catch { return null; } finally { clearTimeout(to); }
}
async function arcgisCount(url: string, lng: number, lat: number, deg = 0.09): Promise<number | null> {
  const params = new URLSearchParams({
    geometry: `${lng - deg},${lat - deg},${lng + deg},${lat + deg}`, geometryType: "esriGeometryEnvelope",
    inSR: "4326", spatialRel: "esriSpatialRelIntersects", returnCountOnly: "true", f: "json",
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${url}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
    if (!res.ok) return null;
    const j: any = await res.json();
    return typeof j.count === "number" ? j.count : null;
  } catch { return null; } finally { clearTimeout(to); }
}

/** Real WAMEX exploration-report history + the commodities explorers targeted on this ground. */
async function fetchWamex(lng: number, lat: number, deg = 0.07): Promise<{ history: any[]; commodities: { name: string; count: number }[] }> {
  const params = new URLSearchParams({
    geometry: `${lng - deg},${lat - deg},${lng + deg},${lat + deg}`, geometryType: "esriGeometryEnvelope",
    inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: "anumber,title,report_year,operator,author_company,target_commodity",
    orderByFields: "report_year DESC", resultRecordCount: "40", returnGeometry: "false", f: "json",
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${L_WAMEX}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
    if (!res.ok) return { history: [], commodities: [] };
    const j: any = await res.json();
    const feats: any[] = j.features ?? [];
    const history = feats.map((f) => {
      const a = f.attributes ?? {};
      return {
        anumber: a.anumber ?? 0,
        year: typeof a.report_year === "number" ? a.report_year : null,
        operator: titleCaseLite(String(a.operator || a.author_company || "").trim()) || "—",
        commodity: String(a.target_commodity || "").replace(/NO TARGET COMMODITY/i, "—").trim(),
        title: String(a.title || "").trim(),
      };
    }).sort((a, b) => (b.year ?? -1) - (a.year ?? -1)).slice(0, 8); // most recent dated reports first
    const tally: Record<string, number> = {};
    for (const f of feats) {
      for (const part of String(f.attributes?.target_commodity || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean)) {
        if (/NO TARGET/i.test(part)) continue;
        const key = part.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
        tally[key] = (tally[key] ?? 0) + 1;
      }
    }
    const commodities = Object.entries(tally).sort((a, z) => z[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
    return { history, commodities };
  } catch { return { history: [], commodities: [] }; } finally { clearTimeout(to); }
}

/** Parse one GeoJSON feature from SLIP into a normalised RawTenement. */
function parseFeature(f: any): RawTenement | null {
  const p = f?.properties ?? {};
  const ring = outerRing(f?.geometry);
  if (!ring || ring.length < 3) return null;
  const c = centroid(ring as [number, number][]);
  const poly = simplifyRing(ring);
  const geomHa = ringAreaHa(ring, c.lat);
  const areaHa = geomHa > 5 ? geomHa : unitHectares(Number(p.legal_area), p.unit_of_me);
  const holders = [p.holder1, p.holder2, p.holder3, p.holder4, p.holder5].filter((h: any) => h && String(h).trim()).map((h: any) => String(h).trim());
  return {
    id: String(p.fmt_tenid ?? "").replace(/\s+/g, " ").trim() || `T${Math.round(c.lng * 1000)}`,
    rawType: String(p.type ?? "MINING LEASE"),
    status: String(p.tenstatus ?? "LIVE"),
    holders: holders.length ? holders : ["Holder withheld"],
    holderAddress: p.addr1 ? titleCaseLite(String(p.addr1).trim()) : undefined,
    survStatus: p.survstatus ? String(p.survstatus).trim() : undefined,
    special: p.special_in ? String(p.special_in).trim() : undefined,
    legalArea: typeof p.legal_area === "number" ? p.legal_area : undefined,
    legalAreaUnit: p.unit_of_me ? String(p.unit_of_me).trim() : undefined,
    grantDate: typeof p.grantdate === "number" ? p.grantdate : null,
    startDate: typeof p.startdate === "number" ? p.startdate : null,
    endDate: typeof p.enddate === "number" ? p.enddate : null,
    areaHa, poly, lng: c.lng, lat: c.lat,
  };
}

/** Round-robin a sample across tenement-type prefixes (E/P/M/L/R/G) for variety. */
function stratify(items: RawTenement[], n: number): RawTenement[] {
  if (items.length <= n) return items;
  const buckets = new Map<string, RawTenement[]>();
  for (const it of items) {
    const k = it.id.match(/^[A-Z]+/)?.[0] ?? "X";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(it);
  }
  const keys = [...buckets.keys()];
  const out: RawTenement[] = [];
  for (let i = 0; out.length < n; i++) {
    let added = false;
    for (const k of keys) {
      const arr = buckets.get(k)!;
      if (arr[i]) { out.push(arr[i]); added = true; if (out.length >= n) break; }
    }
    if (!added) break;
  }
  return out;
}

/* ---------- query one bounding box with a where clause ---------- */
const BASE_WHERE = "tenstatus IN ('LIVE','PENDING') AND type NOT LIKE '%COAL%' AND type NOT LIKE '%PETROLEUM%'";

async function queryBbox(bounds: [number, number, number, number], where: string, count: number): Promise<RawTenement[]> {
  const [w, s, e, n] = bounds;
  const params = new URLSearchParams({
    where, geometry: `${w},${s},${e},${n}`, geometryType: "esriGeometryEnvelope", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: OUT_FIELDS, outSR: "4326",
    returnGeometry: "true", resultRecordCount: String(count), f: "geojson",
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${SLIP}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const feats: any[] = json.features ?? [];
    const out: RawTenement[] = [];
    for (const f of feats) {
      const raw = parseFeature(f);
      if (raw) out.push(raw);
    }
    return out;
  } finally {
    clearTimeout(to);
  }
}

/* ---------- fetch one region (mix of exploration + leases) ---------- */
async function fetchRegion(bounds: [number, number, number, number]): Promise<RawTenement[]> {
  const [expl, leases] = await Promise.all([
    queryBbox(bounds, `${BASE_WHERE} AND type LIKE '%EXPLORATION%'`, 200),
    // investable non-exploration: prospecting, mining/mineral leases, retention
    queryBbox(bounds, `${BASE_WHERE} AND (type LIKE '%PROSPECTING%' OR type LIKE '%MINING LEASE%' OR type LIKE '%MINERAL LEASE%' OR type LIKE '%RETENTION%')`, 200),
  ]);
  const merged = [...stratify(expl, 48), ...stratify(leases, 34)];
  const seen = new Set<string>();
  const out: RawTenement[] = [];
  for (const t of merged) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
  return out;
}

/* ---------- fetch real MINEDEX deposits ---------- */
async function fetchDeposits(bounds: [number, number, number, number]): Promise<Deposit[]> {
  const [w, s, e, n] = bounds;
  const params = new URLSearchParams({
    where: "1=1", geometry: `${w},${s},${e},${n}`, geometryType: "esriGeometryEnvelope", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "site_title,target_com,site_commo,site_stage,site_type_",
    outSR: "4326", returnGeometry: "true", resultRecordCount: String(DEPOSITS_PER_REGION), f: "geojson",
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${MINEDEX}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const out: Deposit[] = [];
    for (const f of json.features ?? []) {
      const p = f.properties ?? {};
      const c = f.geometry?.type === "Point" ? f.geometry.coordinates : null;
      const name = String(p.site_title ?? "").trim();
      if (!c || !name) continue;
      out.push({
        name, commodity: mapDepositCommodity(p.target_com, p.site_commo),
        stage: depositStageLabel(String(p.site_stage ?? "")), type: String(p.site_type_ ?? "Deposit"),
        lng: c[0], lat: c[1],
      });
    }
    return out;
  } finally {
    clearTimeout(to);
  }
}

/* ---------- fetch real DMIRS drill holes (points only) ---------- */
async function fetchDrillHoles(bounds: [number, number, number, number]): Promise<{ lng: number; lat: number }[]> {
  const [w, s, e, n] = bounds;
  const params = new URLSearchParams({
    where: "1=1", geometry: `${w},${s},${e},${n}`, geometryType: "esriGeometryEnvelope", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: "objectid", outSR: "4326", returnGeometry: "true",
    resultRecordCount: String(DRILLHOLES_PER_REGION), f: "geojson",
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${DRILLHOLES}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const out: { lng: number; lat: number }[] = [];
    for (const f of json.features ?? []) {
      const c = f.geometry?.type === "Point" ? f.geometry.coordinates : null;
      if (c) out.push({ lng: c[0], lat: c[1] });
    }
    return out;
  } finally {
    clearTimeout(to);
  }
}
async function fetchAllDrillHoles(): Promise<{ lng: number; lat: number }[]> {
  const results = await Promise.allSettled(REGIONS.map((r) => fetchDrillHoles(r.bounds)));
  const out: { lng: number; lat: number }[] = [];
  for (const r of results) if (r.status === "fulfilled") out.push(...r.value);
  return out;
}

/** Live count of the complete WA register (live/pending, excl coal/petroleum) — the real denominator. */
async function fetchRegisterTotal(): Promise<number> {
  const params = new URLSearchParams({ where: BASE_WHERE, returnCountOnly: "true", f: "json" });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${SLIP}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
    if (!res.ok) return 0;
    const j: any = await res.json();
    return typeof j.count === "number" ? j.count : 0;
  } catch { return 0; } finally { clearTimeout(to); }
}

async function fetchAllDeposits(): Promise<Deposit[]> {
  const results = await Promise.allSettled(REGIONS.map((r) => fetchDeposits(r.bounds)));
  const seen = new Set<string>();
  const out: Deposit[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const d of r.value) {
        const k = `${d.name}|${d.lng.toFixed(3)}|${d.lat.toFixed(3)}`;
        if (!seen.has(k)) { seen.add(k); out.push(d); }
      }
    }
  }
  return out;
}

/* ---------- look up a single tenement anywhere in WA by ID ---------- */
async function queryTenementById(layerUrl: string, id: string, outFields: string): Promise<RawTenement | null> {
  const norm = id.toUpperCase().replace(/\s+/g, " ").trim();
  const m = norm.match(/^([A-Z]+)\s*(.+)$/);
  const variants = new Set<string>([norm]);
  if (m) { variants.add(`${m[1]} ${m[2]}`); variants.add(`${m[1]}${m[2]}`); }
  const inClause = [...variants].map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
  const params = new URLSearchParams({
    where: `fmt_tenid IN (${inClause})`, outFields, outSR: "4326",
    returnGeometry: "true", resultRecordCount: "1", f: "geojson",
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${layerUrl}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
    if (!res.ok) return null;
    const json: any = await res.json();
    return parseFeature((json.features ?? [])[0]);
  } catch { return null; } finally { clearTimeout(to); }
}

/** Resolve ANY tenement by ID: live/pending first (full data), else the DEAD archive (reduced fields). */
async function lookupTenement(id: string): Promise<Tenement | null> {
  let raw = await queryTenementById(SLIP, id, OUT_FIELDS);
  let dead = false;
  if (!raw) {
    raw = await queryTenementById(SLIP_DEAD, id, DEAD_OUT_FIELDS);
    if (raw) { dead = true; raw.status = "DEAD"; } // DMIRS publishes no holder/area for dead tenements
  }
  if (!raw) return null;
  const t = enrichTenement(raw, Date.now(), cache.data?.deposits, cache.data?.drillPoints);
  if (dead) t.status = "Dead";
  if (cache.data) {
    const peers = cache.data.tenements.filter((x) => x.regionId === t.regionId);
    if (peers.length) t.scorePercentile = Math.round((peers.filter((p) => p.score < t.score).length / peers.length) * 100);
  }
  return t;
}

/** The DMIRS feed's own extract date — the true 'as at' of the data (it publishes periodically, not live). */
async function fetchExtractDate(): Promise<string | null> {
  const params = new URLSearchParams({
    where: "extract_da IS NOT NULL", outFields: "extract_da", orderByFields: "extract_da DESC",
    resultRecordCount: "1", returnGeometry: "false", f: "json",
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${SLIP}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
    if (!res.ok) return null;
    const j: any = await res.json();
    const ms = j.features?.[0]?.attributes?.extract_da;
    return typeof ms === "number" ? new Date(ms).toISOString() : null;
  } catch { return null; } finally { clearTimeout(to); }
}

/* ---------- push notifications (Slack / Discord incoming webhook) ---------- */
async function sendWebhook(text: string): Promise<void> {
  const url = process.env.HAXAX_WEBHOOK_URL;
  if (!url) return;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 10000);
  try {
    // Slack reads `text`, Discord reads `content` — send both for compatibility
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text }), signal: ctrl.signal });
  } catch { /* ignore */ } finally { clearTimeout(to); }
}
function notifyLines(header: string, lines: string[]): void {
  if (!process.env.HAXAX_WEBHOOK_URL || !lines.length) return;
  const top = lines.slice(0, 12).map((l) => `• ${l}`).join("\n");
  const more = lines.length > 12 ? `\n…and ${lines.length - 12} more` : "";
  void sendWebhook(`HAXAX — ${header} (${lines.length})\n${top}${more}\nhttps://haxax.com/#/monitor`);
}
const notifyEnabled = () => !!process.env.HAXAX_WEBHOOK_URL;

/* ============================================================
   Register-wide watches — saved monitors over the FULL register.
   Each watch is a live query against SLIP (all ~30k tenements,
   not the loaded sample); on every refresh we diff the matching
   set and emit added/removed events. Persisted to data/watches.json.
   ============================================================ */
interface WatchCriteria {
  regions?: string[];
  licenceTypes?: string[];
  statuses?: string[];
  holderContains?: string;
  expiryWithinMonths?: number;
}
interface WatchMatch { id: string; holder: string; type: string; status: string; endDate: string | null; }
interface Watch { id: string; name: string; criteria: WatchCriteria; createdAt: string; lastRun: string | null; lastCount: number; lastIds: string[]; }
interface WatchEvent { id: string; watchId: string; watchName: string; kind: "added" | "removed"; tenementId: string; holder: string; detail: string; timestamp: string; }

const WATCHES_FILE = path.resolve(process.cwd(), "data", "watches.json");
const MAX_WATCHES = 40;
let watches: Watch[] = [];
let watchEvents: WatchEvent[] = [];

function loadWatches(): void {
  try {
    if (!fs.existsSync(WATCHES_FILE)) return;
    const j = JSON.parse(fs.readFileSync(WATCHES_FILE, "utf8"));
    watches = Array.isArray(j.watches) ? j.watches : [];
    watchEvents = Array.isArray(j.events) ? j.events : [];
  } catch { /* ignore */ }
}
function saveWatches(): void {
  try {
    fs.mkdirSync(path.dirname(WATCHES_FILE), { recursive: true });
    fs.writeFileSync(WATCHES_FILE, JSON.stringify({ watches, events: watchEvents.slice(0, 300) }, null, 2));
  } catch { /* ignore */ }
}

const LICENCE_LIKE: Record<string, string> = {
  Exploration: "EXPLORATION", Prospecting: "PROSPECTING", Mining: "MINING LEASE",
  "Mineral Lease": "MINERAL LEASE", Retention: "RETENTION", Miscellaneous: "MISCELLANEOUS",
};

function regionsEnvelope(ids: string[]): [number, number, number, number] | null {
  const bs = REGIONS.filter((r) => ids.includes(r.id)).map((r) => r.bounds);
  if (!bs.length) return null;
  let w = 180, s = 90, e = -180, n = -90;
  for (const b of bs) { w = Math.min(w, b[0]); s = Math.min(s, b[1]); e = Math.max(e, b[2]); n = Math.max(n, b[3]); }
  return [w, s, e, n];
}
function buildWatchWhere(c: WatchCriteria): string {
  const parts = [BASE_WHERE];
  if (c.statuses?.length) parts.push(`tenstatus IN (${c.statuses.map((s) => `'${s.toUpperCase().replace(/'/g, "")}'`).join(",")})`);
  if (c.licenceTypes?.length) {
    const ors = c.licenceTypes.map((t) => LICENCE_LIKE[t]).filter(Boolean).map((l) => `type LIKE '%${l}%'`);
    if (ors.length) parts.push(`(${ors.join(" OR ")})`);
  }
  if (c.holderContains && c.holderContains.trim()) {
    const h = c.holderContains.toUpperCase().replace(/'/g, "''").slice(0, 60);
    parts.push(`(holder1 LIKE '%${h}%' OR holder2 LIKE '%${h}%' OR holder3 LIKE '%${h}%')`);
  }
  if (c.expiryWithinMonths && c.expiryWithinMonths > 0) {
    const d = new Date(Date.now() + c.expiryWithinMonths * 30.44 * 86400000);
    parts.push(`enddate <= DATE '${d.toISOString().slice(0, 10)}'`);
  }
  return parts.join(" AND ");
}
async function queryWatch(c: WatchCriteria): Promise<WatchMatch[]> {
  const params = new URLSearchParams({
    where: buildWatchWhere(c), outFields: "fmt_tenid,type,tenstatus,holder1,enddate",
    outSR: "4326", returnGeometry: "false", resultRecordCount: "1000", f: "json",
  });
  const env = c.regions?.length ? regionsEnvelope(c.regions) : null;
  if (env) {
    params.set("geometry", env.join(","));
    params.set("geometryType", "esriGeometryEnvelope");
    params.set("inSR", "4326");
    params.set("spatialRel", "esriSpatialRelIntersects");
  }
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${SLIP}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j.features ?? []).map((f: any) => {
      const a = f.attributes ?? {};
      return {
        id: String(a.fmt_tenid ?? "").replace(/\s+/g, " ").trim(),
        holder: titleCaseLite(String(a.holder1 ?? "Holder withheld")),
        type: String(a.type ?? ""), status: String(a.tenstatus ?? ""),
        endDate: typeof a.enddate === "number" ? new Date(a.enddate).toISOString() : null,
      };
    }).filter((m: WatchMatch) => m.id);
  } catch { return []; } finally { clearTimeout(to); }
}
async function runWatch(w: Watch, emitEvents: boolean): Promise<WatchMatch[]> {
  const matches = await queryWatch(w.criteria);
  const ids = matches.map((m) => m.id);
  const now = new Set(ids);
  const prev = new Set(w.lastIds);
  if (emitEvents && w.lastRun) {
    const ts = new Date().toISOString();
    const mk = (kind: "added" | "removed", id: string, holder: string, detail: string): WatchEvent =>
      ({ id: `WE${Date.now()}${Math.random().toString(36).slice(2, 6)}`, watchId: w.id, watchName: w.name, kind, tenementId: id, holder, detail, timestamp: ts });
    for (const m of matches) if (!prev.has(m.id)) watchEvents.unshift(mk("added", m.id, m.holder, `${m.id} now matches “${w.name}” — ${m.holder}`));
    for (const id of w.lastIds) if (!now.has(id)) watchEvents.unshift(mk("removed", id, "", `${id} left “${w.name}” — possibly expired, forfeited, transferred or renewed out of criteria`));
    watchEvents = watchEvents.slice(0, 300);
  }
  w.lastIds = ids; w.lastCount = matches.length; w.lastRun = new Date().toISOString();
  return matches;
}
async function runAllWatches(): Promise<void> {
  const before = new Set(watchEvents.map((e) => e.id));
  for (const w of watches) { try { await runWatch(w, true); } catch { /* ignore */ } }
  if (watches.length) saveWatches();
  const fresh = watchEvents.filter((e) => !before.has(e.id));
  notifyLines("Watch events", fresh.map((e) => e.detail));
}

/* ============================================================
   Register-wide change detection — a lightweight snapshot of ALL
   ~30k live/pending tenements (id, status, holder, expiry), diffed
   between runs to surface new / status-change / holder-change /
   newly-expired / dropped-off events across the WHOLE register,
   not just the loaded sample. Persisted so it survives restarts.
   ============================================================ */
const REGWATCH_FILE = path.resolve(process.cwd(), "data", "register-watch.json");
type SnapRow = { s: string; h: string; e: number | null };
let regSnapshot = new Map<string, SnapRow>();
let registerAlerts: Alert[] = [];
let lastSnapshotAt: string | null = null;

function loadRegWatch(): void {
  try {
    if (!fs.existsSync(REGWATCH_FILE)) return;
    const j = JSON.parse(fs.readFileSync(REGWATCH_FILE, "utf8"));
    if (Array.isArray(j.snapshot)) regSnapshot = new Map(j.snapshot);
    if (Array.isArray(j.alerts)) registerAlerts = j.alerts;
    lastSnapshotAt = j.savedAt ?? null;
  } catch { /* ignore */ }
}
function saveRegWatch(): void {
  try {
    fs.mkdirSync(path.dirname(REGWATCH_FILE), { recursive: true });
    fs.writeFileSync(REGWATCH_FILE, JSON.stringify({ snapshot: [...regSnapshot.entries()], alerts: registerAlerts.slice(0, 120), savedAt: lastSnapshotAt }));
  } catch { /* ignore */ }
}
function mergeAlerts(reg: Alert[], base: Alert[]): Alert[] {
  const seen = new Set<string>();
  const out: Alert[] = [];
  for (const a of [...reg, ...base]) if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); }
  return out.slice(0, 80);
}

async function fetchRegisterSnapshot(): Promise<Map<string, SnapRow>> {
  const out = new Map<string, SnapRow>();
  const PAGE = 2000;
  for (let offset = 0; offset < 60000; offset += PAGE) {
    const params = new URLSearchParams({
      where: BASE_WHERE, outFields: "fmt_tenid,tenstatus,holder1,enddate", orderByFields: "gid ASC",
      resultOffset: String(offset), resultRecordCount: String(PAGE), returnGeometry: "false", f: "json",
    });
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 25000);
    let feats: any[] = [];
    try {
      const res = await fetch(`${SLIP}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
      if (!res.ok) break;
      feats = (await res.json()).features ?? [];
    } catch { break; } finally { clearTimeout(to); }
    const before = out.size;
    for (const f of feats) {
      const a = f.attributes ?? {};
      const id = String(a.fmt_tenid ?? "").replace(/\s+/g, " ").trim();
      if (id) out.set(id, { s: String(a.tenstatus ?? ""), h: String(a.holder1 ?? ""), e: typeof a.enddate === "number" ? a.enddate : null });
    }
    if (feats.length < PAGE || out.size === before) break; // last page, or pagination made no progress
  }
  return out;
}

async function snapshotAndDiff(): Promise<void> {
  const curr = await fetchRegisterSnapshot();
  if (curr.size < 1000) return; // guard: a partial/failed fetch must not wipe the baseline
  const now = Date.now();
  if (regSnapshot.size > 0) {
    const fresh: Alert[] = [];
    let n = 0;
    const push = (type: AlertType, sev: AlertSeverity, id: string, title: string, message: string) =>
      fresh.push({ id: `RW${now}-${n++}`, type, severity: sev, tenementId: id, title, message, timestamp: new Date(now).toISOString(), read: false });
    for (const [id, c] of curr) {
      const p = regSnapshot.get(id);
      if (!p) { push("competitor", "medium", id, `New on register — ${id}`, `${id} (${titleCaseLite(c.h || "holder withheld")}) appeared on the WA register.`); continue; }
      if (p.s !== c.s) push("title", "medium", id, `Status change — ${id}`, `${id} moved ${p.s} → ${c.s} on the register.`);
      if (p.h && c.h && p.h !== c.h) push("title", "high", id, `Holder change — ${id}`, `${id}: ${titleCaseLite(p.h)} → ${titleCaseLite(c.h)}. Verify chain of title.`);
      if (p.e && c.e && p.e >= now && c.e < now) push("expiry", "high", id, `Expired — ${id}`, `${id} passed its expiry date — renewal / forfeiture window.`);
    }
    for (const [id, p] of regSnapshot) {
      if (!curr.has(id)) push("expiry", "high", id, `Left live register — ${id}`, `${id} (${titleCaseLite(p.h || "holder withheld")}) is no longer live/pending — possibly expired, surrendered or forfeited.`);
    }
    if (fresh.length) {
      registerAlerts = [...fresh.slice(0, 60), ...registerAlerts].slice(0, 120);
      if (cache.data) cache.data.alerts = mergeAlerts(registerAlerts, cache.data.alerts);
      notifyLines("Register changes", fresh.map((a) => a.title));
      console.log(`[haxax] register-wide change detection: ${fresh.length} change(s) across ${curr.size} tenements`);
    }
  } else {
    console.log(`[haxax] register-wide baseline established: ${curr.size} tenements`);
  }
  regSnapshot = curr;
  lastSnapshotAt = new Date(now).toISOString();
  saveRegWatch();
}

/* ---------- refresh the cache from SLIP ---------- */
async function refresh(): Promise<void> {
  if (cache.refreshing) return;
  cache.refreshing = true;
  const started = Date.now();
  try {
    const [results, deposits, drillPoints, registerTotal, sourceExtract] = await Promise.all([
      Promise.allSettled(REGIONS.map((r) => fetchRegion(r.bounds))),
      fetchAllDeposits().catch(() => [] as Deposit[]),
      fetchAllDrillHoles().catch(() => [] as { lng: number; lat: number }[]),
      fetchRegisterTotal().catch(() => 0),
      fetchExtractDate().catch(() => null),
    ]);
    const raws: RawTenement[] = [];
    const seen = new Set<string>();
    let ok = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        ok++;
        for (const t of r.value) if (!seen.has(t.id)) { seen.add(t.id); raws.push(t); }
      }
    }
    if (raws.length === 0) throw new Error("no records returned from SLIP");
    const enriched = enrichAll(raws, Date.now(), deposits, drillPoints);
    // merge in register-wide change alerts (all ~30k, detected by snapshotAndDiff)
    enriched.alerts = mergeAlerts(registerAlerts, enriched.alerts);
    clearOpinionCache(); // AI notes regenerate against the fresh register

    cache.data = { ...enriched, source: "DMIRS / SLIP — Mining Tenements (DMIRS-003)", live: true, generatedAt: new Date().toISOString(), regions: ok, drillPoints, registerTotal, sourceExtract };
    cache.fetchedAt = Date.now();
    cache.lastError = null;
    console.log(`[haxax] refreshed ${raws.length} tenements + ${deposits.length} deposits + ${drillPoints.length} drill holes from ${ok}/${REGIONS.length} regions in ${Date.now() - started}ms`);
    runAllWatches().catch(() => {}); // re-evaluate saved register-wide monitors against the fresh register
  } catch (err: any) {
    cache.lastError = err?.message ?? String(err);
    console.error(`[haxax] refresh failed: ${cache.lastError}`);
  } finally {
    cache.refreshing = false;
  }
}

/* ---------- http server ---------- */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
    req.on("error", () => resolve(""));
  });
}

function send(res: http.ServerResponse, code: number, body: unknown, extra?: Record<string, string | string[]>) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(json);
}

/* ---------- auth plumbing ---------- */
const IS_PROD = process.env.NODE_ENV === "production";
function parseCookies(req: http.IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setCookie(name: string, value: string, maxAgeSec: number): string {
  const bits = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSec}`];
  if (IS_PROD) bits.push("Secure");
  return bits.join("; ");
}
// data endpoints require a valid session; health + auth + static are open
function requireSession(req: http.IncomingMessage): boolean {
  return hasSession(parseCookies(req)["haxax_session"]);
}

/* ---------- static (built SPA) serving for production ---------- */
const DIST = path.resolve(process.cwd(), "dist");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json",
};
function serveStatic(pathname: string, res: http.ServerResponse): boolean {
  if (!fs.existsSync(DIST)) return false;
  let rel = pathname === "/" ? "/index.html" : pathname;
  let file = path.join(DIST, decodeURIComponent(rel));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return true; } // path traversal guard
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(DIST, "index.html"); // SPA fallback
  if (!fs.existsSync(file)) return false;
  const ext = path.extname(file).toLowerCase();
  const isHashed = /\.[0-9a-f]{8,}\./i.test(path.basename(file));
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": isHashed ? "public, max-age=31536000, immutable" : "no-cache",
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*" }).end(); return; }

  if (url.pathname === "/api/health") {
    send(res, 200, {
      ok: !!cache.data, live: cache.data?.live ?? false, source: cache.data?.source ?? null,
      tenements: cache.data?.tenements.length ?? 0, registerTotal: cache.data?.registerTotal ?? 0, regions: cache.data?.regions ?? 0,
      sourceExtract: cache.data?.sourceExtract ?? null,
      registerWatched: regSnapshot.size, registerWatchedAt: lastSnapshotAt,
      notify: notifyEnabled(),
      fetchedAt: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null,
      ageMinutes: cache.fetchedAt ? Math.round((Date.now() - cache.fetchedAt) / 60000) : null,
      lastError: cache.lastError,
      ai: aiEnabled() ? aiProvider() : null,
    });
    return;
  }

  /* ---------- auth (single access code) ---------- */
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    let pw = "";
    try { pw = (JSON.parse(await readBody(req)).password ?? "").toString(); } catch { /* ignore */ }
    if (!checkAccess(pw)) { send(res, 401, { ok: false }); return; }
    send(res, 200, { ok: true }, { "Set-Cookie": setCookie("haxax_session", sessionToken(), 12 * 3600) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    send(res, 200, { ok: true }, { "Set-Cookie": [setCookie("haxax_session", "", 0), setCookie("haxax_gate", "", 0)] });
    return;
  }
  if (url.pathname === "/api/auth/me") {
    send(res, 200, { authed: hasSession(parseCookies(req)["haxax_session"]) });
    return;
  }

  // everything else under /api (except health, handled above) is locked behind a session
  if (url.pathname.startsWith("/api/") && !requireSession(req)) {
    send(res, 401, { error: "unauthorized", locked: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/opinion") {
    let t: Tenement | null = null;
    try { t = JSON.parse(await readBody(req)); } catch { /* ignore */ }
    if (!t || !t.id) { send(res, 400, { error: "tenement payload required" }); return; }
    const op = await generateOpinion(t);
    send(res, 200, op ?? { provider: null }); // provider:null → client uses built-in note
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/memo") {
    let t: Tenement | null = null;
    try { t = JSON.parse(await readBody(req)); } catch { /* ignore */ }
    if (!t || !t.id) { send(res, 400, { error: "tenement payload required" }); return; }
    const memo = await generateMemo(t);
    send(res, 200, memo ?? { provider: null });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ask") {
    let q = "";
    try { q = (JSON.parse(await readBody(req)).q ?? "").toString().slice(0, 400); } catch { /* ignore */ }
    if (!q.trim()) { send(res, 400, { error: "q required" }); return; }
    if (!aiEnabled()) { send(res, 200, { enabled: false }); return; }
    const f = await interpretQuery(q);
    send(res, 200, f ? { enabled: true, ...f } : { enabled: false });
    return;
  }

  if (url.pathname === "/api/data") {
    if (!cache.data && !cache.refreshing) await refresh();
    if (!cache.data) { send(res, 503, { error: cache.lastError ?? "data unavailable", live: false }); return; }
    send(res, 200, { ...cache.data, registerWatched: regSnapshot.size, registerWatchedAt: lastSnapshotAt });
    return;
  }

  if (url.pathname === "/api/refresh") { await refresh(); send(res, 200, { ok: !!cache.data, lastError: cache.lastError }); return; }

  if (url.pathname === "/api/lookup") {
    const id = url.searchParams.get("id");
    if (!id) { send(res, 400, { error: "id required" }); return; }
    const t = await lookupTenement(id);
    if (!t) { send(res, 404, { error: "tenement not found in the live register" }); return; }
    send(res, 200, t);
    return;
  }

  if (url.pathname === "/api/neighbours") {
    const lng = Number(url.searchParams.get("lng"));
    const lat = Number(url.searchParams.get("lat"));
    const selfId = (url.searchParams.get("id") ?? "").toUpperCase().replace(/\s+/g, "");
    if (!isFinite(lng) || !isFinite(lat)) { send(res, 400, { error: "lng & lat required" }); return; }
    const d = 0.25; // ~25 km box
    const params = new URLSearchParams({
      where: BASE_WHERE, geometry: `${lng - d},${lat - d},${lng + d},${lat + d}`,
      geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
      outFields: "fmt_tenid,type,tenstatus,holder1", outSR: "4326", returnGeometry: "true",
      resultRecordCount: "80", f: "geojson",
    });
    try {
      const r = await fetch(`${SLIP}?${params.toString()}`, { headers: { "User-Agent": "Haxax/1.0" } });
      const j: any = await r.json();
      const items = (j.features ?? []).map((f: any) => {
        const ring = outerRing(f.geometry);
        if (!ring) return null;
        const c = centroid(ring as [number, number][]);
        const p = f.properties ?? {};
        return {
          id: String(p.fmt_tenid ?? "").replace(/\s+/g, " ").trim(),
          holder: titleCaseLite(String(p.holder1 ?? "Holder withheld")),
          type: String(p.type ?? ""), status: String(p.tenstatus ?? ""),
          km: haversineKm(lat, lng, c.lat, c.lng),
        };
      }).filter((x: any) => x && x.id && x.id.toUpperCase().replace(/\s+/g, "") !== selfId)
        .sort((a: any, b: any) => a.km - b.km).slice(0, 12);
      const counts: Record<string, number> = {};
      items.forEach((x: any) => (counts[x.holder] = (counts[x.holder] ?? 0) + 1));
      const dom = Object.entries(counts).sort((a, z) => z[1] - a[1])[0];
      send(res, 200, {
        neighbours: items.map((x: any) => ({ ...x, km: Math.round(x.km * 10) / 10 })),
        dominantHolder: dom ? dom[0] : null, dominantCount: dom ? dom[1] : 0, total: items.length,
      });
    } catch {
      send(res, 200, { neighbours: [], dominantHolder: null, dominantCount: 0, total: 0 });
    }
    return;
  }

  if (url.pathname === "/api/context") {
    const lng = Number(url.searchParams.get("lng"));
    const lat = Number(url.searchParams.get("lat"));
    if (!isFinite(lng) || !isFinite(lat)) { send(res, 400, { error: "lng & lat required" }); return; }
    const [geo, mf, lga, ntDet, ntClaim, wamex, drills, sheet, wamexData] = await Promise.all([
      arcgisPointAttrs(L_GEOLOGY, lng, lat, "unitname,code,descriptn"),
      arcgisPointAttrs(L_MINFIELD, lng, lat, "mfield,mdistrict,number_"),
      arcgisPointAttrs(L_LGA, lng, lat, "name"),
      arcgisPointAttrs(L_NT_DET, lng, lat, "*"),
      arcgisPointAttrs(L_NT_CLAIM, lng, lat, "native_title_application,status_of_application,federal_court_reference,nntt_no"),
      arcgisCount(L_WAMEX, lng, lat),
      arcgisCount(DRILLHOLES, lng, lat),
      arcgisPointAttrs(L_MAPSHEET, lng, lat, "*"),
      fetchWamex(lng, lat),
    ]);
    const geology = geo && geo.unitname ? { unit: String(geo.unitname).trim(), code: String(geo.code ?? "").trim(), description: String(geo.descriptn ?? "").trim() } : null;
    const mineralField = mf && mf.mfield ? { field: String(mf.mfield).trim(), district: String(mf.mdistrict ?? "").trim(), number: String(mf.number_ ?? "").trim() } : null;
    const lgaName = lga && lga.name ? titleCaseLite(String(lga.name).trim()) : null;
    let nativeTitle: any = null;
    if (ntDet) {
      nativeTitle = { name: String(ntDet.determination_name ?? ntDet.name ?? ntDet.short_name ?? "Native title determination").trim(), status: "Determined", type: "Determination", reference: String(ntDet.federal_court_no ?? ntDet.wad ?? ntDet.tribunal_file_no ?? "").trim() };
    } else if (ntClaim && ntClaim.native_title_application) {
      nativeTitle = { name: String(ntClaim.native_title_application).trim(), status: String(ntClaim.status_of_application ?? "").trim(), type: "Registered claim", reference: String(ntClaim.federal_court_reference ?? ntClaim.nntt_no ?? "").trim() };
    }
    const sheetName = sheet ? (sheet.map_name ?? sheet.name ?? sheet.sheet ?? sheet.label ?? sheet.mapsheet ?? sheet.sheet_name ?? null) : null;
    send(res, 200, {
      geology, mineralField, lga: lgaName, nativeTitle,
      mapSheet: sheetName ? String(sheetName).trim() : null,
      wamexReports: wamex, drillHolesNearby: drills,
      wamexHistory: wamexData.history, wamexCommodities: wamexData.commodities,
      source: "DMIRS / GSWA / Landgate / NNTT — SLIP public services",
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  /* ---------- register-wide watches ---------- */
  if (url.pathname === "/api/watches" && req.method === "GET") {
    send(res, 200, {
      watches: watches.map((w) => ({ id: w.id, name: w.name, criteria: w.criteria, lastRun: w.lastRun, lastCount: w.lastCount })),
      events: watchEvents.slice(0, 80),
      notify: notifyEnabled(),
    });
    return;
  }
  if (url.pathname === "/api/watches/test-notify" && req.method === "POST") {
    if (!notifyEnabled()) { send(res, 200, { ok: false, configured: false }); return; }
    await sendWebhook("HAXAX — test notification. Your watch & register alerts will arrive here.\nhttps://haxax.com/#/monitor");
    send(res, 200, { ok: true, configured: true });
    return;
  }
  if (url.pathname === "/api/watches" && req.method === "POST") {
    if (watches.length >= MAX_WATCHES) { send(res, 400, { error: `watch limit reached (${MAX_WATCHES})` }); return; }
    let body: any = {};
    try { body = JSON.parse(await readBody(req)); } catch { /* ignore */ }
    const name = String(body.name ?? "").trim().slice(0, 80) || "Untitled watch";
    const c = body.criteria ?? {};
    const criteria: WatchCriteria = {
      regions: Array.isArray(c.regions) ? c.regions.slice(0, 10).map(String) : undefined,
      licenceTypes: Array.isArray(c.licenceTypes) ? c.licenceTypes.slice(0, 6).map(String) : undefined,
      statuses: Array.isArray(c.statuses) ? c.statuses.slice(0, 4).map(String) : undefined,
      holderContains: c.holderContains ? String(c.holderContains).slice(0, 60) : undefined,
      expiryWithinMonths: Number.isFinite(c.expiryWithinMonths) ? Math.max(0, Math.min(120, Math.round(c.expiryWithinMonths))) : undefined,
    };
    const w: Watch = { id: `W${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name, criteria, createdAt: new Date().toISOString(), lastRun: null, lastCount: 0, lastIds: [] };
    await runWatch(w, false); // establish baseline, no events on first run
    watches.unshift(w);
    saveWatches();
    send(res, 200, { ok: true, watch: { id: w.id, name: w.name, criteria: w.criteria, lastRun: w.lastRun, lastCount: w.lastCount } });
    return;
  }
  if (url.pathname === "/api/watches/delete" && req.method === "POST") {
    let id = "";
    try { id = String(JSON.parse(await readBody(req)).id ?? ""); } catch { /* ignore */ }
    watches = watches.filter((w) => w.id !== id);
    watchEvents = watchEvents.filter((e) => e.watchId !== id);
    saveWatches();
    send(res, 200, { ok: true });
    return;
  }
  if (url.pathname === "/api/watches/run" && req.method === "POST") {
    await runAllWatches();
    send(res, 200, { ok: true, watches: watches.map((w) => ({ id: w.id, name: w.name, criteria: w.criteria, lastRun: w.lastRun, lastCount: w.lastCount })), events: watchEvents.slice(0, 80) });
    return;
  }
  if (url.pathname === "/api/watches/matches") {
    const id = url.searchParams.get("id") ?? "";
    const w = watches.find((x) => x.id === id);
    if (!w) { send(res, 404, { error: "watch not found" }); return; }
    const matches = await runWatch(w, false);
    saveWatches();
    send(res, 200, { matches });
    return;
  }

  if (url.pathname.startsWith("/api/tenements/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/tenements/", ""));
    const t = cache.data?.tenements.find((x) => x.id === id);
    if (!t) { send(res, 404, { error: "not found" }); return; }
    send(res, 200, t);
    return;
  }

  // non-API request → serve the built SPA (production single-unit deploy)
  if (!url.pathname.startsWith("/api/") && serveStatic(url.pathname, res)) return;

  send(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[haxax] live data service on http://localhost:${PORT}  (sources: SLIP / DMIRS)`);
  console.log(`[haxax] AI research notes: ${aiProvider() ?? "off (set MINIMAX_API_KEY in .env to enable)"}`);
  console.log(`[haxax] access: locked — single access code${IS_PROD ? "" : "  (dev: cookies non-Secure)"}`);
  if (fs.existsSync(DIST)) console.log(`[haxax] serving built app from ./dist`);
  loadWatches();
  loadRegWatch();
  console.log(`[haxax] ${watches.length} watch(es) loaded · register-wide change detection ${regSnapshot.size ? `(baseline ${regSnapshot.size})` : "(cold)"}`);
  console.log(`[haxax] push notifications: ${notifyEnabled() ? "on (webhook)" : "off (set HAXAX_WEBHOOK_URL to a Slack/Discord webhook)"}`);
  refresh();
  setInterval(refresh, REFRESH_MS);
  // register-wide change detection: baseline shortly after boot, then every 6h (source updates every few days)
  setTimeout(() => { snapshotAndDiff().catch(() => {}); }, 45000);
  setInterval(() => { snapshotAndDiff().catch(() => {}); }, 6 * 60 * 60 * 1000);
});
