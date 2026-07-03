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
import type { Alert, Tenement } from "../src/lib/types";
import { aiEnabled, aiProvider, clearOpinionCache, generateMemo, generateOpinion, interpretQuery } from "./ai";
import { ACCOUNT_NAMES, checkAccount, checkGate, gateToken, hasGate, sessionAccount, sessionToken } from "./auth";

// Prefer HAXAX_API_PORT locally (set in .env) so we never collide with Vite's PORT.
// Fall back to PORT for hosts that inject it (Render, Railway, etc.), then 8787.
const PORT = Number(process.env.HAXAX_API_PORT ?? process.env.PORT ?? 8787);
const SLIP =
  "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer/3/query";
const MINEDEX =
  "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer/0/query";
const DRILLHOLES =
  "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Industry_and_Mining/MapServer/1/query";
const DEPOSITS_PER_REGION = 140;
const DRILLHOLES_PER_REGION = 160;
const PER_REGION = 26; // bound volume; ~10 regions → ~240 live tenements
const REFRESH_MS = 30 * 60 * 1000;
const OUT_FIELDS = "fmt_tenid,type,tenstatus,survstatus,holder1,holder2,holder3,holdercnt,legal_area,unit_of_me,grantdate,startdate,enddate";

type Payload = ReturnType<typeof enrichAll>;
interface Cache {
  data: (Payload & { source: string; live: boolean; generatedAt: string; regions: number; drillPoints: { lng: number; lat: number }[] }) | null;
  fetchedAt: number;
  refreshing: boolean;
  lastError: string | null;
}
const cache: Cache = { data: null, fetchedAt: 0, refreshing: false, lastError: null };
// previous snapshot for change detection across refreshes
let prevSnap = new Map<string, { status: string; holder: string }>();

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

