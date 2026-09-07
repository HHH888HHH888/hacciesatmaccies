import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  Crosshair,
  Database,
  FileText,
  Gavel,
  Layers,
  Locate,
  Mountain,
  Network,
  Pickaxe,
  ScrollText,
  ShieldAlert,
  Star,
  X,
} from "lucide-react";
import { useStore } from "../lib/store";
import { REGION_MAP } from "../lib/geo";
import { daysUntil, fmtDate, fmtHa, fmtKm2, fmtNum, expiryLabel, relTime } from "../lib/format";
import { bandColor } from "../lib/scoring";
import type { AIOpinion, RealContext, SuggestedAction, Tenement } from "../lib/types";
import {
  CommodityTag,
  RadialScore,
  RiskBadge,
  StatusBadge,
} from "./ui";
import { AIOpinionCard } from "./AIOpinionCard";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { TenementTimeline } from "./TenementTimeline";

interface Neighbours {
  neighbours: { id: string; holder: string; type: string; status: string; km: number }[];
  dominantHolder: string | null;
  dominantCount: number;
  total: number;
}

type Tab = "brief" | "context" | "score" | "tenure" | "activity";
const TABS: { id: Tab; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "context", label: "Context" },
  { id: "score", label: "Indicator" },
  { id: "tenure", label: "Register" },
  { id: "activity", label: "Dates" },
];

const actionColor = (a: SuggestedAction) =>
  a === "Acquire" ? "var(--score-high)" : a === "Investigate" ? "var(--info)" : a === "Monitor" ? "var(--score-mid)" : "var(--score-low)";

const hasRealExpiry = (t: Tenement) => new Date(t.expiryDate).getFullYear() > 1971;

