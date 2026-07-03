/* ============================================================
   HAXAX — CSV export of the register / portfolio
   ============================================================ */

import type { Tenement } from "./types";
import { REGION_MAP } from "./geo";

const COLS: { h: string; v: (t: Tenement) => string | number }[] = [
  { h: "Tenement", v: (t) => t.id },
  { h: "Type", v: (t) => t.licenceType },
  { h: "Status", v: (t) => t.status },
  { h: "Holder", v: (t) => t.holder },
  { h: "Holder type", v: (t) => t.holderType },
  { h: "Region", v: (t) => REGION_MAP[t.regionId].name },
  { h: "District", v: (t) => t.district },
  { h: "Commodity", v: (t) => t.commodities.join("; ") },
  { h: "Area (ha)", v: (t) => Math.round(t.areaHa) },
  { h: "Granted", v: (t) => t.grantDate.slice(0, 10) },
  { h: "Expiry", v: (t) => t.expiryDate.slice(0, 10) },
  { h: "Haxax Score", v: (t) => t.score },
  { h: "Call", v: (t) => t.action },
  { h: "Play", v: (t) => t.econ.play },
  { h: "Implied EV (A$m)", v: (t) => t.econ.impliedEvMidM },
  { h: "Acq cost (A$m)", v: (t) => t.econ.acqCostM },
  { h: "Flip uplift (%)", v: (t) => t.econ.upliftPct },
  { h: "Holding cost p.a. (A$)", v: (t) => t.econ.holdingCostPa },
  { h: "Rent p.a. (A$)", v: (t) => t.register.rentPerYear },
  { h: "Target score", v: (t) => t.target?.score ?? "" },
  { h: "Native title", v: (t) => t.register.nativeTitle },
  { h: "Latitude", v: (t) => t.lat.toFixed(5) },
  { h: "Longitude", v: (t) => t.lng.toFixed(5) },
];

const esc = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(tenements: Tenement[]): string {
  const head = COLS.map((c) => esc(c.h)).join(",");
  const rows = tenements.map((t) => COLS.map((c) => esc(c.v(t))).join(","));
  return [head, ...rows].join("\n");
}

export function downloadCsv(filename: string, tenements: Tenement[]): void {
  const blob = new Blob([toCsv(tenements)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const stamp = () => new Date().toISOString().slice(0, 10);
