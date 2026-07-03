import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Crosshair, Flame, Layers3, Map as MapIcon, ShieldAlert, TrendingUp } from "lucide-react";
import { useStore } from "../lib/store";
import { REGIONS, REGION_MAP } from "../lib/geo";
import { daysUntil, expiryLabel, fmtHa, fmtMoneyM, fmtNum, relTime } from "../lib/format";
import { useTick } from "../lib/hooks";
import { ActionBadge, CommodityTag, KpiTile, ScoreChip, SeverityDot, sevColor } from "../components/ui";
import type { DealStage, Tenement } from "../lib/types";

const STAGE_LABEL: Record<DealStage, string> = {
  lead: "New lead", reviewing: "Reviewing", contacted: "Contacted",
  diligence: "Due diligence", bid: "Bid planning", passed: "Passed",
};

function series(seed: number, n = 12) {
  const out: number[] = [];
  let v = 50 + (seed % 30);
  for (let i = 0; i < n; i++) { v += Math.sin(seed + i) * 7 + i * 1.2; out.push(Math.max(5, v)); }
  return out;
}

export function Overview() {
  const navigate = useNavigate();
  const select = useStore((s) => s.select);
  const toggleScan = useStore((s) => s.toggleScan);
  const alerts = useStore((s) => s.alerts);
  const watchlist = useStore((s) => s.watchlist);
  const deals = useStore((s) => s.deals);
  const tenements = useStore((s) => s.tenements);
  const stats = useStore((s) => s.stats);
  useTick(30000);

  const avg = useMemo(() => Math.round(tenements.reduce((a, t) => a + t.score, 0) / (tenements.length || 1)), [tenements]);
  const flipCount = useMemo(() => tenements.filter((t) => t.econ.play === "Flip").length, [tenements]);
  const expiring = useMemo(
    () => tenements.filter((t) => { const d = daysUntil(t.expiryDate); return d >= 0 && d < 545; }).sort((a, b) => b.score - a.score),
    [tenements],
  );
  const priority = useMemo(
    () => tenements.filter((t) => t.action === "Acquire" || t.action === "Investigate").slice(0, 8),
    [tenements],
  );
  const regionHeat = useMemo(() => {
    const m: Record<string, { sum: number; n: number }> = {};
    tenements.forEach((t) => { (m[t.regionId] ??= { sum: 0, n: 0 }); m[t.regionId].sum += t.score; m[t.regionId].n += 1; });
    return REGIONS.map((r) => ({ id: r.id, name: r.name, avg: Math.round((m[r.id]?.sum ?? 0) / (m[r.id]?.n || 1)), n: m[r.id]?.n ?? 0 }))
      .filter((r) => r.n > 0).sort((a, b) => b.avg - a.avg);
  }, [tenements]);
  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(deals).forEach((s) => { if (s) counts[s] = (counts[s] ?? 0) + 1; });
    return counts;
  }, [deals]);

  const unread = alerts.filter((a) => !a.read).length;

  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>Acquisition desk</h1>
          <div className="sub">
            {fmtNum(stats.tenements)} tenements under coverage · {regionHeat.length} districts · {stats.highScore} acquire-grade · synced {relTime(new Date(Date.now() - 120000).toISOString())}
          </div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={() => { toggleScan(); navigate("/map"); }}><Crosshair size={14} /> Run scan</button>
          <button className="btn btn--primary" onClick={() => navigate("/map")}><MapIcon size={14} /> Open Ground Map</button>
        </div>
      </div>

      <div className="page-body">
        <div className="grid-kpis">
          <KpiTile label="Acquire-grade (85+)" value={stats.highScore} accent="var(--score-high)" sub="screen as Acquire" delta={{ value: "+2 wk", dir: "up" }} spark={series(7)} />
          <KpiTile label="Flip candidates" value={flipCount} accent="var(--accent)" sub="buy-low / on-sell" delta={{ value: "+3", dir: "up" }} spark={series(4)} />
          <KpiTile label="Expiring < 18 mo" value={expiring.length} accent="var(--score-mid)" sub="acquisition windows" delta={{ value: "live", dir: "flat" }} />
          <KpiTile label="Mean Haxax" value={avg} sub="portfolio average" delta={{ value: "+1.4", dir: "up" }} spark={series(11)} />
          <KpiTile label="Ground coverage" value={fmtHa(stats.totalAreaHa)} sub="graticular area" />
          <KpiTile label="Open alerts" value={unread} accent={unread ? "var(--score-mid)" : undefined} sub={`${alerts.length} total`} delta={{ value: "live", dir: "up" }} />
        </div>

        <div className="dash-grid">
          {/* priority targets table */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="card-head">
              <span className="card-title"><span className="ct-icon"><TrendingUp size={15} /></span> Priority targets</span>
              <button className="btn btn--ghost btn--sm" onClick={() => navigate("/map")}>Open register</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Score</th><th>Tenement</th><th>Holder</th><th>Region</th><th>Comm.</th>
                    <th className="num">Implied EV</th><th className="num">Flip Δ</th><th>Call</th>
                  </tr>
                </thead>
                <tbody>
                  {priority.map((t) => (
                    <tr key={t.id} className="row-click" onClick={() => select(t.id)}>
                      <td className="tight"><ScoreChip score={t.score} size="sm" /></td>
                      <td className="tight"><span className="mono t-strong">{t.id}</span></td>
                      <td className="tight t-strong">{t.holder}</td>
                      <td className="tight">{REGION_MAP[t.regionId].name}</td>
                      <td className="tight"><CommodityTag c={t.commodities[0]} dot /></td>
                      <td className="tight num t-strong">{fmtMoneyM(t.econ.impliedEvMidM)}</td>
                      <td className="tight num" style={{ color: t.econ.upliftPct >= 40 ? "var(--score-high)" : "var(--text-secondary)" }}>+{t.econ.upliftPct}%</td>
                      <td className="tight"><ActionBadge action={t.action} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* right column */}
          <div className="col gap-4">
            <div className="card">
              <div className="card-head"><span className="card-title"><span className="ct-icon"><Flame size={15} /></span> District heat</span></div>
              <div className="card-body">
                {regionHeat.slice(0, 7).map((r) => (
                  <div className="heat-row" key={r.id}>
                    <span className="heat-name">{r.name}</span>
                    <div className="heat-track"><div className="heat-fill" style={{ width: `${r.avg}%` }} /></div>
                    <span className="heat-val">{r.avg}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <span className="card-title"><span className="ct-icon"><ShieldAlert size={15} /></span> Recent alerts</span>
                <button className="btn btn--ghost btn--sm" onClick={() => navigate("/alerts")}>All</button>
              </div>
              <div className="list-rows">
                {alerts.slice(0, 4).map((a) => (
                  <div className="list-row" key={a.id} onClick={() => select(a.tenementId)} role="button" tabIndex={0}>
                    <SeverityDot sev={a.severity} />
                    <div className="lr-main">
                      <div className="lr-holder" style={{ fontSize: "var(--fs-12)" }}>{a.title}</div>
                      <div className="lr-sub">{relTime(a.timestamp)}</div>
                    </div>
                    <span className="mono" style={{ fontSize: "var(--fs-11)", color: sevColor(a.severity) }}>{a.severity}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* expiring acquisition windows */}
        <div className="card" style={{ marginTop: "var(--sp-4)", overflow: "hidden" }}>
          <div className="card-head">
            <span className="card-title"><span className="ct-icon"><Crosshair size={15} /></span> Expiring acquisition windows</span>
            <span className="muted" style={{ fontSize: "var(--fs-11)" }}>{expiring.length} within 18 months · near-term leverage</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Score</th><th>Tenement</th><th>Holder</th><th>Region</th>
                  <th className="num">Expiry</th><th className="num">Holding cost</th><th className="num">Implied EV</th><th>Call</th>
                </tr>
              </thead>
              <tbody>
                {expiring.slice(0, 7).map((t) => (
                  <tr key={t.id} className="row-click" onClick={() => select(t.id)}>
                    <td className="tight"><ScoreChip score={t.score} size="sm" /></td>
                    <td className="tight"><span className="mono t-strong">{t.id}</span></td>
                    <td className="tight">{t.holder}</td>
                    <td className="tight">{REGION_MAP[t.regionId].name}</td>
                    <td className="tight num" style={{ color: "var(--score-mid)" }}>{expiryLabel(t.expiryDate)}</td>
                    <td className="tight num">A${fmtNum(t.econ.holdingCostPa)}</td>
                    <td className="tight num t-strong">{fmtMoneyM(t.econ.impliedEvMidM)}</td>
                    <td className="tight"><ActionBadge action={t.action} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* pipeline snapshot */}
        <div className="card" style={{ marginTop: "var(--sp-4)" }}>
          <div className="card-head">
            <span className="card-title"><span className="ct-icon"><Layers3 size={15} /></span> Deal pipeline</span>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate("/deals")}>Open board</button>
          </div>
          <div className="card-body">
            <div className="row gap-3 wrap">
              {(Object.keys(STAGE_LABEL) as DealStage[]).map((st) => (
                <div key={st} className="kpi-tile" style={{ flex: "1 1 130px", padding: "var(--sp-3)" }}>
                  <span className="eyebrow">{STAGE_LABEL[st]}</span>
                  <span className="mono" style={{ fontSize: "var(--fs-22)", fontWeight: 700 }}>{pipeline[st] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
