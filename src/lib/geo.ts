/* ============================================================
   HAXAX — Western Australia geography & projection

   A stylised but faithfully-proportioned WA outline rendered in a
   fixed internal coordinate space. lng/lat map linearly into a box
   whose aspect ratio (1000 x 1430) reproduces WA's true shape at
   ~26°S (1° lng ≈ cos(26°) of 1° lat).
   ============================================================ */

import type { Region, RegionId } from "./types";

export const MAP_W = 1000;
export const MAP_H = 1430;

const WEST = 112.0;
const EAST = 129.5;
const NORTH = -13.0;
const SOUTH = -35.5;

export function project(lng: number, lat: number): { x: number; y: number } {
  const x = ((lng - WEST) / (EAST - WEST)) * MAP_W;
  const y = ((NORTH - lat) / (NORTH - SOUTH)) * MAP_H;
  return { x, y };
}

/** Inverse of project — map-space (x,y) back to lng/lat. */
export function unproject(x: number, y: number): { lng: number; lat: number } {
  const lng = WEST + (x / MAP_W) * (EAST - WEST);
  const lat = NORTH - (y / MAP_H) * (NORTH - SOUTH);
  return { lng, lat };
}

/** Approx ground span (km) across the full map width — for scale readout. */
export const KM_PER_MAP_WIDTH = (EAST - WEST) * 111 * Math.cos((26 * Math.PI) / 180);

/** Whole-degree graticule lines for a GIS-style grid. */
export const LNG_LINES = [114, 117, 120, 123, 126, 129];
export const LAT_LINES = [-15, -18, -21, -24, -27, -30, -33];

export function pathFromLngLat(points: [number, number][], close = true): string {
  let d = "";
  points.forEach(([lng, lat], i) => {
    const { x, y } = project(lng, lat);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
  });
  if (close) d += "Z";
  return d.trim();
}

/* Coastline + straight eastern border, traced clockwise from the
   far NW Kimberley tip. ~40 vertices: recognisable, not jagged. */
export const WA_OUTLINE: [number, number][] = [
  [126.9, -13.7],
  [125.9, -14.4],
  [124.9, -15.0],
  [124.2, -16.0],
  [123.5, -16.3],
  [123.6, -17.3],
  [122.2, -18.0],
  [121.9, -18.7],
  [121.0, -19.5],
  [119.9, -19.9],
  [118.6, -20.3],
  [117.6, -20.6],
  [116.7, -20.9],
  [115.5, -21.0],
  [114.9, -21.4],
  [114.1, -21.8],
  [113.5, -22.5],
  [113.9, -23.6],
  [113.3, -24.6],
  [113.15, -25.5],
  [113.2, -26.2],
  [114.0, -27.4],
  [114.6, -28.8],
  [115.0, -29.6],
  [115.3, -30.5],
  [115.7, -31.95],
  [115.6, -32.7],
  [115.3, -33.5],
  [115.13, -34.37],
  [116.0, -34.9],
  [117.0, -35.1],
  [117.9, -35.06],
  [118.9, -34.6],
  [119.9, -33.95],
  [121.0, -33.8],
  [121.9, -33.86],
  [123.2, -33.9],
  [124.5, -33.0],
  [125.8, -32.4],
  [127.3, -31.8],
  [128.9, -31.68],
  [129.0, -31.68],
  // straight eastern border (129°E) up to the northern coast
  [129.0, -25.0],
  [129.0, -18.0],
  [129.0, -14.85],
  [128.3, -15.0],
  [127.8, -14.4],
  [127.3, -14.0],
];

/* Stylised structural corridors / major lineaments (greenstone belts,
   Ida fault, Pilbara trend). Rendered as dashed polylines. */
