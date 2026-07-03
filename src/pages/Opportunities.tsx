import { useMemo } from "react";
import { Crosshair, Download } from "lucide-react";
import { useStore } from "../lib/store";
import { REGION_MAP } from "../lib/geo";
import { fmtMoneyM, expiryLabel } from "../lib/format";
import { downloadCsv, stamp } from "../lib/csv";
import { ActionBadge, CommodityTag, EmptyState, KpiTile, ScoreChip } from "../components/ui";

const oppColor = (s: number) => (s >= 70 ? "var(--accent)" : s >= 50 ? "var(--score-mid)" : "var(--text-muted)");

export function Opportunities() {
  const tenements = useStore((s) => s.tenements);
  const select = useStore((s) => s.select);

  const ranked = useMemo(
    () => tenements.filter((t) => t.opportunity).sort((a, b) => (b.opportunity!.score) - (a.opportunity!.score)),
    [tenements],
  );
  const top = ranked.slice(0, 60);
  const hot = ranked.filter((t) => (t.opportunity!.score) >= 70).length;
  const nearExpiry = ranked.filter((t) => (t.opportunity!.signals.some((s) => /expir/i.test(s)))).length;
  const undervalued = ranked.filter((t) => (t.opportunity!.signals.some((s) => /Undervalued/i.test(s)))).length;

  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>Opportunity Radar</h1>
          <div className="sub">
            The mission, ranked — overlooked, near-expiry &amp; old-but-still-resourced ground across the live register. {ranked.length} scored.
          </div>
        </div>
        <div className="page-head-actions">
          {ranked.length > 0 && (
            <button className="btn" onClick={() => downloadCsv(`haxax-opportunities-${stamp()}.csv`, top)} title="Export to CSV">
              <Download size={14} /> Export
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {ranked.length === 0 ? (
          <EmptyState
            icon={<Crosshair size={26} />}
            title="Opportunity radar needs the live register"
            hint="The mission score is computed from live DMIRS/SLIP tenure + MINEDEX endowment. It populates once the live data is connected."
          />
        ) : (
          <>
            <div className="grid-kpis" style={{ marginBottom: "var(--sp-4)" }}>
              <KpiTile label="High-opportunity (70+)" value={hot} accent="var(--accent)" sub="priority pursue" />
              <KpiTile label="Near-expiry leverage" value={nearExpiry} accent="var(--score-mid)" sub="acquisition windows" />
              <KpiTile label="Undervalued (flip)" value={undervalued} sub="buy-low candidates" />
              <KpiTile label="On the radar" value={ranked.length} sub="scored tenements" />
            </div>

            <div className="card" style={{ overflow: "hidden" }}>
              <div className="card-head">
                <span className="card-title"><span className="ct-icon"><Crosshair size={15} /></span> Ranked opportunities</span>
                <span className="muted" style={{ fontSize: "var(--fs-11)" }}>old + near-expiry + undervalued + still-resourced</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="num">Opp</th><th>Score</th><th>Tenement</th><th>Holder</th><th>Region</th>
                      <th>Signals</th><th className="num">Expiry</th><th className="num">Implied EV</th><th>Call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((t) => (
                      <tr key={t.id} className="row-click" onClick={() => select(t.id)}>
                        <td className="tight num">
                          <span className="mono" style={{ fontWeight: 800, fontSize: "var(--fs-14)", color: oppColor(t.opportunity!.score) }}>
                            {t.opportunity!.score}
                          </span>
                        </td>
                        <td className="tight"><ScoreChip score={t.score} size="sm" /></td>
                        <td className="tight"><span className="mono t-strong">{t.id}</span></td>
                        <td className="tight">{t.holder}</td>
                        <td className="tight">{REGION_MAP[t.regionId].name}</td>
                        <td className="tight">
                          <span className="row gap-1 wrap">
                            {t.opportunity!.signals.map((s) => <span key={s} className="opp-sig">{s}</span>)}
                            <CommodityTag c={t.commodities[0]} dot />
                          </span>
                        </td>
                        <td className="tight num" style={{ color: "var(--score-mid)" }}>{expiryLabel(t.expiryDate)}</td>
                        <td className="tight num t-strong">{fmtMoneyM(t.econ.impliedEvMidM)}</td>
                        <td className="tight"><ActionBadge action={t.action} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
