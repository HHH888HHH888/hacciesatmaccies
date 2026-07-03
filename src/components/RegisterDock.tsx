import { useMemo, useState } from "react";
import { ChevronDown, Download, Table2 } from "lucide-react";
import type { Tenement } from "../lib/types";
import { useStore } from "../lib/store";
import { downloadCsv, stamp } from "../lib/csv";
import { REGION_MAP } from "../lib/geo";
import { daysUntil, expiryLabel, fmtMoneyM, fmtNum } from "../lib/format";
import { ActionBadge, CommodityTag, ScoreChip } from "./ui";

type Key =
  | "score" | "opp" | "id" | "holder" | "licenceType" | "status" | "region"
  | "commodity" | "areaHa" | "expiry" | "rent" | "ev" | "uplift" | "action";

interface Col {
  key: Key;
  label: string;
  num?: boolean;
  sortVal: (t: Tenement) => number | string;
  render: (t: Tenement) => React.ReactNode;
}

const COLS: Col[] = [
  { key: "score", label: "Score", sortVal: (t) => t.score, render: (t) => <ScoreChip score={t.score} size="sm" /> },
  { key: "opp", label: "Opp", num: true, sortVal: (t) => t.opportunity?.score ?? 0, render: (t) => t.opportunity ? <span className="mono" style={{ fontWeight: 700, color: t.opportunity.score >= 70 ? "var(--accent)" : "var(--text-secondary)" }}>{t.opportunity.score}</span> : <span className="faint">—</span> },
  { key: "id", label: "Tenement", sortVal: (t) => t.id, render: (t) => <span className="mono t-strong">{t.id}</span> },
  { key: "holder", label: "Holder", sortVal: (t) => t.holder, render: (t) => <span className="t-strong">{t.holder}</span> },
  { key: "licenceType", label: "Type", sortVal: (t) => t.licenceType, render: (t) => t.licenceType },
  { key: "status", label: "Status", sortVal: (t) => t.status, render: (t) => t.status },
  { key: "region", label: "Region", sortVal: (t) => REGION_MAP[t.regionId].name, render: (t) => REGION_MAP[t.regionId].name },
  { key: "commodity", label: "Commodity", sortVal: (t) => t.commodities[0], render: (t) => <CommodityTag c={t.commodities[0]} dot /> },
  { key: "areaHa", label: "Area (ha)", num: true, sortVal: (t) => t.areaHa, render: (t) => fmtNum(t.areaHa) },
  { key: "expiry", label: "Expiry", num: true, sortVal: (t) => daysUntil(t.expiryDate), render: (t) => {
      const d = daysUntil(t.expiryDate);
      return <span style={{ color: d < 0 ? "var(--score-low)" : d < 365 ? "var(--score-mid)" : "var(--text-secondary)" }}>{expiryLabel(t.expiryDate)}</span>;
    } },
  { key: "rent", label: "Rent p.a.", num: true, sortVal: (t) => t.register.rentPerYear, render: (t) => `A$${fmtNum(t.register.rentPerYear)}` },
  { key: "ev", label: "Implied EV", num: true, sortVal: (t) => t.econ.impliedEvMidM, render: (t) => <span className="t-strong">{fmtMoneyM(t.econ.impliedEvMidM)}</span> },
  { key: "uplift", label: "Flip Δ", num: true, sortVal: (t) => t.econ.upliftPct, render: (t) => <span style={{ color: t.econ.upliftPct >= 40 ? "var(--score-high)" : "var(--text-secondary)" }}>+{t.econ.upliftPct}%</span> },
  { key: "action", label: "Call", sortVal: (t) => t.action, render: (t) => <ActionBadge action={t.action} /> },
];

export function RegisterDock({ tenements }: { tenements: Tenement[] }) {
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const [collapsed, setCollapsed] = useState(true);
  const [sortKey, setSortKey] = useState<Key>("score");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const col = COLS.find((c) => c.key === sortKey)!;
    const sorted = [...tenements].sort((a, b) => {
      const va = col.sortVal(a), vb = col.sortVal(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [tenements, sortKey, dir]);

  const setSort = (k: Key) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setDir(k === "id" || k === "holder" || k === "region" ? "asc" : "desc"); }
  };

  return (
    <div className={`register-dock ${collapsed ? "is-collapsed" : ""}`}>
      <div className="register-dock-head" onClick={() => setCollapsed((v) => !v)}>
        <div className="rdh-left">
          <span className="eyebrow row center gap-2" style={{ color: "var(--text-secondary)" }}>
            <Table2 size={13} /> Tenement register
          </span>
          <span className="mono faint" style={{ fontSize: "var(--fs-11)" }}>{tenements.length} records · sorted by {COLS.find((c) => c.key === sortKey)!.label} {dir === "desc" ? "↓" : "↑"}</span>
        </div>
        <div className="row center gap-2">
          <button
            className="btn btn--sm"
            onClick={(e) => { e.stopPropagation(); downloadCsv(`haxax-register-${stamp()}.csv`, tenements); }}
            title="Export the filtered register to CSV"
          >
            <Download size={13} /> Export CSV
          </button>
          <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label={collapsed ? "Expand register" : "Collapse register"}>
            <ChevronDown size={15} style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform var(--t-fast)" }} />
          </button>
        </div>
      </div>
      <div className="register-dock-body">
        <table className="data-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={`sortable ${c.num ? "num" : ""}`}
                  onClick={() => setSort(c.key)}
                >
                  {c.label}
                  {sortKey === c.key && <span className="th-sort">{dir === "desc" ? "↓" : "↑"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr
                key={t.id}
                className={`row-click ${selectedId === t.id ? "is-selected" : ""}`}
                onClick={() => select(t.id)}
              >
                {COLS.map((c) => (
                  <td key={c.key} className={`tight ${c.num ? "num" : ""}`}>{c.render(t)}</td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={COLS.length} className="tight muted" style={{ textAlign: "center", padding: "var(--sp-5)" }}>No tenements match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