export const FAULTS: [number, number][][] = [
  // Norseman–Wiluna belt (Eastern Goldfields)
  [
    [121.6, -26.4],
    [121.7, -27.6],
    [121.4, -28.9],
    [121.5, -30.0],
    [121.2, -30.9],
    [121.7, -32.0],
  ],
  // Ida Fault
  [
    [119.7, -26.8],
    [119.9, -28.4],
    [120.2, -29.8],
    [120.6, -31.4],
  ],
  // Pilbara craton trend
  [
    [116.8, -21.0],
    [118.2, -22.0],
    [119.6, -22.7],
    [120.6, -23.2],
  ],
  // Murchison trend
  [
    [117.2, -26.4],
    [117.9, -27.5],
    [118.6, -28.4],
  ],
];

export const REGIONS: Region[] = [
  {
    id: "pilbara",
    name: "Pilbara",
    lng: 118.6,
    lat: -22.0,
    bounds: [115.8, -24.2, 121.0, -19.6],
    blurb: "Iron ore heartland with emerging lithium & gold corridors.",
  },
  {
    id: "eastgoldfields",
    name: "Eastern Goldfields",
    lng: 122.0,
    lat: -28.4,
    bounds: [120.2, -31.0, 123.6, -26.3],
    blurb: "Premier Archean gold & nickel province along the Norseman–Wiluna belt.",
  },
  {
    id: "kalgoorlie",
    name: "Kalgoorlie",
    lng: 121.47,
    lat: -30.75,
    bounds: [120.5, -31.4, 122.3, -30.0],
    blurb: "Golden Mile district — deep historic endowment, dense title.",
  },
  {
    id: "leonora",
    name: "Leonora",
    lng: 121.33,
    lat: -28.88,
    bounds: [120.4, -29.7, 122.3, -28.0],
    blurb: "High-grade gold & nickel sulphide camp, active consolidation.",
  },
  {
    id: "coolgardie",
    name: "Coolgardie",
    lng: 121.16,
    lat: -30.95,
    bounds: [120.4, -31.5, 121.9, -30.4],
    blurb: "Original goldfield, fragmented legacy prospecting licences.",
  },
  {
    id: "yilgarn",
    name: "Yilgarn",
    lng: 119.3,
    lat: -31.0,
    bounds: [117.4, -32.3, 120.7, -29.5],
    blurb: "Southern Cross greenstone belt — gold, nickel, lithium pegmatites.",
  },
  {
    id: "murchison",
    name: "Murchison",
    lng: 117.8,
    lat: -27.5,
    bounds: [115.9, -29.2, 119.6, -25.9],
    blurb: "Mt Magnet–Cue–Meekatharra gold with rare earth potential.",
  },
  {
    id: "gascoyne",
    name: "Gascoyne",
    lng: 116.2,
    lat: -24.6,
    bounds: [114.2, -26.2, 118.2, -23.0],
    blurb: "Rare earths, copper & base metals in reworked basement.",
  },
  {
    id: "kimberley",
    name: "Kimberley",
    lng: 126.4,
    lat: -16.6,
    bounds: [123.8, -18.6, 129.0, -14.0],
    blurb: "Frontier base metals, diamonds & emerging battery minerals.",
  },
  {
    id: "southwest",
    name: "South West",
    lng: 116.2,
    lat: -33.6,
    bounds: [115.0, -34.7, 117.6, -32.3],
    blurb: "Greenbushes lithium & mineral sands — tightly held, high value.",
  },
];

export const REGION_MAP: Record<RegionId, Region> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
) as Record<RegionId, Region>;

/** Frame bounds → a viewBox transform (centre + scale) for fly-to. */
export function boundsToView(
  bounds: [number, number, number, number],
  pad = 1.35,
): { cx: number; cy: number; scale: number } {
  const [w, s, e, n] = bounds;
  const a = project(w, n);
  const b = project(e, s);
  const bw = Math.abs(b.x - a.x) * pad;
  const bh = Math.abs(b.y - a.y) * pad;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const scale = Math.min(MAP_W / bw, MAP_H / bh);
  return { cx, cy, scale: Math.max(1, Math.min(scale, 9)) };
}
