import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { Tenement } from "../lib/types";
import { bandColor } from "../lib/scoring";

export function ScoreBreakdown({ t, defaultOpen = false }: { t: Tenement; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const sorted = [...t.factors].sort((a, b) => b.value * b.weight - a.value * a.weight);

  return (
    <div>
      <button
        className="breakdown-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="row center gap-2">
          <SlidersHorizontal size={13} style={{ color: "var(--accent)" }} />
          Score breakdown · {t.factors.length} weighted factors
        </span>
        <ChevronDown
          size={15}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform var(--t-fast)" }}
        />
      </button>

      {open && (
        <div className="breakdown fade-in">
          {sorted.map((f) => (
            <div className="bd-row" key={f.key} title={f.note}>
              <span className="bd-label">
                {f.label}
                <span className="bd-weight">{Math.round(f.weight * 100)}%</span>
              </span>
              <span className="bd-value">{f.value}</span>
              <div className="bd-bar">
                <div
                  className="bd-fill"
                  style={{ width: `${f.value}%`, background: bandColor(f.value) }}
                />
              </div>
              <span className="bd-contrib" style={{ gridColumn: "1 / -1", textAlign: "right" }}>
                contributes {(f.value * f.weight).toFixed(1)} pts
              </span>
            </div>
          ))}
          <div className="bd-total">
            <span>Haxax Score</span>
            <span className="mono" style={{ color: bandColor(t.score), fontSize: "var(--fs-16)" }}>
              {t.score}<span className="faint" style={{ fontSize: "var(--fs-11)" }}> / 100</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
