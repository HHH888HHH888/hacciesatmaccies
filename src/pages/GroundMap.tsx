import type React from "react";
import { useMemo, useState } from "react";
import { Layers, RotateCcw, Sparkles, SlidersHorizontal, X } from "lucide-react";
import { useStore, applyFilters, activeFilterCount, askHaxax } from "../lib/store";
import { REGIONS } from "../lib/geo";
import type { Commodity, LayerKey, LicenceType, RegionId, SuggestedAction, TenementStatus } from "../lib/types";
import { WAMap } from "../components/WAMap";
import { RegisterDock } from "../components/RegisterDock";
import { ScoreChip, CommodityTag, commodityVar } from "../components/ui";

const COMMODITIES: Commodity[] = ["Gold", "Lithium", "Iron Ore", "Nickel", "Rare Earths", "Copper", "Cobalt"];
const LICENCES: LicenceType[] = ["Exploration", "Prospecting", "Mining", "Retention", "Miscellaneous"];
const STATUSES: TenementStatus[] = ["Live", "Granted", "Pending", "Expiring", "Application"];
const ACTIONS: SuggestedAction[] = ["Acquire", "Investigate", "Monitor", "Avoid"];

const LAYER_META: { key: LayerKey; label: string; color: string }[] = [
  { key: "tenements", label: "Tenements", color: "var(--accent)" },
  { key: "mines", label: "Mines & deposits (MINEDEX)", color: "var(--c-gold)" },
  { key: "targets", label: "AI suspected targets", color: "var(--accent)" },
  { key: "geology", label: "Geology domains", color: "#4a4438" },
  { key: "drillholes", label: "Drill holes", color: "var(--info)" },
  { key: "faults", label: "Faults & structures", color: "var(--c-iron)" },
  { key: "competitor", label: "Competitor land", color: "var(--info)" },
  { key: "expiry", label: "Expiry risk", color: "var(--score-mid)" },
  { key: "royalty", label: "Royalty / encumbrance", color: "var(--score-mid)" },
  { key: "activity", label: "Recent nearby activity", color: "var(--accent)" },
];

