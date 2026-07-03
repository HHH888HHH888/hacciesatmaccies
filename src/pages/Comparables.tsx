import { useState } from "react";
import { useStore } from "../lib/store";
import { REGION_MAP } from "../lib/geo";
import { fmtDate, fmtHa, fmtMoneyM, fmtNum, fmtPerHa } from "../lib/format";
import { CommodityTag, KpiTile, Pill, ScoreChip, commodityVar } from "../components/ui";
import type { CompTxn } from "../lib/types";

export function Comparables() {
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const COMPS = useStore((s) => s.comps);
  const TENEMENTS = useStore((s) => s.tenements);
  const [hover, setHover] = useState<CompTxn | null>(null);

  const sorted = [...COMPS].sort((a, b) => b.evPerHa - a.evPerHa);
  const evs = COMPS.map((c) => c.evPerHa).sort((a, b) => a - b);
  const median = evs[Math.floor(evs.length / 2)];
  const totalM = COMPS.reduce((a, c) => a + c.considerationM, 0);

  const subject = (selectedId ? TENEMENTS.find((t) => t.id === selectedId) : undefined) ?? TENEMENTS[0];
  const subjectComps = COMPS.filter((c) => subject.comps.includes(c.id));
  const subjMean = subjectComps.reduce((a, c) => a + c.evPerHa, 0) / (subjectComps.length || 1);
  const impliedM = (subjMean * subject.areaHa) / 1_000_000;

  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>Comparables</h1>
          <div className="sub">{COMPS.length} WA tenement transactions · EV/ha benchmarking</div>
        </div>
      </div>

      <div className="page-body">
        <div className="grid-kpis" style={{ marginBottom: "var(--sp-4)" }}>
          <KpiTile label="Median EV / ha" value={fmtPerHa(median)} sub="across all deals" />
          <KpiTile label="Deals tracked" value={COMPS.length} sub="last 40 months" />
          <KpiTile label="Total consideration" value={fmtMoneyM(totalM)} sub="aggregate" />
          <KpiTile label="Richest deal" value={fmtPerHa(sorted[0].evPerHa)} accent="var(--accent)" sub={sorted[0].commodity} />
        </div>

        <div className="compare-grid" style={{ marginBottom: "var(--sp-4)" }}>
          {/* scatter */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">EV / ha vs ground size</span>
              <span className="muted" style={{ fontSize: "var(--fs-11)" }}>{hover ? hover.project : "hover a point"}</span>
            </div>
            <div className="card-body">
              <Scatter comps={COMPS} onHover={setHover} hover={hover} />
              <div className="row gap-3 wrap" style={{ marginTop: "var(--sp-3)" }}>
                {["Gold", "Lithium", "Nickel", "Rare Earths", "Copper"].map((c) => (
                  <span key={c} className="commodity-tag"><span className="commodity-swatch" style={{ background: commodityVar(c as any) }} />{c}</span>
                ))}
              </div>
            </div>
          </div>

          {/* compare subject */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">Subject vs comparables</span>
              <select
                className="input"
                style={{ width: 150 }}
                value={subject.id}
                onChange={(e) => select(e.target.value)}
              >
                {TENEMENTS.slice(0, 30).map((t) => (
                  <option key={t.id} value={t.id}>{t.id} · {t.commodities[0]}</option>
                ))}
              </select>
            </div>
            <div className="card-body">
              <div className="row between center mb-3">
                <div className="row center gap-2">
                  <ScoreChip score={subject.score} size="md" />
                  <div>
                    <div className="mono" style={{ fontWeight: 700 }}>{subject.id}</div>
                    <div className="muted" style={{ fontSize: "var(--fs-11)" }}>{REGION_MAP[subject.regionId].name} · {fmtHa(subject.areaHa)}</div>
                  </div>
                </div>
                <CommodityTag c={subject.commodities[0]} />
              </div>

              <div className="compare-metric"><span className="muted">Comparable mean EV/ha</span><span className="mono t-strong">{fmtPerHa(subjMean)}</span></div>
              <div className="compare-metric"><span className="muted">Implied value (±30%)</span><span className="mono" style={{ color: "var(--accent)", fontWeight: 700 }}>A${(impliedM * 0.7).toFixed(1)}–{(impliedM * 1.3).toFixed(1)}m</span></div>
              <div className="compare-metric"><span className="muted">Mid-point</span><span className="mono t-strong">{fmtMoneyM(impliedM)}</span></div>
              <div className="compare-metric"><span className="muted">vs market median</span>
                <Pill tone={subjMean >= median ? "pos" : "warn"}>{subjMean >= median ? "Premium" : "Discount"} {Math.round((subjMean / median - 1) * 100)}%</Pill>
              </div>
              <p className="prose faint" style={{ fontSize: "var(--fs-10)", marginTop: "var(--sp-3)" }}>
                Indicative placeholder valuation derived from {subjectComps.length} matched comparables. Not a formal valuation.
              </p>
            </div>
          </div>
        </div>

        {/* table */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-head"><span className="card-title">Comparable transactions</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Region</th>
                  <th>Commodity</th>
                  <th>Date</th>
                  <th className="num">Area</th>
                  <th className="num">Consideration</th>
                  <th className="num">EV / ha</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id}>
                    <td className="t-strong">{c.project}</td>
                    <td>{c.type}</td>
                    <td>{REGION_MAP[c.region].name}</td>
                    <td><CommodityTag c={c.commodity} /></td>
                    <td>{fmtDate(c.date)}</td>
                    <td className="num">{fmtNum(c.areaHa)} ha</td>
                    <td className="num">{fmtMoneyM(c.considerationM)}</td>
                    <td className="num t-strong">{fmtPerHa(c.evPerHa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Scatter({ comps, onHover, hover }: { comps: CompTxn[]; onHover: (c: CompTxn | null) => void; hover: CompTxn | null }) {
  const W = 600, H = 300, PAD = 44;
  const xs = comps.map((c) => Math.log10(c.areaHa));
  const ys = comps.map((c) => c.evPerHa);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymax = Math.max(...ys) * 1.1;
  const sx = (a: number) => PAD + ((Math.log10(a) - xmin) / (xmax - xmin || 1)) * (W - PAD - 14);
  const sy = (v: number) => H - PAD - (v / ymax) * (H - PAD - 14);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(ymax * f));
  const xTicksHa = [500, 2000, 8000, 25000];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {/* grid */}
      {yTicks.map((v, i) => (
        <g key={`y${i}`}>
          <line className="scatter-grid" x1={PAD} y1={sy(v)} x2={W - 14} y2={sy(v)} />
          <text className="axis-label" x={PAD - 6} y={sy(v) + 3} textAnchor="end">{v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}</text>
        </g>
      ))}
      {xTicksHa.map((v, i) => (
        <text key={`x${i}`} className="axis-label" x={sx(v)} y={H - PAD + 16} textAnchor="middle">{v >= 1000 ? `${v / 1000}k` : v}ha</text>
      ))}
      <line className="scatter-axis" x1={PAD} y1={H - PAD} x2={W - 14} y2={H - PAD} />
      <line className="scatter-axis" x1={PAD} y1={14} x2={PAD} y2={H - PAD} />
      <text className="axis-label" x={PAD} y={11} textAnchor="start">A$/ha</text>

      {comps.map((c) => {
        const active = hover?.id === c.id;
        return (
          <circle
            key={c.id}
            className="scatter-pt"
            cx={sx(c.areaHa)}
            cy={sy(c.evPerHa)}
            r={active ? 8 : 6}
            fill={commodityVar(c.commodity)}
            fillOpacity={active ? 1 : 0.78}
            onMouseEnter={() => onHover(c)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{c.project} · {fmtPerHa(c.evPerHa)}</title>
          </circle>
        );
      })}
    </svg>
  );
}