/** Parse one GeoJSON feature from SLIP into a normalised RawTenement. */
function parseFeature(f: any): RawTenement | null {
  const p = f?.properties ?? {};
  const ring = outerRing(f?.geometry);
  if (!ring || ring.length < 3) return null;
  const c = centroid(ring as [number, number][]);
  const poly = simplifyRing(ring);
  const geomHa = ringAreaHa(ring, c.lat);
  const areaHa = geomHa > 5 ? geomHa : unitHectares(Number(p.legal_area), p.unit_of_me);
  const holders = [p.holder1, p.holder2, p.holder3].filter((h: any) => h && String(h).trim()).map((h: any) => String(h).trim());
  return {
    id: String(p.fmt_tenid ?? "").replace(/\s+/g, " ").trim() || `T${Math.round(c.lng * 1000)}`,
    rawType: String(p.type ?? "MINING LEASE"),
    status: String(p.tenstatus ?? "LIVE"),
    holders: holders.length ? holders : ["Holder withheld"],
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
    queryBbox(bounds, `${BASE_WHERE} AND type LIKE '%EXPLORATION%'`, 90),
    // investable non-exploration: prospecting, mining/mineral leases, retention
    queryBbox(bounds, `${BASE_WHERE} AND (type LIKE '%PROSPECTING%' OR type LIKE '%MINING LEASE%' OR type LIKE '%MINERAL LEASE%' OR type LIKE '%RETENTION%')`, 90),
  ]);
  const merged = [...stratify(expl, 16), ...stratify(leases, 12)];
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
async function lookupTenement(id: string): Promise<Tenement | null> {
  const norm = id.toUpperCase().replace(/\s+/g, " ").trim();
  const m = norm.match(/^([A-Z]+)\s*(.+)$/);
  const variants = new Set<string>([norm]);
  if (m) { variants.add(`${m[1]} ${m[2]}`); variants.add(`${m[1]}${m[2]}`); }
  const inClause = [...variants].map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
  const params = new URLSearchParams({
    where: `fmt_tenid IN (${inClause})`, outFields: OUT_FIELDS, outSR: "4326",
    returnGeometry: "true", resultRecordCount: "1", f: "geojson",
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${SLIP}?${params.toString()}`, { signal: ctrl.signal, headers: { "User-Agent": "Haxax/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const raw = parseFeature((json.features ?? [])[0]);
    if (!raw) return null;
    const t = enrichTenement(raw, Date.now(), cache.data?.deposits);
    // borrow comps + region percentile from the cached live set for context
    if (cache.data) {
      const rel = cache.data.comps.filter((c) => c.region === t.regionId || c.commodity === t.commodities[0]);
      t.comps = (rel.length ? rel : cache.data.comps).slice(0, 3).map((c) => c.id);
      const peers = cache.data.tenements.filter((x) => x.regionId === t.regionId);
      if (peers.length) t.scorePercentile = Math.round((peers.filter((p) => p.score < t.score).length / peers.length) * 100);
    }
    return t;
  } catch (err) {
    console.error(`[haxax] lookup failed for "${id}": ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(to);
  }
}

/* ---------- refresh the cache from SLIP ---------- */
async function refresh(): Promise<void> {
  if (cache.refreshing) return;
  cache.refreshing = true;
  const started = Date.now();
  try {
    const [results, deposits, drillPoints] = await Promise.all([
      Promise.allSettled(REGIONS.map((r) => fetchRegion(r.bounds))),
      fetchAllDeposits().catch(() => [] as Deposit[]),
      fetchAllDrillHoles().catch(() => [] as { lng: number; lat: number }[]),
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
    const enriched = enrichAll(raws, Date.now(), deposits);

    // change detection vs previous refresh → genuine register-change alerts
    if (prevSnap.size) {
      const changes: Alert[] = [];
      let n = 0;
      for (const t of enriched.tenements) {
        const prev = prevSnap.get(t.id);
        const base = { id: `CHG${Date.now()}-${n++}`, tenementId: t.id, timestamp: new Date().toISOString(), read: false };
        if (!prev) changes.push({ ...base, type: "competitor", severity: "medium", title: `New on register — ${t.id}`, message: `${t.id} (${t.holder}) appeared on the live register since the last sync.` });
        else if (prev.status !== t.status) changes.push({ ...base, type: "title", severity: "medium", title: `Status change — ${t.id}`, message: `${t.id} moved ${prev.status} → ${t.status} on the register.` });
        else if (prev.holder !== t.holder) changes.push({ ...base, type: "title", severity: "high", title: `Holder change — ${t.id}`, message: `${t.id} holder changed: ${prev.holder} → ${t.holder}. Verify chain of title.` });
      }
      if (changes.length) enriched.alerts = [...changes.slice(0, 20), ...enriched.alerts].slice(0, 60);
    }
    prevSnap = new Map(enriched.tenements.map((t) => [t.id, { status: t.status, holder: t.holder }]));
    clearOpinionCache(); // AI notes regenerate against the fresh register

    cache.data = { ...enriched, source: "DMIRS / SLIP — Mining Tenements (DMIRS-003)", live: true, generatedAt: new Date().toISOString(), regions: ok, drillPoints };
    cache.fetchedAt = Date.now();
    cache.lastError = null;
    console.log(`[haxax] refreshed ${raws.length} tenements + ${deposits.length} deposits + ${drillPoints.length} drill holes from ${ok}/${REGIONS.length} regions in ${Date.now() - started}ms`);
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
// data endpoints require a valid account session; health + auth + static are open
function requireSession(req: http.IncomingMessage): string | null {
  return sessionAccount(parseCookies(req)["haxax_session"]);
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
      tenements: cache.data?.tenements.length ?? 0, regions: cache.data?.regions ?? 0,
      fetchedAt: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null,
      ageMinutes: cache.fetchedAt ? Math.round((Date.now() - cache.fetchedAt) / 60000) : null,
      lastError: cache.lastError,
      ai: aiEnabled() ? aiProvider() : null,
    });
    return;
  }

  /* ---------- auth ---------- */
  if (req.method === "POST" && url.pathname === "/api/auth/unlock") {
    let pw = "";
    try { pw = (JSON.parse(await readBody(req)).password ?? "").toString(); } catch { /* ignore */ }
    if (!checkGate(pw)) { send(res, 401, { ok: false }); return; }
    send(res, 200, { ok: true }, { "Set-Cookie": setCookie("haxax_gate", gateToken(), 12 * 3600) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    let account = "", pw = "";
    try { const b = JSON.parse(await readBody(req)); account = (b.account ?? "").toString(); pw = (b.password ?? "").toString(); } catch { /* ignore */ }
    if (!hasGate(parseCookies(req)["haxax_gate"])) { send(res, 403, { ok: false, error: "locked" }); return; }
    if (!checkAccount(account, pw)) { send(res, 401, { ok: false }); return; }
    send(res, 200, { ok: true, account }, { "Set-Cookie": setCookie("haxax_session", sessionToken(account), 12 * 3600) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    send(res, 200, { ok: true }, { "Set-Cookie": [setCookie("haxax_session", "", 0), setCookie("haxax_gate", "", 0)] });
    return;
  }
  if (url.pathname === "/api/auth/me") {
    const c = parseCookies(req);
    send(res, 200, { gate: hasGate(c["haxax_gate"]), account: sessionAccount(c["haxax_session"]), accounts: ACCOUNT_NAMES });
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
    send(res, 200, cache.data);
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
  console.log(`[haxax] access: locked — gate + accounts [${ACCOUNT_NAMES.join(", ")}]${IS_PROD ? "" : "  (dev: cookies non-Secure)"}`);
  if (fs.existsSync(DIST)) console.log(`[haxax] serving built app from ./dist`);
  refresh();
  setInterval(refresh, REFRESH_MS);
});
