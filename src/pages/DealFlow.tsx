import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useStore } from "../lib/store";
import { REGION_MAP } from "../lib/geo";
import type { DealStage, Tenement } from "../lib/types";
import { ScoreChip, CommodityTag, Pill } from "../components/ui";
import { fmtHa } from "../lib/format";

const STAGES: { id: DealStage; label: string; color: string }[] = [
  { id: "lead", label: "New lead", color: "var(--text-muted)" },
  { id: "reviewing", label: "Reviewing", color: "var(--info)" },
  { id: "contacted", label: "Contacted", color: "#7c8fe8" },
  { id: "diligence", label: "Due diligence", color: "var(--score-mid)" },
  { id: "bid", label: "Bid planning", color: "var(--accent)" },
  { id: "passed", label: "Passed", color: "var(--score-low)" },
];

function riskOf(t: Tenement): { label: string; tone: "neg" | "warn" | "info" | "pos" } {
  if (t.riskFlags.some((r) => r.level === "high")) return { label: "High risk", tone: "neg" };
  if (t.riskFlags.some((r) => r.level === "elevated")) return { label: "Elevated", tone: "warn" };
  if (t.riskFlags.length) return { label: "Moderate", tone: "info" };
  return { label: "Clean", tone: "pos" };
}

export function DealFlow() {
  const deals = useStore((s) => s.deals);
  const tenements = useStore((s) => s.tenements);
  const moveDeal = useStore((s) => s.moveDeal);
  const select = useStore((s) => s.select);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<DealStage | null>(null);

  const byStage = useMemo(() => {
    const map: Record<string, Tenement[]> = {};
    STAGES.forEach((s) => (map[s.id] = []));
    tenements.forEach((t) => {
      const st = deals[t.id];
      if (st && map[st]) map[st].push(t);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => b.score - a.score));
    return map;
  }, [deals, tenements]);

  const total = Object.values(byStage).reduce((a, arr) => a + arr.length, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Deal Flow</h1>
          <div className="sub">{total} tenements in pipeline · drag cards between stages to progress a deal</div>
        </div>
      </div>

      <div className="board" style={{ flex: 1, minHeight: 0 }}>
        {STAGES.map((stage) => (
          <div
            key={stage.id}
            className={`board-col ${over === stage.id ? "is-drop-target" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(stage.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === stage.id ? null : o));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain") || dragId;
              if (id) moveDeal(id, stage.id);
              setOver(null);
              setDragId(null);
            }}
          >
            <div className="board-col-head">
              <span className="board-col-title">
                <span className="bct-dot" style={{ background: stage.color }} />
                {stage.label}
              </span>
              <span className="board-col-count">{byStage[stage.id].length}</span>
            </div>
            <div className="board-col-body">
              {byStage[stage.id].map((t) => {
                const risk = riskOf(t);
                return (
                  <div
                    key={t.id}
                    className={`deal-card ${dragId === t.id ? "is-dragging" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(t.id);
                    }}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                    onClick={() => select(t.id)}
                  >
                    <div className="deal-card-top">
                      <span className="deal-card-id">{t.id}</span>
                      <ScoreChip score={t.score} size="sm" />
                    </div>
                    <div className="deal-card-holder">{t.holder}</div>
                    <div className="deal-card-meta">
                      <CommodityTag c={t.commodities[0]} dot />
                      <span className="muted" style={{ fontSize: "var(--fs-11)" }}>{REGION_MAP[t.regionId].name}</span>
                    </div>
                    <div className="deal-card-foot">
                      <span className="mono faint" style={{ fontSize: "var(--fs-10)" }}>{fmtHa(t.areaHa)}</span>
                      <Pill tone={risk.tone}>{risk.label}</Pill>
                    </div>
                  </div>
                );
              })}
              {byStage[stage.id].length === 0 && (
                <div className="empty-state" style={{ padding: "var(--sp-6) var(--sp-3)" }}>
                  <Plus size={18} className="empty-icon" />
                  <div className="empty-hint">Drop a tenement here</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
