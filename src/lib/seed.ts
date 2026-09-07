/* ============================================================
   HAXAX — offline fallback dataset

   Used ONLY when the live DMIRS/SLIP API is unreachable at startup.
   Rather than hand-maintain mock objects (which drift from the real
   schema and invite fabricated numbers), we run a small set of
   real-shaped raw records through the SAME enrichment pipeline the
   live server uses. Everything here is therefore derived exactly the
   way live data is — no bespoke fake fields.
   ============================================================ */

import type { RawTenement, Deposit } from "./enrich";
import { enrichAll } from "./enrich";

const YEAR = 365.25 * 86400000;
const now = Date.now();
const yrsAgo = (y: number) => now - y * YEAR;
const inYrs = (y: number) => now + y * YEAR;

/* a few real WA reference deposits so the offline set still shows real nearby endowment */
const DEPOSITS: Deposit[] = [
  { name: "Super Pit (KCGM)", commodity: "Gold", stage: "Producing", type: "Mine", lng: 121.50, lat: -30.78 },
  { name: "St Ives", commodity: "Gold", stage: "Producing", type: "Mine", lng: 121.68, lat: -31.20 },
  { name: "Gwalia", commodity: "Gold", stage: "Producing", type: "Mine", lng: 121.33, lat: -28.91 },
  { name: "Greenbushes", commodity: "Lithium", stage: "Producing", type: "Mine", lng: 116.06, lat: -33.86 },
  { name: "Mt Marion", commodity: "Lithium", stage: "Producing", type: "Mine", lng: 121.45, lat: -31.10 },
  { name: "Mt Weld", commodity: "Rare Earths", stage: "Producing", type: "Mine", lng: 122.55, lat: -28.86 },
  { name: "Pilgangoora", commodity: "Lithium", stage: "Producing", type: "Mine", lng: 118.90, lat: -21.10 },
];

const RAW: RawTenement[] = [
  { id: "M 26/0451", rawType: "MINING LEASE", status: "LIVE", holders: ["EXAMPLE GOLD PTY LTD"], survStatus: "Surveyed", grantDate: yrsAgo(19), startDate: yrsAgo(19), endDate: inYrs(1.2), areaHa: 940, poly: [], lng: 121.49, lat: -30.80 },
  { id: "P 26/4402", rawType: "PROSPECTING LICENCE", status: "LIVE", holders: ["J. R. PROSPECTOR"], survStatus: "Graphic", grantDate: yrsAgo(3), startDate: yrsAgo(3), endDate: inYrs(0.6), areaHa: 180, poly: [], lng: 121.55, lat: -30.72 },
  { id: "E 15/1720", rawType: "EXPLORATION LICENCE", status: "LIVE", holders: ["SAMPLE RESOURCES LTD", "PARTNER MINERALS PTY LTD"], survStatus: "Not stated", grantDate: yrsAgo(8), startDate: yrsAgo(8), endDate: inYrs(2.4), areaHa: 6400, poly: [], lng: 121.70, lat: -31.18 },
  { id: "M 37/1288", rawType: "MINING LEASE", status: "LIVE", holders: ["LEONORA GOLD NL"], survStatus: "Surveyed", grantDate: yrsAgo(24), startDate: yrsAgo(24), endDate: inYrs(0.3), areaHa: 1250, poly: [], lng: 121.34, lat: -28.90 },
  { id: "E 70/5601", rawType: "EXPLORATION LICENCE", status: "LIVE", holders: ["BALINGUP LITHIUM PTY LTD"], survStatus: "Not stated", grantDate: yrsAgo(5), startDate: yrsAgo(5), endDate: inYrs(1.8), areaHa: 3200, poly: [], lng: 116.10, lat: -33.84 },
  { id: "E 38/3540", rawType: "EXPLORATION LICENCE", status: "PENDING", holders: ["MT WELD REE PTY LTD"], survStatus: "Not stated", grantDate: yrsAgo(1), startDate: yrsAgo(1), endDate: inYrs(4.5), areaHa: 5100, poly: [], lng: 122.58, lat: -28.88 },
  { id: "M 45/1290", rawType: "MINING LEASE", status: "LIVE", holders: ["PILBARA GROUND HOLDINGS PTY LTD"], survStatus: "Survey pending", grantDate: yrsAgo(16), startDate: yrsAgo(16), endDate: inYrs(2.9), areaHa: 2100, poly: [], lng: 118.92, lat: -21.08 },
  { id: "P 15/6120", rawType: "PROSPECTING LICENCE", status: "LIVE", holders: ["A. B. SMITH"], survStatus: "Graphic", grantDate: yrsAgo(2), startDate: yrsAgo(2), endDate: inYrs(1.1), areaHa: 190, poly: [], lng: 121.46, lat: -31.12 },
];

const bundle = enrichAll(RAW, now, DEPOSITS, []);

export const TENEMENTS = bundle.tenements;
export const ALERTS = bundle.alerts;
export const FEED = bundle.feed;
export const STATS = bundle.stats;
