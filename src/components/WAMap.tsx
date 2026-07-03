import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Minus, Plus } from "lucide-react";
import type { Tenement } from "../lib/types";
import {
  FAULTS,
  KM_PER_MAP_WIDTH,
  LAT_LINES,
  LNG_LINES,
  MAP_H,
  MAP_W,
  REGIONS,
  REGION_MAP,
  WA_OUTLINE,
  boundsToView,
  pathFromLngLat,
  project,
  unproject,
} from "../lib/geo";
import { useStore } from "../lib/store";
import { bandColor } from "../lib/scoring";
import { CommodityTag, ScoreChip, commodityVar } from "./ui";
import { daysUntil } from "../lib/format";

/* projected geometry for a tenement (computed from whatever data is loaded) */
interface Geo {
  d: string;
  cx: number;
  cy: number;
}

const LAND_PATH = pathFromLngLat(WA_OUTLINE);
const FAULT_PATHS = FAULTS.map((f) => pathFromLngLat(f, false));

/* geology domains — translucent regional terranes for the geology layer */
const GEO_HUES = [
  "#3a4d4a", "#4a4438", "#3c4452", "#4a3c44", "#384a3e",
  "#4a4232", "#324a4a", "#42384a", "#4a3838", "#3e4a34",
];
const GEO_DOMAINS = REGIONS.map((r, i) => {
  const a = project(r.bounds[0], r.bounds[3]);
  const b = project(r.bounds[2], r.bounds[1]);
  return {
    x: a.x,
    y: a.y,
    w: b.x - a.x,
    h: b.y - a.y,
    hue: GEO_HUES[i % GEO_HUES.length],
  };
});

function hashDots(t: Tenement, g: Geo): { x: number; y: number }[] {
  const n = Math.max(0, Math.min(8, Math.round(t.drillHoles / 90)));
  const out: { x: number; y: number }[] = [];
  let seed = t.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  for (let i = 0; i < n; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const a = (seed / 233280) * Math.PI * 2;
    const r = 4 + ((seed % 13) || 3);
    out.push({ x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r });
  }
  return out;
}

interface Props {
  tenements: Tenement[];
}