export function GroundMap() {
  const filters = useStore((s) => s.filters);
  const setFilter = useStore((s) => s.setFilter);
  const toggleArrayFilter = useStore((s) => s.toggleArrayFilter);
  const resetFilters = useStore((s) => s.resetFilters);
  const watchlist = useStore((s) => s.watchlist);
  const layers = useStore((s) => s.layers);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const tenements = useStore((s) => s.tenements);
  const [sbOpen, setSbOpen] = useState(false);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState("");

  const runAsk = async () => {
    if (!ask.trim()) return;
    setAsking(true);
    setAskErr("");
    const r = await askHaxax(ask);
    setAsking(false);
    if (!r.ok) setAskErr("AI search needs the MiniMax key — use the filters below for now.");
  };

  const filtered = useMemo(
    () => applyFilters(tenements, filters, watchlist),
    [tenements, filters, watchlist],
  );
  const activeCount = activeFilterCount(filters);

  return (
    <div className="map-layout">
      <aside className={`map-sidebar ${sbOpen ? "is-open" : ""}`}>
        <div className="map-sidebar-scroll">
          {/* ask haxax */}
          <div className="sb-section">
            <div className="sb-section-head">
              <span className="eyebrow"><Sparkles size={12} /> Ask Haxax</span>
            </div>
            <div className="ask-box">
              <input
                className="input"
                value={ask}
                placeholder="e.g. Leonora gold, privately held, expiring < 12 months"
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runAsk(); }}
              />
              <button className="btn btn--primary btn--sm" onClick={runAsk} disabled={asking || !ask.trim()}>
                {asking ? <Sparkles size={13} className="spin" /> : <Sparkles size={13} />}
              </button>
            </div>
            {askErr && <p className="prose faint" style={{ fontSize: "var(--fs-10)", marginTop: 6 }}>{askErr}</p>}
          </div>

          {/* filters */}
          <div className="sb-section">
            <div className="sb-section-head">
              <span className="eyebrow"><SlidersHorizontal size={12} /> Filters {activeCount > 0 && `· ${activeCount}`}</span>
              <button className="btn btn--ghost btn--sm" onClick={resetFilters} disabled={activeCount === 0}>
                <RotateCcw size={12} /> Reset
              </button>
            </div>

            <div className="col gap-2" style={{ marginBottom: "var(--sp-3)" }}>
              <div className="row between">
                <span className="field-label">Min Haxax Score</span>
                <span className="mono secondary">{filters.scoreMin}+</span>
              </div>
              <input
                className="range"
                type="range"
                min={0}
                max={100}
                step={5}
                value={filters.scoreMin}
                onChange={(e) => setFilter("scoreMin", +e.target.value)}
              />
            </div>

            <FilterGroup label="Commodity">
              {COMMODITIES.map((c) => (
                <Chip
                  key={c}
                  active={filters.commodities.includes(c)}
                  onClick={() => toggleArrayFilter("commodities", c)}
                  swatch={commodityVar(c)}
                >
                  {c}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Region">
              {REGIONS.map((r) => (
                <Chip
                  key={r.id}
                  active={filters.regions.includes(r.id)}
                  onClick={() => toggleArrayFilter("regions", r.id as RegionId)}
                >
                  {r.name}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Licence type">
              {LICENCES.map((l) => (
                <Chip key={l} active={filters.licenceTypes.includes(l)} onClick={() => toggleArrayFilter("licenceTypes", l)}>
                  {l}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Status">
              {STATUSES.map((s) => (
                <Chip key={s} active={filters.statuses.includes(s)} onClick={() => toggleArrayFilter("statuses", s)}>
                  {s}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Suggested action">
              {ACTIONS.map((a) => (
                <Chip key={a} active={filters.actions.includes(a)} onClick={() => toggleArrayFilter("actions", a)}>
                  {a}
                </Chip>
              ))}
            </FilterGroup>

            <div className="sb-row" style={{ marginTop: "var(--sp-2)" }}>
              <span className="sb-row-label">Watchlist only</span>
              <input
                type="checkbox"
                checked={filters.onlyWatchlist}
                onChange={(e) => setFilter("onlyWatchlist", e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
            </div>
          </div>

          {/* layers */}
          <div className="sb-section">
            <div className="sb-section-head">
              <span className="eyebrow"><Layers size={12} /> Map layers</span>
            </div>
            {LAYER_META.map((l) => (
              <div className="sb-row" key={l.key}>
                <label className="sb-row-label" htmlFor={`lyr-${l.key}`} style={{ cursor: "pointer" }}>
                  <span className="lyr-swatch" style={{ background: layers[l.key] ? l.color : "transparent" }} />
                  {l.label}
                </label>
                <input
                  id={`lyr-${l.key}`}
                  type="checkbox"
                  checked={layers[l.key]}
                  onChange={() => toggleLayer(l.key)}
                  style={{ accentColor: "var(--accent)" }}
                />
              </div>
            ))}
          </div>

          {/* results */}
          <div className="sb-section" style={{ borderBottom: 0 }}>
            <div className="sb-section-head">
              <span className="eyebrow">Results · {filtered.length}</span>
            </div>
            <div className="col" style={{ gap: 2 }}>
              {filtered.slice(0, 60).map((t) => (
                <button
                  key={t.id}
                  className={`list-row ${selectedId === t.id ? "is-selected" : ""}`}
                  style={{
                    border: "1px solid",
                    borderColor: selectedId === t.id ? "var(--accent-line)" : "transparent",
                    borderRadius: "var(--r-sm)",
                    background: selectedId === t.id ? "var(--bg-selected)" : "transparent",
                    padding: "7px 8px",
                  }}
                  onClick={() => select(t.id)}
                >
                  <ScoreChip score={t.score} size="sm" />
                  <div className="lr-main">
                    <div className="lr-id">{t.id}</div>
                    <div className="lr-sub">{t.holder}</div>
                  </div>
                  <CommodityTag c={t.commodities[0]} dot />
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="prose muted" style={{ padding: "var(--sp-3) 0" }}>
                  No tenements match the current filters. Try widening the score range or clearing commodities.
                </p>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="map-main">
        <WAMap tenements={filtered} />
        <RegisterDock tenements={filtered} />
      </div>

      {/* mobile sidebar toggle */}
      <button
        className="btn btn--accent-soft only-mobile map-mobile-toggle"
        onClick={() => setSbOpen((v) => !v)}
      >
        {sbOpen ? <X size={14} /> : <SlidersHorizontal size={14} />} {sbOpen ? "Close" : "Filters & layers"}
      </button>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "var(--sp-3)" }}>
      <div className="field-label" style={{ marginBottom: 6, display: "block" }}>{label}</div>
      <div className="chip-wrap">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  swatch,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  swatch?: string;
}) {
  return (
    <button className={`chip ${active ? "is-active" : ""}`} onClick={onClick} aria-pressed={active}>
      {swatch && <span className="chip-swatch" style={{ background: swatch }} />}
      {children}
    </button>
  );
}
