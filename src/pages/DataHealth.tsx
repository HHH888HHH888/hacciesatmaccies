import type React from "react";
import { useState } from "react";
import { Activity, CheckCircle2, Database, RefreshCw, Server, Zap } from "lucide-react";
import { bootstrapData, useStore } from "../lib/store";
import { fmtNum, relTime } from "../lib/format";
import { useTick } from "../lib/hooks";
import { KpiTile } from "../components/ui";

const SOURCES = [
  { name: "TENGRAPH", desc: "Tenement boundaries & status", coverage: 99, status: "Healthy", records: 41922, lagMin: 12 },
  { name: "MINEDEX", desc: "Mines, deposits & resources", coverage: 96, status: "Healthy", records: 8841, lagMin: 38 },
  { name: "GeoVIEW.WA", desc: "Geoscience & geophysics layers", coverage: 92, status: "Healthy", records: 15203, lagMin: 64 },
  { name: "WAMEX", desc: "Open-file exploration reports", coverage: 88, status: "Degraded", records: 30418, lagMin: 220 },
  { name: "DMIRS Register", desc: "Holders, transfers & dealings", coverage: 97, status: "Healthy", records: 12677, lagMin: 26 },
  { name: "Native Title (NNTT)", desc: "Claims & determinations", coverage: 90, status: "Healthy", records: 642, lagMin: 180 },
];

const PIPELINE = [
  { label: "Ingest", ok: true },
  { label: "Normalise", ok: true },
  { label: "Geocode", ok: true },
  { label: "Score", ok: true },
  { label: "Alert engine", ok: true },
];

const statusColor = (s: string) => (s === "Healthy" ? "var(--score-high)" : s === "Degraded" ? "var(--score-mid)" : "var(--score-low)");

export function DataHealth() {
  const lastSync = useStore((s) => s.lastSync);
  const bumpSync = useStore((s) => s.bumpSync);
  const stats = useStore((s) => s.stats);
  const dataStatus = useStore((s) => s.dataStatus);
  const dataSource = useStore((s) => s.dataSource);
  const generatedAt = useStore((s) => s.dataGeneratedAt);
  const regions = useStore((s) => s.dataRegions);
  const [syncing, setSyncing] = useState(false);
  useTick(15000);

  const live = dataStatus === "live";
  const sync = async () => { setSyncing(true); await bootstrapData(); bumpSync(); setSyncing(false); };

  // primary feed reflects real connection state
  const sources = [
    { name: "DMIRS / SLIP", desc: "Live mining tenements (DMIRS-003)", coverage: live ? 99 : 0, status: live ? "Healthy" : "Offline", records: stats.tenements, lagMin: 0 },
    ...SOURCES,
  ];

  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>Data Health</h1>
          <div className="sub">
            {dataSource} · {live ? `${regions}/10 regions` : "cached"} · last sync {relTime(new Date(lastSync).toISOString())} ·{" "}
            <span style={{ color: live ? "var(--score-high)" : "var(--score-mid)" }}>{live ? "live feed operational" : "register unreachable — using cached snapshot"}</span>
            {generatedAt && <span className="faint"> · register snapshot {relTime(generatedAt)}</span>}
          </div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={sync} disabled={syncing}><RefreshCw size={14} className={syncing ? "spin" : ""} /> {syncing ? "Syncing…" : "Sync now"}</button>
        </div>
      </div>

      <div className="page-body">
        {/* record counts */}
        <div className="grid-kpis" style={{ marginBottom: "var(--sp-4)" }}>
          <KpiTile label="Tenements" value={fmtNum(stats.tenements)} sub="active records" />
          <KpiTile label="Deposits" value={fmtNum(stats.deposits)} sub="mines & prospects" />
          <KpiTile label="Drill holes" value={fmtNum(stats.drillHoles)} sub="historic + recent" />
          <KpiTile label="Historical events" value={fmtNum(stats.events)} sub="timeline records" />
          <KpiTile label="Comparables" value={fmtNum(stats.comps)} sub="transactions" />
          <KpiTile label="Alerts emitted" value={fmtNum(stats.alerts)} sub="rolling 10 days" />
        </div>

        {/* pipeline */}
        <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
          <div className="card-head">
            <span className="card-title"><span className="ct-icon"><Server size={15} /></span> Ingestion pipeline</span>
            <span className="source-status"><span className="ss-dot" style={{ background: "var(--score-high)" }} /> Operational</span>
          </div>
          <div className="card-body">
            <div className="pipeline">
              {PIPELINE.map((p, i) => (
                <div className="pipe-stage" key={p.label}>
                  <div className="pipe-node">
                    <span className="pn-dot" style={{ background: statusColor(p.ok ? "Healthy" : "Down") }} />
                    {p.label}
                  </div>
                  {i < PIPELINE.length - 1 && <span className="pipe-arrow">→</span>}
                </div>
              ))}
            </div>
            <div className="row gap-4 wrap" style={{ marginTop: "var(--sp-4)" }}>
              <Metric icon={<Zap size={14} />} label="Scoring throughput" value="1,240 tenements/min" />
              <Metric icon={<Activity size={14} />} label="Alert engine" value="Live · 6 rules armed" />
              <Metric icon={<Database size={14} />} label="Store" value="In-memory + PostGIS-ready" />
              <Metric icon={<CheckCircle2 size={14} />} label="Last full reindex" value={relTime(new Date(lastSync - 3600_000).toISOString())} />
            </div>
          </div>
        </div>

        {/* sources */}
        <div className="sb-section-head" style={{ padding: "0 2px var(--sp-2)", border: 0 }}>
          <span className="eyebrow">Source coverage · {sources.length} feeds</span>
        </div>
        <div className="health-grid">
          {sources.map((s) => (
            <div className="source-tile" key={s.name}>
              <div className="source-head">
                <div>
                  <div style={{ fontWeight: 700, fontSize: "var(--fs-14)" }}>{s.name}</div>
                  <div className="muted" style={{ fontSize: "var(--fs-11)" }}>{s.desc}</div>
                </div>
                <span className="source-status" style={{ color: statusColor(s.status) }}>
                  <span className="ss-dot" style={{ background: statusColor(s.status) }} /> {s.status}
                </span>
              </div>
              <div className="row between" style={{ fontSize: "var(--fs-11)" }}>
                <span className="muted">Coverage</span>
                <span className="mono t-strong" style={{ color: "var(--text-primary)" }}>{s.coverage}%</span>
              </div>
              <div className="health-bar">
                <div className="health-bar-fill" style={{ width: `${s.coverage}%`, background: statusColor(s.status) }} />
              </div>
              <div className="row between" style={{ marginTop: "var(--sp-3)", fontSize: "var(--fs-11)" }}>
                <span className="muted">{fmtNum(s.records)} records</span>
                <span className="faint mono">sync {s.lagMin}m ago</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="col" style={{ gap: 3, minWidth: 160 }}>
      <span className="eyebrow row center gap-1" style={{ color: "var(--text-muted)" }}>
        <span style={{ color: "var(--accent)" }}>{icon}</span> {label}
      </span>
      <span className="t-strong" style={{ fontSize: "var(--fs-13)", color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
