import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Banknote,
  CalendarClock,
  Crosshair,
  FileText,
  Gavel,
  Layers,
  Locate,
  Mountain,
  Network,
  Receipt,
  ScrollText,
  ShieldAlert,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { useStore } from "../lib/store";
import { REGION_MAP } from "../lib/geo";
import { daysUntil, fmtDate, fmtHa, fmtKm2, fmtMoneyM, fmtNum, fmtPerHa, expiryLabel, relTime } from "../lib/format";
import { bandColor } from "../lib/scoring";
import type { AIOpinion, SuggestedAction, Tenement } from "../lib/types";
import {
  ActionBadge,
  CommodityTag,
  Pill,
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

type Tab = "brief" | "econ" | "score" | "tenure" | "activity";
const TABS: { id: Tab; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "econ", label: "Economics" },
  { id: "score", label: "Score" },
  { id: "tenure", label: "Tenure" },
  { id: "activity", label: "Activity" },
];

const actionColor = (a: SuggestedAction) =>
  a === "Acquire" ? "var(--score-high)" : a === "Investigate" ? "var(--info)" : a === "Monitor" ? "var(--score-mid)" : "var(--score-low)";

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
  useEffect(() => {
    setNeighbours(null);
    if (!t) return;
    let cancelled = false;
    fetch(`/api/neighbours?lng=${t.lng}&lat=${t.lat}&id=${encodeURIComponent(t.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setNeighbours(d); })
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
                    {t.licenceType} · {t.register.mineralField} · {REGION_MAP[t.regionId].name}
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

            {/* decision strip — the buy / flip / monitor / avoid call */}
            <div className="decision-strip" style={{ ["--dc" as string]: actionColor(t.action) } as React.CSSProperties}>
              <div>
                <div className="decision-word">{t.action.toUpperCase()}</div>
                <div className="decision-sub">
                  Play: {t.econ.play} · conviction {t.ai.confidence}% · {t.riskFlags.length} risk flag{t.riskFlags.length === 1 ? "" : "s"}
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
              {tab === "econ" && <EconTab t={t} />}
              {tab === "score" && <ScoreTab t={t} />}
              {tab === "tenure" && <TenureTab t={t} />}
              {tab === "activity" && (
                <div className="detail-section">
                  <div className="detail-section-title"><CalendarClock size={13} className="dst-icon" /> Event history</div>
                  <TenementTimeline events={t.timeline} />
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
                Updated {relTime(t.lastUpdated)} · DMIRS / SLIP register · MINEDEX · GeoVIEW.WA
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
        <div className="detail-section-title"><Mountain size={13} className="dst-icon" /> Nearby mines & deposits</div>
        <div className="mini-list">
          {t.nearbyMines.map((m, i) => (
            <div className="mini-row" key={i}>
              <span className="mr-main">{m.name}</span>
              <CommodityTag c={m.commodity} dot />
              <span className="mr-meta">{m.distanceKm} km · {m.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="detail-section">
        <div className="detail-section-title"><Layers size={13} className="dst-icon" /> Geology & history</div>
        <p className="prose">{t.geologySummary}</p>
        <p className="prose" style={{ marginTop: "var(--sp-2)" }}>{t.historicalActivity}</p>
        <p className="prose" style={{ marginTop: "var(--sp-2)" }}>{t.strategicNotes}</p>
      </div>
      {t.target && (
        <div className="detail-section">
          <div className="detail-section-title"><Crosshair size={13} className="dst-icon" /> AI prospectivity targeting</div>
          <div className="row center gap-3" style={{ marginBottom: "var(--sp-2)" }}>
            <span className="mono" style={{ fontSize: "var(--fs-22)", fontWeight: 800, color: t.target.score >= 75 ? "var(--score-high)" : t.target.score >= 62 ? "var(--accent)" : "var(--text-secondary)" }}>
              {t.target.score}<span className="faint" style={{ fontSize: "var(--fs-11)" }}>/100</span>
            </span>
            <div className="muted" style={{ fontSize: "var(--fs-11)" }}>
              Target score · {t.target.endowment} recorded deposits within 25 km · nearest {t.target.nearestKm} km
            </div>
          </div>
          <p className="prose">{t.target.rationale}</p>
          {t.target.analogs.length > 0 && (
            <div className="row gap-2 wrap" style={{ marginTop: "var(--sp-2)" }}>
              {t.target.analogs.map((a) => <span key={a} className="acquirer-chip">{a}</span>)}
            </div>
          )}
          <p className="prose faint" style={{ fontSize: "var(--fs-10)", marginTop: "var(--sp-2)" }}>
            Analog / nearology lead derived from nearby MINEDEX deposits — a prospectivity signal, not a confirmed deposit.
          </p>
        </div>
      )}
      <div className="detail-section">
        <div className="detail-section-title"><ShieldAlert size={13} className="dst-icon" /> Risk flags</div>
        {t.riskFlags.length ? (
          <div className="flag-wrap">
            {t.riskFlags.map((r, i) => <RiskBadge key={i} level={r.level} label={r.label} />)}
          </div>
        ) : <p className="prose">No material risk flags on record — clean profile.</p>}
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

/* ---------- Economics ---------- */
function EconTab({ t }: { t: Tenement }) {
  const e = t.econ;
  const allComps = useStore((s) => s.comps);
  const comps = allComps.filter((c) => t.comps.includes(c.id));
  return (
    <>
      <div className="detail-section">
        <div className="detail-section-title"><TrendingUp size={13} className="dst-icon" /> Acquisition thesis · {e.play}</div>
        <div className="econ-hero">
          <div>
            <span className="eyebrow">Implied value (comparables)</span>
            <div className="eh-val" style={{ color: "var(--accent)" }}>A${e.impliedEvLowM.toFixed(1)}–{e.impliedEvHighM.toFixed(1)}m</div>
          </div>
          <div className="text-right">
            <span className="eyebrow">EV / ha</span>
            <div className="mono" style={{ fontSize: "var(--fs-14)", fontWeight: 700 }}>{fmtPerHa(e.evPerHa)}</div>
          </div>
        </div>

        <div className="econ-grid">
          <div className="econ-cell">
            <span className="eyebrow">Est. acquisition cost</span>
            <span className="ev">{fmtMoneyM(e.acqCostM)}</span>
          </div>
          <div className="econ-cell">
            <span className="eyebrow">Recommended max bid</span>
            <span className="ev">{fmtMoneyM(e.maxBidM)}</span>
          </div>
          <div className="econ-cell">
            <span className="eyebrow">Flip uplift (mid)</span>
            <span className="ev" style={{ color: e.upliftPct >= 40 ? "var(--score-high)" : "var(--text-primary)" }}>+{e.upliftPct}%</span>
          </div>
          <div className="econ-cell">
            <span className="eyebrow">Holding cost p.a.</span>
            <span className="ev">A${fmtNum(e.holdingCostPa)}</span>
          </div>
        </div>

        <div className="ai-thesis" style={{ marginTop: "var(--sp-3)" }}>{e.flipThesis}</div>

        <div style={{ marginTop: "var(--sp-3)" }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>Likely strategic acquirers</span>
          <div className="row gap-2 wrap">
            {e.acquirers.map((a) => <span key={a} className="acquirer-chip"><Banknote size={11} /> {a}</span>)}
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-title">Comparable transactions</div>
        <div className="mini-list">
          {comps.map((c) => (
            <div className="mini-row" key={c.id} style={{ flexWrap: "wrap" }}>
              <span className="mr-main">{c.project}</span>
              <span className="mr-meta">{c.type}</span>
              <div style={{ flexBasis: "100%", display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span className="faint" style={{ fontSize: "var(--fs-11)" }}>{fmtDate(c.date)} · {fmtHa(c.areaHa)}</span>
                <span className="mono secondary" style={{ fontSize: "var(--fs-11)" }}>{fmtPerHa(c.evPerHa)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------- Score ---------- */
function ScoreTab({ t }: { t: Tenement }) {
  return (
    <div className="detail-section">
      <div className="row center gap-4" style={{ marginBottom: "var(--sp-3)" }}>
        <RadialScore score={t.score} size={88} label="HAXAX" />
        <div>
          <div className="ai-verdict-label" style={{ fontSize: "var(--fs-14)" }}>
            {t.score >= 85 ? "Top-decile opportunity" : t.score >= 60 ? "Mid-band — selective" : "Below acquisition threshold"}
          </div>
          <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 4 }}>
            Ranks <strong style={{ color: "var(--text-primary)" }}>P{t.scorePercentile}</strong> of {REGION_MAP[t.regionId].name}. Transparent weighted model — every factor reconciles to the headline.
          </div>
        </div>
      </div>
      <ScoreBreakdown t={t} defaultOpen />
    </div>
  );
}

/* ---------- Tenure (register) ---------- */
function TenureTab({ t }: { t: Tenement }) {
  const r = t.register;
  const days = daysUntil(t.expiryDate);
  const expiryColor = days < 0 ? "var(--score-low)" : days < 365 ? "var(--score-mid)" : "var(--text-primary)";
  return (
    <>
      <div className="detail-section">
        <div className="detail-section-title"><ScrollText size={13} className="dst-icon" /> Tenure register</div>
        <div className="reg-cols">
          <div className="reg-list">
            <Reg k="Tenement ID" v={t.id} mono />
            <Reg k="Licence type" v={t.licenceType} />
            <Reg k="Status" v={<StatusBadge status={t.status} />} />
            <Reg k="Mineral field" v={r.mineralField} />
            <Reg k="Local govt area" v={r.lga} />
            <Reg k="1:250k sheet" v={r.mapSheet} mono />
            <Reg k="Datum / zone" v={r.datum} mono />
            <Reg k="Centroid" v={r.coords} mono />
          </div>
          <div className="reg-list">
            <Reg k="Area" v={`${fmtHa(t.areaHa)} · ${fmtKm2(t.areaHa)}`} mono />
            <Reg k="Graticular blocks" v={`${t.blocks} blocks`} mono />
            <Reg k="Survey" v={r.survey} />
            <Reg k="Applied" v={fmtDate(r.applicationDate)} mono />
            <Reg k="Granted" v={fmtDate(t.grantDate)} mono />
            <Reg k="Expiry" v={<span style={{ color: expiryColor }}>{fmtDate(t.expiryDate)} ({expiryLabel(t.expiryDate)})</span>} mono />
            <Reg k="Last dealing" v={`${r.lastDealing.type}`} />
            <Reg k="Dealing date" v={fmtDate(r.lastDealing.date)} mono />
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-title"><Receipt size={13} className="dst-icon" /> Rent & expenditure</div>
        <div className="reg-cols">
          <div className="reg-list">
            <Reg k="Annual rent" v={`A$${fmtNum(r.rentPerYear)}`} mono />
            <Reg k="Min. expenditure p.a." v={`A$${fmtNum(r.minExpenditure)}`} mono />
          </div>
          <div className="reg-list">
            <Reg k="Expenditure to date" v={`A$${fmtNum(r.expenditureToDate)}`} mono />
            <Reg k="Combined reporting" v={r.combinedReporting ? "Yes — group" : "No"} />
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-title"><Gavel size={13} className="dst-icon" /> Title, native title & heritage</div>
        <div className="reg-list">
          <Reg k="Holder" v={`${t.holder} · ${t.holderType}`} />
          <Reg k="Ownership" v={t.ownershipComplexity} />
          <Reg k="Native title" v={r.nativeTitle} />
          <Reg k="Heritage" v={r.heritage} />
        </div>
        {t.encumbrances.length > 0 && (
          <div style={{ marginTop: "var(--sp-3)" }}>
            <span className="eyebrow">Encumbrances</span>
            <ul className="mt-2" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {t.encumbrances.map((e, i) => (
                <li key={i} className="prose" style={{ display: "flex", gap: 6 }}><span className="faint">›</span> {e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
