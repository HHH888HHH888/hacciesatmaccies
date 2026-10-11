/* ============================================================
   HAXAX — register-wide watches (client API)
   ============================================================ */

export interface WatchCriteria {
  regions?: string[];
  licenceTypes?: string[];
  statuses?: string[];
  holderContains?: string;
  expiryWithinMonths?: number;
}
export interface Watch { id: string; name: string; criteria: WatchCriteria; lastRun: string | null; lastCount: number; }
export interface WatchEvent {
  id: string; watchId: string; watchName: string; kind: "added" | "removed";
  tenementId: string; holder: string; detail: string; timestamp: string;
}
export interface WatchMatch { id: string; holder: string; type: string; status: string; endDate: string | null; }

export async function getWatches(): Promise<{ watches: Watch[]; events: WatchEvent[]; notify?: boolean }> {
  try { const r = await fetch("/api/watches"); if (!r.ok) return { watches: [], events: [] }; return await r.json(); }
  catch { return { watches: [], events: [] }; }
}
export async function testNotify(): Promise<{ ok: boolean; configured: boolean }> {
  try { const r = await fetch("/api/watches/test-notify", { method: "POST" }); if (!r.ok) return { ok: false, configured: false }; return await r.json(); }
  catch { return { ok: false, configured: false }; }
}
export async function createWatch(name: string, criteria: WatchCriteria): Promise<Watch | null> {
  try {
    const r = await fetch("/api/watches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, criteria }) });
    if (!r.ok) return null;
    return (await r.json()).watch ?? null;
  } catch { return null; }
}
export async function deleteWatch(id: string): Promise<void> {
  try { await fetch("/api/watches/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); } catch { /* ignore */ }
}
export async function runWatches(): Promise<{ watches: Watch[]; events: WatchEvent[] }> {
  try { const r = await fetch("/api/watches/run", { method: "POST" }); if (!r.ok) return { watches: [], events: [] }; return await r.json(); }
  catch { return { watches: [], events: [] }; }
}
export async function getWatchMatches(id: string): Promise<WatchMatch[]> {
  try { const r = await fetch(`/api/watches/matches?id=${encodeURIComponent(id)}`); if (!r.ok) return []; return (await r.json()).matches ?? []; }
  catch { return []; }
}

export function criteriaSummary(c: WatchCriteria): string {
  const bits: string[] = [];
  if (c.licenceTypes?.length) bits.push(c.licenceTypes.join("/"));
  else bits.push("all types");
  if (c.regions?.length) bits.push(c.regions.length <= 2 ? c.regions.join(", ") : `${c.regions.length} regions`);
  if (c.holderContains) bits.push(`holder ~ "${c.holderContains}"`);
  if (c.expiryWithinMonths) bits.push(`expiry ≤ ${c.expiryWithinMonths}mo`);
  if (c.statuses?.length) bits.push(c.statuses.join("/"));
  return bits.join(" · ");
}