export function DetailDrawer() {
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const isWatched = useStore((s) => s.watchlist.includes(selectedId ?? ""));
  const toggleWatch = useStore((s) => s.toggleWatch);
  const requestFlyTo = useStore((s) => s.requestFlyTo);
  const tenements = useStore((s) => s.tenements);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [tab, setTab] = useState<Tab>("brief");

  // pages that present their own detail — don't double up with the drawer
  const suppressed = pathname === "/memo" || pathname === "/data" || pathname === "/comparables";
  const t = selectedId && !suppressed ? tenements.find((x) => x.id === selectedId) : undefined;

  // LLM-generated research note (when an AI key is configured server-side)
  const [aiNote, setAiNote] = useState<(AIOpinion & { provider?: string }) | null>(null);
  useEffect(() => {
    setAiNote(null);
    if (!t) return;
    let cancelled = false;
    fetch("/api/opinion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && d.provider) setAiNote(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [t?.id]);

  // real neighbouring ground from the live register (consolidation intelligence)
  const [neighbours, setNeighbours] = useState<Neighbours | null>(null);
  // real statutory + geological context from live government layers
  const [ctx, setCtx] = useState<RealContext | null>(null);
  useEffect(() => {
    setNeighbours(null); setCtx(null);
    if (!t) return;
    let cancelled = false;
    fetch(`/api/neighbours?lng=${t.lng}&lat=${t.lat}&id=${encodeURIComponent(t.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setNeighbours(d); })
      .catch(() => {});
    fetch(`/api/context?lng=${t.lng}&lat=${t.lat}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setCtx(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [t?.id]);

  useEffect(() => { setTab("brief"); }, [selectedId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && selectedId) select(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, select]);

  const open = !!t;

  return (
    <>
      <div className={`detail-backdrop ${open ? "show" : ""}`} onClick={() => select(null)} />
      <aside className={`detail-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
        {t && (
          <>
            <div className="detail-head">
              <div className="detail-head-top">
                <div style={{ minWidth: 0 }}>
                  <div className="detail-id">{t.id}</div>
                  <div className="detail-sub">
                    {t.licenceType} · {ctx?.mineralField ? `${ctx.mineralField.field} M.F.` : REGION_MAP[t.regionId].name}
                  </div>
                </div>
                <div className="detail-head-actions">
                  <button
                    className="icon-btn"
                    onClick={() => toggleWatch(t.id)}
                    title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                    style={isWatched ? { color: "var(--amber)" } : undefined}
                  >
                    <Star size={16} fill={isWatched ? "var(--amber)" : "none"} />
                  </button>
                  <button className="icon-btn" onClick={() => { requestFlyTo(t.regionId); navigate("/map"); }} title="Locate on map">
                    <Locate size={16} />
                  </button>
                  <button className="icon-btn" onClick={() => select(null)} title="Close" aria-label="Close panel">
                    <X size={17} />
                  </button>
                </div>
              </div>
              <div className="row gap-2 wrap" style={{ marginTop: 10 }}>
                <StatusBadge status={t.status} />
                {t.commodities.map((c) => <CommodityTag key={c} c={c} />)}
                <span className="mono faint" style={{ fontSize: "var(--fs-11)", marginLeft: "auto" }}>{t.holder}</span>
              </div>
            </div>

            {/* decision strip — the screen call, with the opportunity signal */}
            <div className="decision-strip" style={{ ["--dc" as string]: actionColor(t.action) } as React.CSSProperties}>
              <div>
                <div className="decision-word">{t.action.toUpperCase()}</div>
                <div className="decision-sub">
                  Opportunity {t.opportunity?.score ?? "—"} · conviction {t.ai.confidence}% · {t.riskFlags.length} flag{t.riskFlags.length === 1 ? "" : "s"}
                </div>
              </div>
              <div>
                <div className="decision-score">
                  <span className="dnum" style={{ color: bandColor(t.score) }}>{t.score}</span>
                  <span className="dden">/100</span>
                </div>
                <div className="decision-pct">P{t.scorePercentile} of {REGION_MAP[t.regionId].name}</div>
              </div>
            </div>

            <div className="tabs">
              {TABS.map((tb) => (
                <button key={tb.id} className={`tab ${tab === tb.id ? "is-active" : ""}`} onClick={() => setTab(tb.id)}>
                  {tb.label}
                </button>
              ))}
            </div>

            <div className="detail-scroll">
              {tab === "brief" && <BriefTab t={t} aiNote={aiNote} neighbours={neighbours} />}
              {tab === "context" && <ContextTab ctx={ctx} />}
              {tab === "score" && <ScoreTab t={t} />}
              {tab === "tenure" && <TenureTab t={t} ctx={ctx} />}
              {tab === "activity" && (
                <div className="detail-section">
                  <div className="detail-section-title"><CalendarClock size={13} className="dst-icon" /> Register dates</div>
                  <TenementTimeline events={t.timeline} />
                  <p className="prose faint" style={{ fontSize: "var(--fs-10)", marginTop: "var(--sp-2)" }}>
                    Only statutory dates on the DMIRS register are shown — grant, term start and expiry. No exploration or drilling events are inferred.
                  </p>
                </div>
              )}
            </div>

            <div className="detail-section" style={{ borderTop: "1px solid var(--border)", borderBottom: 0 }}>
              <div className="row gap-2">
                <button className="btn btn--primary grow" onClick={() => navigate("/memo")}>
                  <FileText size={14} /> Generate IC Memo
                </button>
                <button className="btn" onClick={() => toggleWatch(t.id)}>
                  <Star size={14} fill={isWatched ? "var(--amber)" : "none"} />
                  {isWatched ? "Watching" : "Watch"}
                </button>
              </div>
              <div className="faint" style={{ fontSize: "var(--fs-10)", marginTop: "var(--sp-2)", textAlign: "center" }}>
                Updated {relTime(t.lastUpdated)} · DMIRS / SLIP register · MINEDEX · GSWA · NNTT
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/* ---------- rows ---------- */
function Reg({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="reg-row">
      <span className="rk">{k}</span>
      <span className={`rv ${mono ? "mono" : ""}`}>{v}</span>
    </div>
  );
}

/* ---------- Brief ---------- */
function BriefTab({ t, aiNote, neighbours }: { t: Tenement; aiNote?: (AIOpinion & { provider?: string }) | null; neighbours?: Neighbours | null }) {
  return (
    <>
      <div className="detail-section">
        <AIOpinionCard t={t} opinion={aiNote ?? undefined} provider={aiNote?.provider} />
      </div>
      <div className="detail-section">
        <div className="detail-section-title"><Mountain size={13} className="dst-icon" /> Nearby mines & deposits (MINEDEX)</div>
        {t.nearbyMines.length ? (
          <div className="mini-list">
            {t.nearbyMines.map((m, i) => (
              <div className="mini-row" key={i}>
                <span className="mr-main">{m.name}</span>
                <CommodityTag c={m.commodity} dot />
                <span className="mr-meta">{m.distanceKm} km · {m.status}</span>
              </div>
            ))}
          </div>
        ) : <p className="prose">No MINEDEX deposit recorded within 120 km of this ground.</p>}
      </div>
      {t.target && (
        <div className="detail-section">
          <div className="detail-section-title"><Crosshair size={13} className="dst-icon" /> Endowment targeting</div>
          <div className="row center gap-3" style={{ marginBottom: "var(--sp-2)" }}>
            <span className="mono" style={{ fontSize: "var(--fs-22)", fontWeight: 800, color: t.target.score >= 75 ? "var(--score-high)" : t.target.score >= 62 ? "var(--accent)" : "var(--text-secondary)" }}>
              {t.target.score}<span className="faint" style={{ fontSize: "var(--fs-11)" }}>/100</span>
            </span>
            <div className="muted" style={{ fontSize: "var(--fs-11)" }}>
              {t.target.endowment} recorded deposits within 25 km · nearest {t.target.nearestKm} km · {t.drillHolesNearby} drill collars ≤10 km
            </div>
          </div>
          <p className="prose">{t.target.rationale}</p>
          {t.target.analogs.length > 0 && (
            <div className="row gap-2 wrap" style={{ marginTop: "var(--sp-2)" }}>
              {t.target.analogs.map((a) => <span key={a} className="acquirer-chip">{a}</span>)}
            </div>
          )}
        </div>
      )}
      <div className="detail-section">
        <div className="detail-section-title"><ShieldAlert size={13} className="dst-icon" /> Risk flags</div>
        {t.riskFlags.length ? (
          <div className="flag-wrap">
            {t.riskFlags.map((r, i) => <RiskBadge key={i} level={r.level} label={r.label} />)}
          </div>
        ) : <p className="prose">No date- or title-based risk flags on the register.</p>}
      </div>

      {neighbours && neighbours.neighbours.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title"><Network size={13} className="dst-icon" /> Neighbouring ground · consolidation</div>
          <p className="prose" style={{ marginBottom: "var(--sp-2)" }}>
            {neighbours.total} live/pending tenement{neighbours.total === 1 ? "" : "s"} within ~25 km.
            {neighbours.dominantHolder && neighbours.dominantCount > 1 && (
              <> Dominant neighbour: <strong style={{ color: "var(--text-primary)" }}>{neighbours.dominantHolder}</strong> ({neighbours.dominantCount}) — a natural consolidation counterparty.</>
            )}
          </p>
          <div className="mini-list">
            {neighbours.neighbours.slice(0, 7).map((n) => (
              <div className="mini-row" key={n.id}>
                <span className="mr-main mono">{n.id}</span>
                <span style={{ fontSize: "var(--fs-11)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{n.holder}</span>
                <span className="mr-meta">{n.km} km</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Context (real government layers, on-demand) ---------- */
function ContextTab({ ctx }: { ctx: RealContext | null }) {
  if (!ctx) {
    return (
      <div className="detail-section">
        <div className="detail-section-title"><Layers size={13} className="dst-icon" /> Statutory & geological context</div>
        <p className="prose muted">Querying live DMIRS / GSWA / Landgate / NNTT layers…</p>
      </div>
    );
  }
  return (
    <>
      <div className="detail-section">
        <div className="detail-section-title"><Mountain size={13} className="dst-icon" /> Bedrock geology (GSWA)</div>
        {ctx.geology ? (
          <>
            <div className="reg-list">
              <Reg k="Unit" v={ctx.geology.unit} />
              <Reg k="Code" v={ctx.geology.code} mono />
            </div>
            {ctx.geology.description && <p className="prose" style={{ marginTop: "var(--sp-2)" }}>{ctx.geology.description}</p>}
          </>
        ) : <p className="prose muted">No interpreted bedrock unit at this point.</p>}
      </div>

      <div className="detail-section">
        <div className="detail-section-title"><Pickaxe size={13} className="dst-icon" /> Mineral field & jurisdiction</div>
        <div className="reg-list">
          <Reg k="Mineral field" v={ctx.mineralField ? `${ctx.mineralField.field} (${ctx.mineralField.number})` : "—"} />
          <Reg k="Mining district" v={ctx.mineralField?.district ?? "—"} />
          <Reg k="Local govt area" v={ctx.lga ?? "—"} />
          <Reg k="1:250k map sheet" v={ctx.mapSheet ?? "—"} mono />
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-title"><Gavel size={13} className="dst-icon" /> Native title (NNTT / Federal Court)</div>
        {ctx.nativeTitle ? (
          <div className="reg-list">
            <Reg k="Application" v={ctx.nativeTitle.name} />
            <Reg k="Type" v={ctx.nativeTitle.type} />
            <Reg k="Status" v={ctx.nativeTitle.status} />
            {ctx.nativeTitle.reference && <Reg k="Reference" v={ctx.nativeTitle.reference} mono />}
          </div>
        ) : <p className="prose muted">No native-title determination or registered claim intersects this point.</p>}
      </div>

      <div className="detail-section">
        <div className="detail-section-title"><Database size={13} className="dst-icon" /> Exploration evidence (real)</div>
        <div className="reg-list">
          <Reg k="WAMEX reports ≤10 km" v={ctx.wamexReports != null ? fmtNum(ctx.wamexReports) : "—"} mono />
          <Reg k="Drill collars ≤10 km" v={ctx.drillHolesNearby != null ? fmtNum(ctx.drillHolesNearby) : "—"} mono />
        </div>
        <p className="prose faint" style={{ fontSize: "var(--fs-10)", marginTop: "var(--sp-2)" }}>
          {ctx.source}
        </p>
      </div>
    </>
  );
}

/* ---------- Indicator ---------- */
function ScoreTab({ t }: { t: Tenement }) {
  return (
    <div className="detail-section">
      <div className="row center gap-4" style={{ marginBottom: "var(--sp-3)" }}>
        <RadialScore score={t.score} size={88} label="HAXAX" />
        <div>
          <div className="ai-verdict-label" style={{ fontSize: "var(--fs-14)" }}>
            {t.score >= 85 ? "Top-decile on the indicator" : t.score >= 60 ? "Mid-band — selective" : "Below screen threshold"}
          </div>
          <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 4 }}>
            Ranks <strong style={{ color: "var(--text-primary)" }}>P{t.scorePercentile}</strong> of {REGION_MAP[t.regionId].name}. A transparent weighted indicator computed from real inputs only — dates, endowment, drill density, holder. Not a valuation.
          </div>
        </div>
      </div>
      <ScoreBreakdown t={t} defaultOpen />
    </div>
  );
}

/* ---------- Register (real tenure fields only) ---------- */
function TenureTab({ t, ctx }: { t: Tenement; ctx: RealContext | null }) {
  const r = t.register;
  const days = daysUntil(t.expiryDate);
  const realExpiry = hasRealExpiry(t);
  const expiryColor = !realExpiry ? "var(--text-secondary)" : days < 0 ? "var(--score-low)" : days < 365 ? "var(--score-mid)" : "var(--text-primary)";
  return (
    <>
      <div className="detail-section">
        <div className="detail-section-title"><ScrollText size={13} className="dst-icon" /> Tenure register (DMIRS)</div>
        <div className="reg-cols">
          <div className="reg-list">
            <Reg k="Tenement ID" v={t.id} mono />
            <Reg k="Licence type" v={t.licenceType} />
            <Reg k="Status" v={<StatusBadge status={t.status} />} />
            <Reg k="Mineral field" v={ctx?.mineralField ? `${ctx.mineralField.field}` : "—"} />
            <Reg k="Local govt area" v={ctx?.lga ?? "—"} />
            <Reg k="Datum / zone" v={r.datum} mono />
            <Reg k="Centroid" v={r.coords} mono />
          </div>
          <div className="reg-list">
            <Reg k="Area" v={`${fmtHa(t.areaHa)} · ${fmtKm2(t.areaHa)}`} mono />
            <Reg k="Graticular blocks" v={`${t.blocks} blocks`} mono />
            <Reg k="Survey status" v={r.surveyStatus} />
            <Reg k="Granted" v={fmtDate(t.grantDate)} mono />
            <Reg k="Term start" v={fmtDate(t.startDate)} mono />
            <Reg k="Expiry" v={realExpiry ? <span style={{ color: expiryColor }}>{fmtDate(t.expiryDate)} ({expiryLabel(t.expiryDate)})</span> : <span className="faint">Not on register</span>} mono />
          </div>
        </div>
        {t.specialInterest && (
          <p className="prose" style={{ marginTop: "var(--sp-2)" }}><span className="eyebrow">Special interest:</span> {t.specialInterest}</p>
        )}
      </div>

      <div className="detail-section">
        <div className="detail-section-title"><Building2 size={13} className="dst-icon" /> Holder(s)</div>
        <div className="reg-list">
          <Reg k="Primary holder" v={`${t.holder} · ${t.holderType}`} />
          {t.holderAddress && <Reg k="Registered address" v={t.holderAddress} />}
          <Reg k="Parties on title" v={`${t.holders.length} · ${t.ownershipComplexity}`} />
        </div>
        {t.holders.length > 1 && (
          <ul className="mt-2" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {t.holders.map((h, i) => (
              <li key={i} className="prose" style={{ display: "flex", gap: 6 }}><span className="faint">{i + 1}.</span> {h}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="detail-section">
        <div className="detail-section-title"><Gavel size={13} className="dst-icon" /> Native title & heritage</div>
        {ctx ? (
          ctx.nativeTitle ? (
            <div className="reg-list">
              <Reg k="Native title" v={`${ctx.nativeTitle.name} (${ctx.nativeTitle.status})`} />
              {ctx.nativeTitle.reference && <Reg k="Reference" v={ctx.nativeTitle.reference} mono />}
            </div>
          ) : <p className="prose muted">No native-title determination or registered claim intersects this ground on the NNTT layer.</p>
        ) : <p className="prose muted">Resolving native-title layer…</p>}
        <p className="prose faint" style={{ fontSize: "var(--fs-10)", marginTop: "var(--sp-2)" }}>
          Native title, geology and mineral field are pulled live from government layers — see the Context tab.
        </p>
      </div>
    </>
  );
}
