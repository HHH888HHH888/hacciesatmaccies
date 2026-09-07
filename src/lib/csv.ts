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
  { h: "All holders", v: (t) => t.holders.join("; ") },
  { h: "Holder type", v: (t) => t.holderType },
  { h: "Region", v: (t) => REGION_MAP[t.regionId].name },
  { h: "Nearest deposit", v: (t) => t.nearbyMines[0]?.name ?? "" },
  { h: "Commodity (inferred)", v: (t) => t.commodities.join("; ") },
  { h: "Area (ha)", v: (t) => Math.round(t.areaHa) },
  { h: "Granted", v: (t) => t.grantDate.slice(0, 10) },
  { h: "Expiry", v: (t) => (new Date(t.expiryDate).getFullYear() > 1971 ? t.expiryDate.slice(0, 10) : "") },
  { h: "Survey status", v: (t) => t.surveyStatus },
  { h: "Ownership", v: (t) => t.ownershipComplexity },
  { h: "Deposits within 25km", v: (t) => t.endowment },
  { h: "Drill collars within 10km", v: (t) => t.drillHolesNearby },
  { h: "Haxax indicator", v: (t) => t.score },
  { h: "Endowment target", v: (t) => t.target?.score ?? "" },
  { h: "Opportunity", v: (t) => t.opportunity?.score ?? "" },
  { h: "Screen", v: (t) => t.action },
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
