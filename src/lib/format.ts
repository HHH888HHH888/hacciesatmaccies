/* ============================================================
   HAXAX — formatting helpers
   ============================================================ */

export function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("en-AU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtHa(ha: number): string {
  if (ha >= 100000) return `${(ha / 1000).toLocaleString("en-AU", { maximumFractionDigits: 0 })}k ha`;
  return `${fmtNum(Math.round(ha))} ha`;
}

export function fmtKm2(ha: number): string {
  return `${fmtNum(Math.round(ha / 100))} km²`;
}

export function fmtMoneyM(m: number): string {
  if (m >= 1000) return `A$${(m / 1000).toFixed(2)}b`;
  if (m >= 100) return `A$${m.toFixed(0)}m`;
  return `A$${m.toFixed(1)}m`;
}

export function fmtPerHa(v: number): string {
  if (v >= 1000) return `A$${(v / 1000).toFixed(1)}k/ha`;
  return `A$${Math.round(v)}/ha`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Relative time, anchored to the supplied "now" (defaults to Date.now). */
export function relTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/** Whole years between iso and now (can be negative if future). */
export function yearsSince(iso: string, now = Date.now()): number {
  return (now - new Date(iso).getTime()) / (365.25 * 24 * 3600 * 1000);
}

export function daysUntil(iso: string, now = Date.now()): number {
  return Math.round((new Date(iso).getTime() - now) / (24 * 3600 * 1000));
}

export function expiryLabel(iso: string, now = Date.now()): string {
  const days = daysUntil(iso, now);
  if (days < 0) return "Expired";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
