/* ============================================================
   HAXAX — shared UI primitives
   ============================================================ */

import type { ReactNode } from "react";
import type {
  AlertSeverity,
  Commodity,
  RiskLevel,
  SuggestedAction,
  TenementStatus,
} from "../lib/types";
import { band, bandColor, bandSoft } from "../lib/scoring";

/* ---------- commodity colour ---------- */
const COMMODITY_VAR: Record<Commodity, string> = {
  Gold: "--c-gold",
  Lithium: "--c-lithium",
  "Iron Ore": "--c-iron",
  Nickel: "--c-nickel",
  "Rare Earths": "--c-ree",
  Copper: "--c-copper",
  Cobalt: "--c-cobalt",
  Manganese: "--c-gold",
};
const COMMODITY_ABBR: Record<Commodity, string> = {
  Gold: "Au",
  Lithium: "Li",
  "Iron Ore": "Fe",
  Nickel: "Ni",
  "Rare Earths": "REE",
  Copper: "Cu",
  Cobalt: "Co",
  Manganese: "Mn",
};
export const commodityVar = (c: Commodity) => `var(${COMMODITY_VAR[c]})`;
export const commodityAbbr = (c: Commodity) => COMMODITY_ABBR[c];

export function CommodityTag({ c, dot }: { c: Commodity; dot?: boolean }) {
  return (
    <span className="commodity-tag" title={c}>
      <span className="commodity-swatch" style={{ background: commodityVar(c) }} />
      {dot ? COMMODITY_ABBR[c] : c}
    </span>
  );
}

/* ---------- score chip ---------- */
export function ScoreChip({
  score,
  size = "md",
}: {
  score: number;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={`score-chip score-chip--${size}`}
      style={{ color: bandColor(score), background: bandSoft(score), borderColor: bandColor(score) }}
      title={`Haxax Score ${score}/100`}
    >
      <span className="mono">{score}</span>
    </span>
  );
}

export function ScoreDot({ score }: { score: number }) {
  return <span className="score-dot" style={{ background: bandColor(score) }} aria-hidden />;
}

/* ---------- radial score gauge ---------- */
export function RadialScore({ score, size = 92, label }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  const col = bandColor(score);
  return (
    <div className="radial" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={col}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 700ms var(--ease)" }}
        />
      </svg>
      <div className="radial-label">
        <span className="radial-score mono" style={{ color: col }}>
          {score}
        </span>
        {label && <span className="radial-sub eyebrow">{label}</span>}
      </div>
    </div>
  );
}

/* ---------- generic pill ---------- */
export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "pos" | "neg" | "warn" | "info";
  className?: string;
}) {
  return <span className={`pill pill--${tone} ${className}`}>{children}</span>;
}

/* ---------- action badge ---------- */
const ACTION_TONE: Record<SuggestedAction, string> = {
  Acquire: "pos",
  Investigate: "info",
  Monitor: "warn",
  Avoid: "neg",
};
export function ActionBadge({ action }: { action: SuggestedAction }) {
  return (
    <span className={`action-badge action-badge--${ACTION_TONE[action]}`}>
      {action}
    </span>
  );
}

/* ---------- status badge ---------- */
export function StatusBadge({ status }: { status: TenementStatus }) {
  const tone =
    status === "Live" || status === "Granted" ? "pos" : status === "Expiring" || status === "Pending" ? "warn" : "neutral";
  return <span className={`status-badge status-badge--${tone}`}>{status}</span>;
}

/* ---------- risk badge ---------- */
const RISK_TONE: Record<RiskLevel, string> = {
  low: "info",
  moderate: "warn",
  elevated: "warn-strong",
  high: "neg",
};
export function RiskBadge({ level, label }: { level: RiskLevel; label: string }) {
  return (
    <span className={`risk-badge risk-badge--${RISK_TONE[level]}`}>
      <span className="risk-dot" /> {label}
    </span>
  );
}

/* ---------- severity ---------- */
const SEV_COLOR: Record<AlertSeverity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};
export function SeverityDot({ sev }: { sev: AlertSeverity }) {
  return <span className="sev-dot" style={{ background: SEV_COLOR[sev], boxShadow: `0 0 0 3px ${SEV_COLOR[sev]}22` }} />;
}
export const sevColor = (s: AlertSeverity) => SEV_COLOR[s];

/* ---------- sparkline ---------- */
export function Sparkline({
  data,
  width = 120,
  height = 30,
  color = "var(--accent)",
  fill = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1 || 1);
  const pts = data.map((d, i) => [i * step, height - ((d - min) / span) * (height - 4) - 2]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const id = `spark-${Math.round(data[0] * 1000)}-${data.length}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline">
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- KPI tile ---------- */
export function KpiTile({
  label,
  value,
  sub,
  delta,
  accent,
  spark,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: { value: string; dir: "up" | "down" | "flat" };
  accent?: string;
  spark?: number[];
}) {
  return (
    <div className="kpi-tile">
      <div className="kpi-top">
        <span className="eyebrow">{label}</span>
        {delta && (
          <span className={`kpi-delta kpi-delta--${delta.dir}`}>
            {delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "■"} {delta.value}
          </span>
        )}
      </div>
      <div className="kpi-value mono" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      <div className="kpi-bottom">
        {sub && <span className="kpi-sub">{sub}</span>}
        {spark && <Sparkline data={spark} width={70} height={22} fill={false} />}
      </div>
    </div>
  );
}

/* ---------- toggle switch ---------- */
export function Toggle({
  on,
  onChange,
  label,
  small,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? "is-on" : ""} ${small ? "toggle--sm" : ""}`}
      onClick={() => onChange(!on)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

/* ---------- skeleton ---------- */
export function Skeleton({ w, h, r }: { w?: number | string; h?: number | string; r?: number }) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: r }} />;
}

/* ---------- empty state ---------- */
export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {hint && <div className="empty-hint">{hint}</div>}
    </div>
  );
}

export { band, bandColor, bandSoft };
