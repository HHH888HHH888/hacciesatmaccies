import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, Bell, Plus, Radar as RadarIcon, RefreshCw, Trash2 } from "lucide-react";
import { REGIONS } from "../lib/geo";
import { assessTenement, useStore } from "../lib/store";
import { relTime } from "../lib/format";
import {
  createWatch, criteriaSummary, deleteWatch, getWatchMatches, getWatches, runWatches,
  type Watch, type WatchCriteria, type WatchEvent, type WatchMatch,
} from "../lib/watches";

const LICENCE_TYPES = ["Exploration", "Prospecting", "Mining", "Retention", "Miscellaneous"];
const STATUSES = ["Live", "Pending"];

export function Monitor() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = async () => {
    const d = await getWatches();
    setWatches(d.watches); setEvents(d.events); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const check = async () => {
    setChecking(true);
    const d = await runWatches();
    setWatches(d.watches); setEvents(d.events);
    setChecking(false);
  };

  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>Monitor</h1>
          <div className="sub">Register-wide watches · query the whole WA register and get alerted when the matching set changes</div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={check} disabled={checking}><RefreshCw size={14} className={checking ? "spin" : ""} /> {checking ? "Checking…" : "Check now"}</button>
        </div>
      </div>

      <div className="page-body">
        <div className="monitor-grid">
          <div className="col gap-4" style={{ minWidth: 0 }}>
            <NewWatch onCreated={load} count={watches.length} />
            <div className="card">
              <div className="card-head">
                <span className="card-title"><span className="ct-icon"><RadarIcon size={15} /></span> Active watches</span>
                <span className="muted" style={{ fontSize: "var(--fs-11)" }}>{watches.length} monitoring the full register</span>
              </div>
              <div className="card-body col gap-3">
                {loading ? <p className="muted">Loading…</p>
                  : watches.length === 0 ? <p className="prose muted">No watches yet. Create one above — e.g. “Exploration licences in the Pilbara expiring within 12 months.” Haxax re-checks it against all ~30,000 live tenements on every refresh.</p>
                    : watches.map((w) => <WatchCard key={w.id} w={w} onChanged={load} />)}
              </div>
            </div>
          </div>

          <div className="card" style={{ alignSelf: "start" }}>
            <div className="card-head"><span className="card-title"><span className="ct-icon"><Bell size={15} /></span> Watch events</span></div>
            <div className="card-body">
              {events.length === 0
                ? <p className="prose muted">No events yet. When a tenement enters or leaves one of your watches between refreshes, it shows here — new matches, and ones that dropped out (expired, forfeited, transferred or renewed out of criteria).</p>
                : <div className="list-rows">{events.map((e) => <EventRow key={e.id} e={e} />)}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- create ---------- */
function NewWatch({ onCreated, count }: { onCreated: () => void; count: number }) {
  const [name, setName] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [holder, setHolder] = useState("");
  const [expiry, setExpiry] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const criteria: WatchCriteria = {
      regions: regions.length ? regions : undefined,
      licenceTypes: types.length ? types : undefined,
      statuses: statuses.length ? statuses : undefined,
      holderContains: holder.trim() || undefined,
      expiryWithinMonths: expiry ? Number(expiry) : undefined,
    };
    await createWatch(name.trim() || "Untitled watch", criteria);
    setName(""); setRegions([]); setTypes([]); setStatuses([]); setHolder(""); setExpiry("");
    setBusy(false);
    onCreated();
  };

  return (
    <div className="card">
      <div className="card-head"><span className="card-title"><span className="ct-icon"><Plus size={15} /></span> New watch</span></div>
      <div className="card-body col gap-3">
        <input className="input" placeholder="Watch name — e.g. Pilbara lithium near expiry" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <div className="eyebrow mb-2">Region</div>
          <div className="row gap-2 wrap">
            {REGIONS.map((r) => <Chip key={r.id} on={regions.includes(r.id)} onClick={() => toggle(regions, setRegions, r.id)}>{r.name}</Chip>)}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-2">Licence type</div>
          <div className="row gap-2 wrap">
            {LICENCE_TYPES.map((t) => <Chip key={t} on={types.includes(t)} onClick={() => toggle(types, setTypes, t)}>{t}</Chip>)}
          </div>
        </div>
        <div className="row gap-3 wrap">
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="eyebrow mb-2">Holder contains</div>
            <input className="input" placeholder="e.g. Talison, or a person's name" value={holder} onChange={(e) => setHolder(e.target.value)} />
          </div>
          <div style={{ width: 150 }}>
            <div className="eyebrow mb-2">Expiry within</div>
            <select className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              <option value="">Any</option>
              <option value="6">6 months</option>
              <option value="12">12 months</option>
              <option value="24">24 months</option>
              <option value="36">36 months</option>
            </select>
          </div>
        </div>
        <div>
          <div className="eyebrow mb-2">Status</div>
          <div className="row gap-2 wrap">
            {STATUSES.map((s) => <Chip key={s} on={statuses.includes(s)} onClick={() => toggle(statuses, setStatuses, s)}>{s}</Chip>)}
          </div>
        </div>
        <div className="row between center">
          <span className="faint" style={{ fontSize: "var(--fs-10)" }}>Queries all ~30,000 live tenements, not the loaded sample.</span>
          <button className="btn btn--primary" onClick={submit} disabled={busy || count >= 40}><Plus size={14} /> {busy ? "Creating…" : "Create watch"}</button>
        </div>
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="filter-chip"
      style={{
        padding: "5px 11px", borderRadius: "var(--r-pill)", fontSize: "var(--fs-12)", cursor: "pointer",
        border: "1px solid", borderColor: on ? "var(--accent)" : "var(--border)",
        background: on ? "var(--accent-soft)" : "transparent", color: on ? "var(--accent)" : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

/* ---------- watch card ---------- */
function WatchCard({ w, onChanged }: { w: Watch; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<WatchMatch[] | null>(null);
  const navigate = useNavigate();
  const select = useStore((s) => s.select);

  const viewMatches = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!matches) setMatches(await getWatchMatches(w.id));
  };
  const openTenement = async (id: string) => {
    const r = await assessTenement(id);
    if (r.ok && r.id) { select(r.id); navigate("/map"); }
  };

  return (
    <div className="watch-card">
      <div className="row between center">
        <div style={{ minWidth: 0 }}>
          <div className="t-strong" style={{ fontSize: "var(--fs-14)" }}>{w.name}</div>
          <div className="muted" style={{ fontSize: "var(--fs-11)" }}>{criteriaSummary(w.criteria)}</div>
        </div>
        <div className="row center gap-2">
          <span className="mono t-strong" style={{ fontSize: "var(--fs-18)", color: "var(--accent)" }}>{w.lastCount}</span>
          <button className="icon-btn" onClick={() => deleteWatch(w.id).then(onChanged)} title="Delete watch" style={{ width: 28, height: 28 }}><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="row between center" style={{ marginTop: 8 }}>
        <span className="faint" style={{ fontSize: "var(--fs-10)" }}>{w.lastRun ? `checked ${relTime(w.lastRun)}` : "not yet run"} · matches the full register</span>
        <button className="btn btn--sm" onClick={viewMatches}>{open ? "Hide" : "View matches"}</button>
      </div>
      {open && (
        <div className="watch-matches">
          {matches === null ? <p className="muted" style={{ fontSize: "var(--fs-11)", padding: "6px 0" }}>Loading…</p>
            : matches.length === 0 ? <p className="muted" style={{ fontSize: "var(--fs-11)", padding: "6px 0" }}>No current matches.</p>
              : matches.slice(0, 40).map((m) => (
                <div className="mini-row" key={m.id} onClick={() => openTenement(m.id)} role="button" style={{ cursor: "pointer" }}>
                  <span className="mr-main mono">{m.id}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--fs-11)", color: "var(--text-secondary)" }}>{m.holder}</span>
                  <span className="mr-meta">{m.endDate ? new Date(m.endDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}</span>
                </div>
              ))}
          {matches && matches.length > 40 && <p className="faint" style={{ fontSize: "var(--fs-10)", padding: "4px 0" }}>+{matches.length - 40} more</p>}
        </div>
      )}
    </div>
  );
}

/* ---------- event row ---------- */
function EventRow({ e }: { e: WatchEvent }) {
  const navigate = useNavigate();
  const select = useStore((s) => s.select);
  const open = async () => {
    const r = await assessTenement(e.tenementId);
    if (r.ok && r.id) { select(r.id); navigate("/map"); }
  };
  const added = e.kind === "added";
  return (
    <div className="list-row" onClick={open} role="button" tabIndex={0}>
      <span style={{ color: added ? "var(--score-high)" : "var(--score-low)", display: "flex" }}>
        {added ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
      </span>
      <div className="lr-main">
        <div className="lr-holder" style={{ fontSize: "var(--fs-12)" }}>{e.detail}</div>
        <div className="lr-sub">{e.watchName} · {relTime(e.timestamp)}</div>
      </div>
      <span className="mono faint" style={{ fontSize: "var(--fs-10)" }}>{added ? "IN" : "OUT"}</span>
    </div>
  );
}
