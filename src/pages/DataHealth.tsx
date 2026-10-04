import type React from "react";
import { useState } from "react";
import { Activity, Database, ExternalLink, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { bootstrapData, useStore } from "../lib/store";
import { fmtNum, relTime } from "../lib/format";
import { useTick } from "../lib/hooks";
import { KpiTile } from "../components/ui";

const TENGRAPH_URL = "https://tgw.dmp.wa.gov.au/tgw/";

const PIPELINE = ["Fetch (DMIRS/SLIP)", "Normalise", "Enrich & score", "Change-detect", "Serve"];
const statusColor = (ok: boolean) => (ok ? "var(--score-high)" : "var(--score-low)");

export function DataHealth() {
  const lastSync = useStore((s) => s.lastSync);
  const bumpSync = useStore((s) => s.bumpSync);
  const stats = useStore((s) => s.stats);
  const dataStatus = useStore((s) => s.dataStatus);
  const dataSource = useStore((s) => s.dataSource);
  const generatedAt = useStore((s) => s.dataGeneratedAt);
  const regions = useStore((s) => s.dataRegions);
  const registerTotal = useStore((s) => s.dataRegisterTotal);
  const [syncing, setSyncing] = useState(false);
  useTick(15000);

  const live = dataStatus === "live";
  const sync = async () => { setSyncing(true); await bootstrapData(); bumpSync(); setSyncing(false); };
  const pct = registerTotal ? Math.max(1, Math.round((stats.tenements / registerTotal) * 100)) : 0;

  // bulk sources — real counts actually loaded into the app
  const bulk = [
    { name: "DMIRS Mining Tenements", code: "DMIRS-003", records: stats.tenements, note: registerTotal ? `loaded of ${fmtNum(registerTotal)} live/pending` : "live records loaded" },
    { name: "MINEDEX deposits", code: "DMIRS-001", records: stats.deposits, note: "mines & prospects loaded" },
    { name: "DMIRS drill collars", code: "DMIRS-004", records: stats.drillHoles, note: "collar points loaded" },
  ];
  // context layers — queried live, per tenement, on demand
  const onDemand = [
    { name: "GSWA interpreted geology", code: "DMIRS-016", desc: "Bedrock unit at the point" },
    { name: "DMIRS mineral fields", code: "DMIRS-005", desc: "Mineral field & district" },
    { name: "Landgate LGA boundaries", code: "LGATE-233", desc: "Local government area" },
    { name: "Native Title (NNTT / Fed Court)", code: "LGATE-066/004", desc: "Determinations & claims" },
    { name: "WAMEX exploration reports", code: "DMIRS-033", desc: "Report density near the ground" },
    { name: "Adjacent tenements", code: "DMIRS-003", desc: "Neighbours within ~25 km" },
  ];

  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>Data Health</h1>
          <div className="sub">
            {dataSource} · {live ? `${regions}/10 regions` : "cached"} · last sync {relTime(new Date(lastSync).toISOString())} ·{" "}
            <span style={{ color: live ? "var(--score-high)" : "var(--score-mid)" }}>{live ? "live feed operational" : "register unreachable — using cached snapshot"}</span>
            {generatedAt && <span className="faint"> · snapshot {relTime(generatedAt)}</span>}
          </div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={sync} disabled={syncing}><RefreshCw size={14} className={syncing ? "spin" : ""} /> {syncing ? "Syncing…" : "Sync now"}</button>
        </div>
      </div>

      <div className="page-body">
        {/* real record counts */}
        <div className="grid-kpis" style={{ marginBottom: "var(--sp-4)" }}>
          <KpiTile label="Full WA register" value={registerTotal ? fmtNum(registerTotal) : "—"} accent="var(--accent)" sub="live / pending (real total)" />
          <KpiTile label="Loaded here" value={fmtNum(stats.tenements)} sub={registerTotal ? `${pct}% · any ID searchable` : "live sample"} />
          <KpiTile label="Deposits" value={fmtNum(stats.deposits)} sub="MINEDEX, loaded" />
          <KpiTile label="Drill collars" value={fmtNum(stats.drillHoles)} sub="DMIRS, loaded" />
          <KpiTile label="Ground covered" value={fmtNum(Math.round(stats.totalAreaHa))} sub="hectares (loaded set)" />
          <KpiTile label="Alerts" value={fmtNum(stats.alerts)} sub="from real register facts" />
        </div>

        {/* honest provenance banner */}
        <div className="card" style={{ marginBottom: "var(--sp-4)", borderColor: "var(--accent-line)" }}>
          <div className="card-body">
            <div className="row center gap-2" style={{ marginBottom: "var(--sp-2)" }}>
              <ShieldCheck size={16} style={{ color: "var(--accent)" }} />
              <span className="t-strong" style={{ fontSize: "var(--fs-14)" }}>Coverage &amp; provenance</span>
            </div>
            <p className="prose" style={{ marginBottom: "var(--sp-2)" }}>
              Haxax loads a representative <strong>{fmtNum(stats.tenements)}</strong> of the{" "}
              <strong>{registerTotal ? fmtNum(registerTotal) : "~30,000+"}</strong> live/pending WA tenements for the map and
              lists; <strong>any</strong> tenement is reachable live by ID from the search bar. Statutory and geological
              context (geology, mineral field, LGA, native title, WAMEX) is queried live from government services per
              tenement, when you open it.
            </p>
            <p className="prose faint" style={{ fontSize: "var(--fs-11)" }}>
              Data is a public DMIRS/SLIP feed cached ~30 min — a research tool, not the authoritative register, and not a
              valuation. Verify every target on the official record before transacting.
            </p>
            <div className="row gap-2 wrap" style={{ marginTop: "var(--sp-3)" }}>
              <a className="btn btn--sm" href={TENGRAPH_URL} target="_blank" rel="noreferrer"><ExternalLink size={13} /> TENGRAPH Web (official)</a>
            </div>
          </div>
        </div>

        {/* pipeline */}
        <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
          <div className="card-head">
            <span className="card-title"><span className="ct-icon"><Server size={15} /></span> Refresh pipeline</span>
            <span className="source-status"><span className="ss-dot" style={{ background: statusColor(live) }} /> {live ? "Operational" : "Degraded"}</span>
          </div>
          <div className="card-body">
            <div className="pipeline">
              {PIPELINE.map((p, i) => (
                <div className="pipe-stage" key={p}>
                  <div className="pipe-node"><span className="pn-dot" style={{ background: statusColor(live) }} />{p}</div>
                  {i < PIPELINE.length - 1 && <span className="pipe-arrow">→</span>}
                </div>
              ))}
            </div>
            <div className="row gap-4 wrap" style={{ marginTop: "var(--sp-4)" }}>
              <Metric icon={<RefreshCw size={14} />} label="Refresh cadence" value="Every 30 minutes" />
              <Metric icon={<Activity size={14} />} label="Live lookup" value="Any tenement by ID" />
              <Metric icon={<Database size={14} />} label="Store" value="In-memory cache" />
              <Metric icon={<RefreshCw size={14} />} label="Last refresh" value={generatedAt ? relTime(generatedAt) : "—"} />
            </div>
          </div>
        </div>

        {/* bulk sources — real */}
        <div className="sb-section-head" style={{ padding: "0 2px var(--sp-2)", border: 0 }}>
          <span className="eyebrow">Bulk feeds · loaded into the app</span>
        </div>
        <div className="health-grid" style={{ marginBottom: "var(--sp-4)" }}>
          {bulk.map((s) => (
            <div className="source-tile" key={s.name}>
              <div className="source-head">
                <div>
                  <div style={{ fontWeight: 700, fontSize: "var(--fs-14)" }}>{s.name}</div>
                  <div className="muted" style={{ fontSize: "var(--fs-11)" }}>{s.code}</div>
                </div>
                <span className="source-status" style={{ color: statusColor(live) }}>
                  <span className="ss-dot" style={{ background: statusColor(live) }} /> {live ? "Live" : "Cached"}
                </span>
              </div>
              <div className="row between" style={{ marginTop: "var(--sp-2)", fontSize: "var(--fs-13)" }}>
                <span className="mono t-strong" style={{ color: "var(--text-primary)", fontSize: "var(--fs-18)" }}>{fmtNum(s.records)}</span>
                <span className="faint" style={{ fontSize: "var(--fs-11)", textAlign: "right", maxWidth: 160 }}>{s.note}</span>
              </div>
            </div>
          ))}
        </div>

        {/* on-demand sources — real, per tenement */}
        <div className="sb-section-head" style={{ padding: "0 2px var(--sp-2)", border: 0 }}>
          <span className="eyebrow">Context layers · queried live, per tenement</span>
        </div>
        <div className="health-grid">
          {onDemand.map((s) => (
            <div className="source-tile" key={s.name}>
              <div className="source-head">
                <div>
                  <div style={{ fontWeight: 700, fontSize: "var(--fs-13)" }}>{s.name}</div>
                  <div className="muted" style={{ fontSize: "var(--fs-11)" }}>{s.desc}</div>
                </div>
                <span className="source-status" style={{ color: "var(--accent)" }}>
                  <span className="ss-dot" style={{ background: "var(--accent)" }} /> On-demand
                </span>
              </div>
              <div className="faint mono" style={{ marginTop: "var(--sp-2)", fontSize: "var(--fs-10)" }}>{s.code}</div>
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
