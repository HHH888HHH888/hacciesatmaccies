import { useMemo, useState } from "react";
import { Download, Star, StarOff, Radio } from "lucide-react";
import { useStore } from "../lib/store";
import { getTenement } from "../lib/store";
import { downloadCsv, stamp } from "../lib/csv";
import { REGION_MAP } from "../lib/geo";
import { fmtHa, fmtMoneyM, fmtNum, expiryLabel, daysUntil, relTime } from "../lib/format";
import {
  ActionBadge,
  CommodityTag,
  EmptyState,
  KpiTile,
  ScoreChip,
  StatusBadge,
} from "../components/ui";
import type { Tenement } from "../lib/types";

type Sort = "score" | "expiry" | "activity" | "upside";
const SORTS: { id: Sort; label: string }[] = [
  { id: "score", label: "Highest score" },
  { id: "expiry", label: "Soonest expiry" },
  { id: "activity", label: "Newest activity" },
  { id: "upside", label: "Biggest upside" },
];

function upsideIndex(t: Tenement): number {
  const adj = t.factors.find((f) => f.key === "adjacency")?.value ?? 0;
  const exp = t.factors.find((f) => f.key === "expiry")?.value ?? 0;
  return Math.round(t.score * 0.45 + adj * 0.3 + exp * 0.25);
}

export function Watchlist() {
  const watchlist = useStore((s) => s.watchlist);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const select = useStore((s) => s.select);
  const alerts = useStore((s) => s.alerts);
  const [sort, setSort] = useState<Sort>("score");

  const items = useMemo(() => {
    const list = watchlist.map(getTenement).filter(Boolean) as Tenement[];
    const cmp: Record<Sort, (a: Tenement, b: Tenement) => number> = {
      score: (a, b) => b.score - a.score,
      expiry: (a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate),
      activity: (a, b) => +new Date(b.lastUpdated) - +new Date(a.lastUpdated),
      upside: (a, b) => upsideIndex(b) - upsideIndex(a),
    };
    return [...list].sort(cmp[sort]);
  }, [watchlist, sort]);

  const latestAlert = (id: string) => alerts.find((a) => a.tenementId === id);

  const roll = useMemo(() => ({
    count: items.length,
    ev: items.reduce((a, t) => a + t.econ.impliedEvMidM, 0),
    hold: items.reduce((a, t) => a + t.econ.holdingCostPa, 0),
    avg: items.length ? Math.round(items.reduce((a, t) => a + t.score, 0) / items.length) : 0,
    acquire: items.filter((t) => t.score >= 85).length,
  }), [items]);

  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>Watchlist</h1>
          <div className="sub">{items.length} tracked tenements · synced with map & alerts</div>
        </div>
        <div className="page-head-actions">
          {items.length > 0 && (
            <button className="btn" onClick={() => downloadCsv(`haxax-portfolio-${stamp()}.csv`, items)} title="Export portfolio to CSV">
              <Download size={14} /> Export
            </button>
          )}
          <div className="segmented">
            {SORTS.map((s) => (
              <button key={s.id} className={sort === s.id ? "is-active" : ""} onClick={() => setSort(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="page-body">
        {items.length === 0 ? (
          <EmptyState
            icon={<Star size={26} />}
            title="Your watchlist is empty"
            hint="Open the Ground Map or any tenement and tap the star to track it. Watchlisted ground stays synced with alerts and scoring."
          />
        ) : (
          <>
          <div className="grid-kpis" style={{ marginBottom: "var(--sp-4)" }}>
            <KpiTile label="Tracked" value={roll.count} sub={`${roll.acquire} acquire-grade`} />
            <KpiTile label="Portfolio implied EV" value={fmtMoneyM(roll.ev)} accent="var(--accent)" sub="sum of mid-case" />
            <KpiTile label="Holding cost p.a." value={`A$${fmtNum(roll.hold)}`} sub="rent + min. expenditure" />
            <KpiTile label="Mean Haxax" value={roll.avg} sub="portfolio average" />
          </div>
          <div className="card-grid">
            {items.map((t) => {
              const al = latestAlert(t.id);
              const days = daysUntil(t.expiryDate);
              return (
                <div key={t.id} className="tn-card" onClick={() => select(t.id)}>
                  <div className="tn-card-top">
                    <div>
                      <div className="tn-card-id">{t.id}</div>
                      <div className="tn-card-holder">{t.holder}</div>
                    </div>
                    <div className="col" style={{ alignItems: "flex-end", gap: 6 }}>
                      <ScoreChip score={t.score} size="md" />
                      <button
                        className="icon-btn"
                        style={{ width: 24, height: 24, color: "var(--amber)" }}
                        onClick={(e) => { e.stopPropagation(); toggleWatch(t.id); }}
                        title="Remove from watchlist"
                      >
                        <StarOff size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="tn-card-row">
                    <StatusBadge status={t.status} />
                    <ActionBadge action={t.action} />
                  </div>

                  <div className="tn-card-row">
                    <span>{REGION_MAP[t.regionId].name} · {t.district}</span>
                    <span className="mono">{fmtHa(t.areaHa)}</span>
                  </div>

                  <div className="tn-card-row">
                    <span>Expiry</span>
                    <span className="mono" style={{ color: days < 0 ? "var(--score-low)" : days < 365 ? "var(--score-mid)" : "var(--text-secondary)" }}>
                      {expiryLabel(t.expiryDate)}
                    </span>
                  </div>

                  <div className="row gap-2 wrap">
                    {t.commodities.map((c) => <CommodityTag key={c} c={c} />)}
                    {sort === "upside" && <span className="pill pill--accent">Upside {upsideIndex(t)}</span>}
                  </div>

                  {al && (
                    <div className="tn-card-alert">
                      <Radio size={12} style={{ color: "var(--score-mid)" }} />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{al.title}</span>
                      <span className="faint" style={{ fontSize: "var(--fs-10)" }}>{relTime(al.timestamp)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
