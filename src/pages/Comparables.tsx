import { useMemo } from "react";
import { useStore } from "../lib/store";
import { REGION_MAP } from "../lib/geo";
import { fmtHa, fmtNum } from "../lib/format";
import { CommodityTag, KpiTile, Pill, ScoreChip } from "../components/ui";
import { expiryLabel } from "../lib/format";
import type { Tenement } from "../lib/types";

/** Peer comparison — a subject tenement against real register peers that share its
 *  primary commodity or region. Every column is a live DMIRS/MINEDEX fact. */
export function Comparables() {
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const tenements = useStore((s) => s.tenements);

  const subject = (selectedId ? tenements.find((t) => t.id === selectedId) : undefined) ?? tenements[0];

  const peers = useMemo(() => {
    if (!subject) return [] as Tenement[];
    const c = subject.commodities[0];
    return tenements
      .filter((t) => t.id !== subject.id && (t.commodities[0] === c || t.regionId === subject.regionId))
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
  }, [tenements, subject]);

  if (!subject) return <div className="page-scroll"><div className="page-body">No tenements loaded.</div></div>;

  const med = (arr: number[]) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : 0);
  const medScore = med(peers.map((p) => p.score));
  const medEndow = med(peers.map((p) => p.endowment));
  const medArea = med(peers.map((p) => p.areaHa));

  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>Peers</h1>
          <div className="sub">Real register peers by commodity &amp; region · no valuation, live facts only</div>
        </div>
        <select className="input" style={{ width: 190 }} value={subject.id} onChange={(e) => select(e.target.value)}>
          {tenements.slice(0, 60).map((t) => (
            <option key={t.id} value={t.id}>{t.id} · {t.commodities[0]}</option>
          ))}
        </select>
      </div>

      <div className="page-body">
        <div className="grid-kpis" style={{ marginBottom: "var(--sp-4)" }}>
          <KpiTile label="Peers matched" value={peers.length} sub={`${subject.commodities[0]} · ${REGION_MAP[subject.regionId].name}`} />
          <KpiTile label="Subject indicator" value={subject.score} accent="var(--accent)" sub={`peer median ${medScore}`} />
          <KpiTile label="Deposits ≤25km" value={subject.endowment} sub={`peer median ${medEndow}`} />
          <KpiTile label="Area" value={fmtHa(subject.areaHa)} sub={`peer median ${fmtHa(medArea)}`} />
        </div>

        <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
          <div className="card-head"><span className="card-title">Subject vs peer median</span></div>
          <div className="card-body">
            <div className="row center gap-2 mb-3">
              <ScoreChip score={subject.score} size="md" />
              <div>
                <div className="mono" style={{ fontWeight: 700 }}>{subject.id}</div>
                <div className="muted" style={{ fontSize: "var(--fs-11)" }}>{subject.holder} · {REGION_MAP[subject.regionId].name}</div>
              </div>
              <span style={{ marginLeft: "auto" }}><CommodityTag c={subject.commodities[0]} /></span>
            </div>
            <div className="compare-metric"><span className="muted">Haxax indicator</span><Pill tone={subject.score >= medScore ? "pos" : "warn"}>{subject.score >= medScore ? "Above" : "Below"} peer median ({medScore})</Pill></div>
            <div className="compare-metric"><span className="muted">Endowment (deposits ≤25km)</span><Pill tone={subject.endowment >= medEndow ? "pos" : "warn"}>{subject.endowment} vs {medEndow}</Pill></div>
            <div className="compare-metric"><span className="muted">Drill collars ≤10km</span><span className="mono t-strong">{fmtNum(subject.drillHolesNearby)}</span></div>
            <p className="prose faint" style={{ fontSize: "var(--fs-10)", marginTop: "var(--sp-3)" }}>
              Peers are live tenements sharing the subject's inferred commodity or region. No sale price or valuation is shown — the public register carries none.
            </p>
          </div>
        </div>

        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-head"><span className="card-title">Peer tenements · {peers.length}</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Score</th><th>Tenement</th><th>Holder</th><th>Region</th><th>Commodity</th>
                  <th className="num">Area</th><th className="num">Deposits ≤25km</th><th className="num">Drill ≤10km</th><th>Expiry</th><th>Screen</th>
                </tr>
              </thead>
              <tbody>
                {peers.map((t) => (
                  <tr key={t.id} className="row-click" onClick={() => select(t.id)}>
                    <td><ScoreChip score={t.score} size="sm" /></td>
                    <td className="mono t-strong">{t.id}</td>
                    <td>{t.holder}</td>
                    <td>{REGION_MAP[t.regionId].name}</td>
                    <td><CommodityTag c={t.commodities[0]} /></td>
                    <td className="num">{fmtHa(t.areaHa)}</td>
                    <td className="num t-strong">{t.endowment}</td>
                    <td className="num">{fmtNum(t.drillHolesNearby)}</td>
                    <td>{new Date(t.expiryDate).getFullYear() > 1971 ? expiryLabel(t.expiryDate) : "—"}</td>
                    <td>{t.action}</td>
                  </tr>
                ))}
                {peers.length === 0 && <tr><td colSpan={10} className="muted" style={{ textAlign: "center", padding: "var(--sp-5)" }}>No peers match.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