export function WAMap({ tenements }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const layers = useStore((s) => s.layers);
  const opacity = useStore((s) => s.layerOpacity);
  const scanMode = useStore((s) => s.scanMode);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const flyTo = useStore((s) => s.flyTo);

  // projected geometry for the currently-loaded tenements
  const geo = useMemo<Record<string, Geo>>(() => {
    const m: Record<string, Geo> = {};
    for (const t of tenements) {
      const p = project(t.lng, t.lat);
      m[t.id] = { d: pathFromLngLat(t.poly), cx: p.x, cy: p.y };
    }
    return m;
  }, [tenements]);
  const byId = useMemo(() => new Map(tenements.map((t) => [t.id, t])), [tenements]);
  const realDeposits = useStore((s) => s.deposits);
  const drillPoints = useStore((s) => s.drillPoints);
  const realDrill = useMemo(() => drillPoints.map((p) => { const q = project(p.lng, p.lat); return { x: q.x, y: q.y }; }), [drillPoints]);
  const deposits = useMemo(() => {
    // real MINEDEX deposits where available
    if (realDeposits.length) {
      return realDeposits.map((d) => {
        const p = project(d.lng, d.lat);
        return { x: p.x, y: p.y, name: d.name, color: commodityVar(d.commodity), producing: /Producing/i.test(d.stage) };
      });
    }
    // fallback: synthesise from tenements' nearby mines
    const out: { x: number; y: number; name: string; color: string; producing: boolean }[] = [];
    tenements.forEach((t, i) => {
      const g = geo[t.id];
      const m = t.nearbyMines.find((n) => n.status === "Producing") ?? t.nearbyMines[0];
      if (!g || !m) return;
      const off = ((i * 53) % 17) - 8;
      out.push({ x: g.cx + off, y: g.cy - Math.abs(off) - 6, name: m.name, color: commodityVar(m.commodity), producing: m.status === "Producing" });
    });
    return out;
  }, [realDeposits, tenements, geo]);

  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [tip, setTip] = useState<{ x: number; y: number; t: Tenement } | null>(null);
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const rafRef = useRef<number>(0);
  const coordRef = useRef<HTMLSpanElement>(null);

  /* smooth tween of {x,y,k} for zoom buttons / reset / fly-to */
  const tweenTo = (target: { x: number; y: number; k: number }, dur = 520) => {
    cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    setView((from) => {
      const f0 = { ...from };
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setView({
          x: f0.x + (target.x - f0.x) * e,
          y: f0.y + (target.y - f0.y) * e,
          k: f0.k + (target.k - f0.k) * e,
        });
        if (p < 1) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
      return from;
    });
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  /* scan candidates: high score + acquisition leverage */
  const scanIds = useMemo(() => {
    if (!scanMode) return new Set<string>();
    return new Set(
      tenements
        .filter((t) => {
          const soon = daysUntil(t.expiryDate) < 540;
          const loose = ["Private", "Individual", "Junior"].includes(t.holderType);
          const adj = t.factors.find((f) => f.key === "adjacency")?.value ?? 0;
          return t.score >= 78 && (soon || loose || adj >= 74);
        })
        .map((t) => t.id),
    );
  }, [scanMode, tenements]);

  const scanClusters = useMemo(() => {
    if (!scanMode) return [];
    const byRegion: Record<string, { x: number; y: number }[]> = {};
    scanIds.forEach((id) => {
      const t = byId.get(id);
      const g = geo[id];
      if (!t || !g) return;
      (byRegion[t.regionId] ??= []).push({ x: g.cx, y: g.cy });
    });
    return Object.entries(byRegion)
      .filter(([, pts]) => pts.length >= 2)
      .map(([region, pts]) => {
        const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
        const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
        const r = Math.max(48, ...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 26;
        return { region, cx, cy, r, n: pts.length };
      });
  }, [scanMode, scanIds, byId, geo]);

  /* ---- mouse → viewBox coords ---- */
  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  /* ---- wheel zoom (native, non-passive) ---- */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x: cs, y: csy } = toSvg(e.clientX, e.clientY);
      setView((v) => {
        const factor = Math.exp(-e.deltaY * 0.0014);
        const k = Math.max(0.85, Math.min(10, v.k * factor));
        const x = cs - ((cs - v.x) / v.k) * k;
        const y = csy - ((csy - v.y) / v.k) * k;
        return { x, y, k };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  /* ---- fly to region ---- */
  useEffect(() => {
    if (!flyTo) return;
    const r = REGION_MAP[flyTo.region];
    const { cx, cy, scale } = boundsToView(r.bounds);
    tweenTo({ x: MAP_W / 2 - cx * scale, y: MAP_H / 2 - cy * scale, k: scale }, 620);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  /* ---- pan ---- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = toSvg(e.clientX, e.clientY);
    pan.current = { sx: p.x, sy: p.y, vx: view.x, vy: view.y, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = toSvg(e.clientX, e.clientY);
    // live coordinate readout (imperative — avoids re-rendering the SVG)
    if (coordRef.current) {
      const wx = (p.x - view.x) / view.k;
      const wy = (p.y - view.y) / view.k;
      const { lng, lat } = unproject(wx, wy);
      const zone = Math.floor((lng + 180) / 6) + 1;
      coordRef.current.textContent = `${Math.abs(lat).toFixed(2)}°S  ${lng.toFixed(2)}°E · MGA${zone}`;
    }
    if (!pan.current) return;
    const dx = p.x - pan.current.sx;
    const dy = p.y - pan.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.current.moved = true;
    setView((v) => ({ ...v, x: pan.current!.vx + dx * 1, y: pan.current!.vy + dy * 1 }));
    if (tip) setTip(null);
  };
  const onPointerUp = () => {
    pan.current = null;
  };

  const zoom = (factor: number) => {
    const v = view;
    const k = Math.max(0.85, Math.min(10, v.k * factor));
    const cx = MAP_W / 2, cy = MAP_H / 2;
    tweenTo({ x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k, k }, 300);
  };
  const reset = () => tweenTo({ x: 0, y: 0, k: 1 }, 460);

  const showTip = (e: React.MouseEvent, t: Tenement) => {
    if (pan.current?.moved) return;
    const rect = stageRef.current!.getBoundingClientRect();
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, t });
  };

  const transform = `translate(${view.x.toFixed(2)} ${view.y.toFixed(2)}) scale(${view.k.toFixed(4)})`;

  return (
    <div className="map-stage" ref={stageRef}>
      <svg
        ref={svgRef}
        className={`map-svg ${pan.current ? "is-panning" : ""}`}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { onPointerUp(); setTip(null); }}
        role="application"
        aria-label="Western Australia tenement map"
      >
        <defs>
          <radialGradient id="scanGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="none" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--score-mid)" strokeWidth="1.4" opacity="0.5" />
          </pattern>
        </defs>

        <g transform={transform}>
          {/* whole-degree graticule with labels */}
          {LNG_LINES.map((lng) => {
            const a = project(lng, -12.8);
            const b = project(lng, -35.4);
            const l = project(lng, -34.9);
            return (
              <g key={`lng${lng}`}>
                <line className="wa-graticule" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                <text className="wa-grid-label" x={l.x} y={l.y} textAnchor="middle" style={{ fontSize: 11 / view.k }}>{lng}°E</text>
              </g>
            );
          })}
          {LAT_LINES.map((lat) => {
            const a = project(112.2, lat);
            const b = project(129.6, lat);
            const l = project(112.6, lat);
            return (
              <g key={`lat${lat}`}>
                <line className="wa-graticule" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                <text className="wa-grid-label" x={l.x} y={l.y - 2} style={{ fontSize: 11 / view.k }}>{Math.abs(lat)}°S</text>
              </g>
            );
          })}

          {/* land */}
          <path className="wa-land" d={LAND_PATH} />

          {/* geology domains */}
          {layers.geology &&
            GEO_DOMAINS.map((g, i) => (
              <rect
                key={`geo${i}`}
                x={g.x}
                y={g.y}
                width={g.w}
                height={g.h}
                rx={6}
                fill={g.hue}
                opacity={opacity * 0.5}
                stroke={g.hue}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

          {/* region labels */}
          {REGIONS.map((r) => {
            const p = project(r.lng, r.lat);
            return (
              <text key={r.id} className="wa-region-label" x={p.x} y={p.y} textAnchor="middle" style={{ fontSize: 11 / view.k * 1.0 }}>
                {r.name}
              </text>
            );
          })}

          {/* faults */}
          {layers.faults && FAULT_PATHS.map((d, i) => <path key={`f${i}`} className="wa-fault" d={d} />)}

          {/* real MINEDEX mines & deposits, coloured by commodity */}
          {layers.mines &&
            deposits.map((d, i) => (
              <circle
                key={`m${i}`}
                cx={d.x}
                cy={d.y}
                r={d.producing ? 2.8 : 2}
                fill={d.color}
                fillOpacity={(d.producing ? 0.95 : 0.5) * opacity}
                stroke={d.producing ? "var(--bg-app)" : "none"}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              >
                <title>{d.name}</title>
              </circle>
            ))}

          {/* drill holes — real DMIRS points where available, else synthesised */}
          {layers.drillholes && (realDrill.length
            ? realDrill.map((p, i) => <circle key={`dh${i}`} className="wa-drill" cx={p.x} cy={p.y} r={0.9} />)
            : tenements.flatMap((t) =>
                hashDots(t, geo[t.id]).map((d, i) => <circle key={`${t.id}-d${i}`} className="wa-drill" cx={d.x} cy={d.y} r={1.4} />),
              ))}

          {/* tenements */}
          {layers.tenements &&
            tenements.map((t) => {
              const g = geo[t.id];
              if (!g) return null;
              const col = bandColor(t.score);
              const selected = selectedId === t.id;
              const scanHit = scanMode && scanIds.has(t.id);
              const dimmed = (selectedId && !selected) || (scanMode && !scanHit);
              return (
                <path
                  key={t.id}
                  className={`tenement-poly ${selected ? "is-selected" : ""} ${dimmed ? "is-dimmed" : ""}`}
                  d={g.d}
                  fill={col}
                  fillOpacity={selected ? Math.min(1, opacity + 0.25) : opacity * 0.55}
                  stroke={selected ? "var(--accent)" : col}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!pan.current?.moved) select(t.id);
                  }}
                  onMouseEnter={(e) => showTip(e, t)}
                  onMouseMove={(e) => showTip(e, t)}
                  onMouseLeave={() => setTip(null)}
                />
              );
            })}

          {/* overlays */}
          {layers.expiry &&
            tenements
              .filter((t) => daysUntil(t.expiryDate) < 365)
              .map((t) => <path key={`e${t.id}`} d={geo[t.id].d} fill="none" stroke="var(--score-mid)" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />)}

          {layers.royalty &&
            tenements
              .filter((t) => t.encumbrances.length > 0)
              .map((t) => <path key={`r${t.id}`} d={geo[t.id].d} fill="url(#hatch)" stroke="none" />)}

          {layers.competitor &&
            tenements
              .filter((t) => t.holderType === "Major" || t.holderType === "Mid-cap")
              .map((t) => <path key={`c${t.id}`} d={geo[t.id].d} fill="none" stroke="var(--info)" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}

          {layers.activity &&
            tenements
              .filter((t) => (t.factors.find((f) => f.key === "activity")?.value ?? 0) >= 72)
              .map((t) => <circle key={`a${t.id}`} cx={geo[t.id].cx} cy={geo[t.id].cy} r={9} fill="none" stroke="var(--accent)" strokeWidth={1.4} opacity={0.6} className="scan-cluster" />)}

          {/* AI suspected targets — analog prospectivity over real deposits */}
          {layers.targets &&
            tenements
              .filter((t) => (t.target?.score ?? 0) >= 62)
              .map((t) => {
                const g = geo[t.id];
                if (!g) return null;
                const sc = t.target!.score;
                const r = 7 + (sc - 62) * 0.5;
                return (
                  <g key={`tg${t.id}`}>
                    <circle cx={g.cx} cy={g.cy} r={r} className="scan-cluster" />
                    <circle cx={g.cx} cy={g.cy} r={2} fill="var(--accent)" />
                  </g>
                );
              })}

          {/* scan mode */}
          {scanMode &&
            scanClusters.map((c, i) => (
              <g key={`sc${i}`}>
                <circle className="scan-sweep" cx={c.cx} cy={c.cy} r={c.r} />
                <circle className="scan-cluster" cx={c.cx} cy={c.cy} r={c.r} />
              </g>
            ))}
        </g>
      </svg>

      {/* overlay controls */}
      <div className="map-overlay map-toolbar">
        <button
          className={`btn ${scanMode ? "is-active" : ""}`}
          onClick={() => useStore.getState().toggleScan()}
          title="Highlight clusters of potentially underpriced or strategic tenements"
        >
          <Crosshair size={14} /> Scan mode
          {scanMode && <span className="btn-count">{scanIds.size}</span>}
        </button>
        <button className="btn" onClick={reset} title="Reset view to full state">
          Reset
        </button>
        <div className="map-readout hide-sm">
          <span ref={coordRef}>Western Australia · GDA2020</span>
          <span className="mr-sep">·</span>
          <span className="mr-dim">z{view.k.toFixed(1)}</span>
        </div>
      </div>

      <RegionJump />

      <div className="map-zoom">
        <button onClick={() => zoom(1.4)} aria-label="Zoom in"><Plus size={16} /></button>
        <button onClick={() => zoom(1 / 1.4)} aria-label="Zoom out"><Minus size={16} /></button>
      </div>

      <MapLegend count={tenements.length} spanKm={KM_PER_MAP_WIDTH / view.k} />

      {tip && !pan.current && (
        <div className="map-tooltip" style={{ left: tip.x, top: tip.y }}>
          <div className="map-tooltip-head">
            <span className="map-tooltip-id">{tip.t.id}</span>
            <ScoreChip score={tip.t.score} size="sm" />
          </div>
          <div className="map-tooltip-row">{tip.t.holder}</div>
          <div className="map-tooltip-row" style={{ marginTop: 3, gap: 8 }}>
            <CommodityTag c={tip.t.commodities[0]} />
            <span>· {REGION_MAP[tip.t.regionId].name}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function RegionJump() {
  const requestFlyTo = useStore((s) => s.requestFlyTo);
  const [open, setOpen] = useState(false);
  return (
    <div className="map-region-jump">
      <button className="btn" onClick={() => setOpen((v) => !v)}>
        <Crosshair size={14} /> Fly to region
      </button>
      {open && (
        <div className="popover" style={{ top: "calc(100% + 6px)", right: 0, minWidth: 200 }} onMouseLeave={() => setOpen(false)}>
          {REGIONS.map((r) => (
            <button
              key={r.id}
              className="menu-item"
              onClick={() => { requestFlyTo(r.id); setOpen(false); }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MapLegend({ count, spanKm }: { count: number; spanKm: number }) {
  const opacity = useStore((s) => s.layerOpacity);
  const setOpacity = useStore((s) => s.setLayerOpacity);
  const bands: { label: string; range: string; score: number }[] = [
    { label: "Strong", range: "85–100", score: 92 },
    { label: "Watch", range: "60–84", score: 72 },
    { label: "Weak", range: "0–59", score: 40 },
  ];
  return (
    <div className="map-legend">
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="eyebrow">Haxax Score · {count} shown</span>
        <span className="mono faint" style={{ fontSize: "var(--fs-10)" }}>≈{Math.round(spanKm)} km</span>
      </div>
      {bands.map((b) => (
        <div className="legend-row" key={b.label}>
          <span className="legend-swatch" style={{ background: bandColor(b.score), borderColor: bandColor(b.score) }} />
          <span style={{ flex: 1 }}>{b.label}</span>
          <span className="mono faint">{b.range}</span>
        </div>
      ))}
      <div className="legend-opacity">
        <div className="row between" style={{ marginBottom: 4 }}>
          <span className="eyebrow">Layer opacity</span>
          <span className="mono faint" style={{ fontSize: "var(--fs-10)" }}>{Math.round(opacity * 100)}%</span>
        </div>
        <input
          className="range"
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(+e.target.value)}
          aria-label="Layer opacity"
        />
      </div>
    </div>
  );
}
