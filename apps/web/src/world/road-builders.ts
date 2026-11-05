// Road surfaces: asphalt, verges (gravel shoulder, grass slope, ditch),
// sidewalks with curbs, and the procedural textures of the sidewalks. All the
// routes are merged into one geometry per surface (one draw call each).
// Scene frame: X east, Y up, Z south.

import type { Route } from '@hrt/route-engine';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ditchAt, type RoadsideLayout, VERGE_PROFILE } from './roadside';
import {
  ROAD_HALF_WIDTH_M,
  SIDEWALK_HEIGHT_M,
  SIDEWALK_WIDTH_M,
  type VillageSpan,
} from './settlements';
import { mulberry32, ROAD_SINK_M, valueNoise2d } from './world-data';

export const ROAD_WIDTH_M = ROAD_HALF_WIDTH_M * 2;
const ASPHALT_Z = 0.04;
/**
 * Each route's asphalt sits this much above the previous one's, so that two
 * roads overlapping at a fork never fight for the same depth.
 */
const ROUTE_LIFT_M = 0.01;

/**
 * Height of the asphalt of the route at `routeIndex` (order of the routes given
 * to `buildRoadSurfaces`) above the route altitude: what the wheels stand on.
 */
export const asphaltLiftM = (routeIndex: number) => ASPHALT_Z + routeIndex * ROUTE_LIFT_M;

/**
 * Where a road crosses one drawn before it (another route, or its own
 * earlier passage at the same level), its asphalt goes this much higher.
 */
const CROSSING_LIFT_M = 0.008;

/** One column of a strip, at a distance along the route. */
export interface StripColumn {
  /** Lateral offset from the axis, positive to the right of travel (m). */
  offset: number;
  /** Height above the road axis (m). */
  dz: number;
  /** Texture coordinate across the strip. */
  u: number;
}

/**
 * Strip following a route over [fromM, toM], made of `columns` lines of
 * vertices ordered from left to right; `column(d, j)` gives each one. The
 * second texture coordinate is the distance along the route, in metres.
 */
export function buildStrip(
  route: Route,
  base: number,
  columns: number,
  column: (d: number, j: number) => StripColumn,
  fromM = 0,
  toM = route.lengthM,
): BufferGeometry {
  const step = route.meta.sampleStepM;
  const count = Math.max(2, Math.ceil((toM - fromM) / step) + 1);
  const positions = new Float32Array(count * columns * 3);
  const uvs = new Float32Array(count * columns * 2);
  for (let k = 0; k < count; k++) {
    const d = Math.min(toM, fromM + k * step);
    const p = route.sampleAt(d % route.lengthM);
    const rx = Math.cos(p.heading);
    const ry = -Math.sin(p.heading);
    const z = p.z - base;
    for (let j = 0; j < columns; j++) {
      const c = column(d, j);
      const i = k * columns + j;
      positions.set([p.x + rx * c.offset, z + c.dz, -(p.y + ry * c.offset)], i * 3);
      uvs.set([c.u, d], i * 2);
    }
  }
  const indices: number[] = [];
  for (let k = 0; k < count - 1; k++) {
    for (let j = 0; j < columns - 1; j++) {
      const i = k * columns + j;
      const n = i + columns;
      // Counter-clockwise seen from above (column j is left of column j + 1).
      indices.push(i, i + 1, n, i + 1, n + 1, n);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Strip between two lateral edges, u = 0 on the left edge and 1 on the right. */
export const buildRibbon = (
  route: Route,
  base: number,
  a: { offset: number; dz: number },
  b: { offset: number; dz: number },
  vScaleM: number,
  fromM = 0,
  toM = route.lengthM,
): BufferGeometry => {
  const g = buildStrip(
    route,
    base,
    2,
    (_d, j) => (j === 0 ? { ...a, u: 0 } : { ...b, u: 1 }),
    fromM,
    toM,
  );
  if (vScaleM !== 1) {
    const uv = g.getAttribute('uv') as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) / vScaleM);
  }
  return g;
};

/** Stretches [fromM, toM] of a route that no earlier route draws. */
export function ownStretches(route: Route, shared: Uint8Array | undefined): [number, number][] {
  const n = route.pointCount;
  if (!shared) return [[0, route.lengthM]];
  const step = route.lengthM / n;
  const out: [number, number][] = [];
  let from: number | null = null;
  for (let i = 0; i <= n; i++) {
    const own = i < n && !shared[i];
    if (own && from === null) from = i;
    if (!own && from !== null) {
      // Overlap the shared road by one sample so that no gap shows at the fork.
      const a = Math.max(0, from - 1) * step;
      const b = Math.min(n, i) * step;
      if (b - a > step) out.push([a, Math.min(route.lengthM, b)]);
      from = null;
    }
  }
  return out;
}

const mergeAll = (parts: BufferGeometry[]): BufferGeometry | null => {
  if (parts.length === 0) return null;
  const g = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  if (!g) throw new Error('Could not merge the road geometries');
  if (g !== parts[0]) for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
};

/** Terrain attributes at a point, so that the verges blend into the ground. */
export interface GroundSample {
  /** Splat weights of the six terrain layers (0..1, sum 1). */
  splat: number[];
  /** Fallback vertex colour of the terrain. */
  color: [number, number, number];
  /** Texture coordinates of the fallback detail texture. */
  uv: [number, number];
}
export type GroundSampler = (x: number, y: number) => GroundSample;

/** One stretch of verges (both sides), drawn only near the camera. */
export interface VergePiece {
  /** Grass slopes and ditches, with the attributes of the terrain material. */
  ground: BufferGeometry;
  /** Gravel shoulders, u = distance from the asphalt edge (m). */
  gravel: BufferGeometry;
}

export interface RoadSurfaces {
  /** u = lateral offset (m, right positive), v = distance along the route (m). */
  asphalt: BufferGeometry | null;
  verges: VergePiece[];
  sidewalks: BufferGeometry | null;
  curbs: BufferGeometry | null;
}

/** Length of one verge piece along its route (m). */
export const VERGE_PIECE_M = 1000;
/** Index of the terrain's bare-ground layer (TERRAIN_LAYERS), dug out in the ditches. */
const DIRT_LAYER = 2;
/** The gravel lies this much above the grass it overlaps. */
const GRAVEL_LIFT_M = 0.015;

/** Adds the terrain material's attributes (splat0/1, color, uv) to a verge strip. */
function addGroundAttributes(
  g: BufferGeometry,
  ground: GroundSampler,
  columns: number,
  dirtBoost: (d: number, j: number) => number,
) {
  const pos = g.getAttribute('position') as BufferAttribute;
  const along = g.getAttribute('uv') as BufferAttribute;
  const n = pos.count;
  const splat0 = new Uint8Array(n * 3);
  const splat1 = new Uint8Array(n * 3);
  const colors = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const s = ground(pos.getX(i), -pos.getZ(i));
    const w = s.splat.slice();
    w[DIRT_LAYER] = (w[DIRT_LAYER] ?? 0) + dirtBoost(along.getY(i), i % columns);
    const sum = w.reduce((t, v) => t + v, 0) || 1;
    for (let k = 0; k < 3; k++) {
      splat0[i * 3 + k] = Math.round(((w[k] ?? 0) / sum) * 255);
      splat1[i * 3 + k] = Math.round(((w[k + 3] ?? 0) / sum) * 255);
    }
    colors.set(s.color, i * 3);
    uvs.set(s.uv, i * 2);
  }
  g.setAttribute('splat0', new BufferAttribute(splat0, 3, true));
  g.setAttribute('splat1', new BufferAttribute(splat1, 3, true));
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
}

const alongNoise = valueNoise2d(43);
const groundNoise = valueNoise2d(47);
/** Length of a resurfacing section of the asphalt, on average (m). */
export const ASPHALT_SECTION_M = 150;

/**
 * Smooth noises of the asphalt shader that vary slowly enough to be computed
 * per vertex (every 5 m), rather than per pixel:
 *   - roadNoise.x: section coordinate (one unit per resurfacing section,
 *     its length varied by a noise); .y, .z, .w: noises with ~20 m features
 *     along the road (wheel tracks, longitudinal cracks, edge cracks);
 *   - roadTint: brightness variation with ~16 m features over the ground.
 */
function addAsphaltNoise(g: BufferGeometry): BufferGeometry {
  const pos = g.getAttribute('position') as BufferAttribute;
  const uv = g.getAttribute('uv') as BufferAttribute;
  const n = pos.count;
  const along = new Float32Array(n * 4);
  const tint = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = uv.getY(i);
    along[i * 4] = d / ASPHALT_SECTION_M + alongNoise(d / 250, 0.37) - 0.5;
    along[i * 4 + 1] = alongNoise(d / 20, 11.3);
    along[i * 4 + 2] = alongNoise(d / 20, 23.9);
    along[i * 4 + 3] = alongNoise(d / 20, 31.1);
    tint[i] = groundNoise(pos.getX(i) / 16, pos.getZ(i) / 16);
  }
  g.setAttribute('roadNoise', new BufferAttribute(along, 4));
  g.setAttribute('roadTint', new BufferAttribute(tint, 1));
  return g;
}

/** Asphalt, verges, sidewalks and curbs of all the routes. */
export function buildRoadSurfaces(
  routes: readonly Route[],
  base: number,
  layout: Pick<RoadsideLayout, 'shared' | 'ditch' | 'crossing'>,
  spans: readonly VillageSpan[],
  ground: GroundSampler,
): RoadSurfaces {
  const asphalt: BufferGeometry[] = [];
  const verges: VergePiece[] = [];
  const tops: BufferGeometry[] = [];
  const curbs: BufferGeometry[] = [];
  // Grass slope from the end of the shoulder (column 1) outwards; the gravel
  // covers columns 0 to 2, lifted a little above the grass on column 2.
  const groundCols = VERGE_PROFILE.slice(1);
  const gravelCols = VERGE_PROFILE.slice(0, 3);
  routes.forEach((route, ri) => {
    const lift = asphaltLiftM(ri);
    const step = route.lengthM / route.pointCount;
    const ditch = layout.ditch.get(route.id);
    const depthAt = (side: 1 | -1, d: number) => {
      const depth = ditch?.[side === 1 ? 0 : 1];
      return depth ? ditchAt(depth, step, d % route.lengthM) : 0;
    };
    const column = (
      cols: readonly (typeof VERGE_PROFILE)[number][],
      side: 1 | -1,
      d: number,
      j: number,
      dzLast = 0,
    ): StripColumn => {
      const last = cols.length - 1;
      // Columns run from left to right: outwards on the right side.
      const k = side === 1 ? j : last - j;
      const c = cols[k] as (typeof VERGE_PROFILE)[number];
      const f = depthAt(side, d);
      return {
        offset: side * c.offsetM,
        dz: c.flat + (c.ditch - c.flat) * f + (k === last ? dzLast : 0),
        u: c.offsetM - ROAD_HALF_WIDTH_M,
      };
    };
    const crossing = layout.crossing?.get(route.id);
    const n = route.pointCount;
    const liftAt = (d: number) =>
      lift + (crossing?.[Math.round(d / step) % n] ? CROSSING_LIFT_M : 0);
    for (const [from, to] of ownStretches(route, layout.shared.get(route.id))) {
      asphalt.push(
        addAsphaltNoise(
          buildStrip(
            route,
            base,
            2,
            (d, j) => {
              const offset = j === 0 ? -ROAD_HALF_WIDTH_M : ROAD_HALF_WIDTH_M;
              return { offset, dz: liftAt(d), u: offset };
            },
            from,
            to,
          ),
        ),
      );
      const pieces = Math.max(1, Math.round((to - from) / VERGE_PIECE_M));
      for (let p = 0; p < pieces; p++) {
        const a = from + ((to - from) * p) / pieces;
        const b = from + ((to - from) * (p + 1)) / pieces;
        const groundParts: BufferGeometry[] = [];
        const gravelParts: BufferGeometry[] = [];
        for (const side of [1, -1] as const) {
          const g = buildStrip(
            route,
            base,
            groundCols.length,
            (d, j) => column(groundCols, side, d, j),
            a,
            b,
          );
          // The bottom of the ditches is bare ground.
          const bottom = side === 1 ? 2 : groundCols.length - 3;
          addGroundAttributes(g, ground, groundCols.length, (d, j) =>
            j === bottom ? depthAt(side, d) * 0.6 : 0,
          );
          groundParts.push(g);
          gravelParts.push(
            buildStrip(
              route,
              base,
              gravelCols.length,
              (d, j) => column(gravelCols, side, d, j, GRAVEL_LIFT_M),
              a,
              b,
            ),
          );
        }
        const groundGeometry = mergeAll(groundParts);
        const gravelGeometry = mergeAll(gravelParts);
        if (groundGeometry && gravelGeometry) {
          verges.push({ ground: groundGeometry, gravel: gravelGeometry });
        }
      }
    }
  });
  for (const span of spans) {
    const r = routes.find((x) => x.id === span.routeId);
    if (!r) continue;
    const s = buildSidewalks(r, base, span);
    tops.push(...s.tops);
    curbs.push(...s.curbs);
  }
  return {
    asphalt: mergeAll(asphalt),
    verges,
    sidewalks: mergeAll(tops),
    curbs: mergeAll(curbs),
  };
}

/** Sidewalk tops and curb faces of a village span, both sides. */
export function buildSidewalks(route: Route, base: number, span: VillageSpan) {
  const h = SIDEWALK_HEIGHT_M + ASPHALT_Z;
  const tops: BufferGeometry[] = [];
  const curbs: BufferGeometry[] = [];
  for (const side of [1, -1] as const) {
    const inner = side * ROAD_HALF_WIDTH_M;
    const outer = side * (ROAD_HALF_WIDTH_M + SIDEWALK_WIDTH_M);
    const [l, r] = side === 1 ? [inner, outer] : [outer, inner];
    tops.push(
      buildRibbon(
        route,
        base,
        { offset: l, dz: h },
        { offset: r, dz: h },
        1.5,
        span.fromM,
        span.toM,
      ),
    );
    // Curb face on the road side, and the outer face down into the ground.
    curbs.push(
      buildRibbon(
        route,
        base,
        { offset: inner, dz: ASPHALT_Z - 0.02 },
        { offset: inner, dz: h },
        1,
        span.fromM,
        span.toM,
      ),
      buildRibbon(
        route,
        base,
        { offset: outer, dz: h },
        { offset: outer, dz: -ROAD_SINK_M - 0.6 },
        1,
        span.fromM,
        span.toM,
      ),
    );
  }
  return { tops, curbs };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { c, ctx };
}

function repeating(c: HTMLCanvasElement, color = true): CanvasTexture {
  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  if (color) tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Speckled noise over a base colour. */
function speckle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: number,
  count: number,
  lo: number,
  hi: number,
  tint: [number, number, number] = [1, 1, 1],
  size = 1.5,
) {
  const rand = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const v = lo + rand() * (hi - lo);
    ctx.fillStyle = `rgb(${v * tint[0]},${v * tint[1]},${v * tint[2]})`;
    ctx.fillRect(rand() * w, rand() * h, size, size);
  }
}

/** Concrete slabs with joints every 1.5 m. */
export function sidewalkTexture(): CanvasTexture {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = '#a9a7a1';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, 31, 3000, 140, 190);
  ctx.fillStyle = 'rgba(70,70,70,0.6)';
  ctx.fillRect(0, 0, 128, 2);
  return repeating(c);
}

export function curbTexture(): CanvasTexture {
  const { c, ctx } = canvas(64, 64);
  ctx.fillStyle = '#c9c7c0';
  ctx.fillRect(0, 0, 64, 64);
  speckle(ctx, 64, 64, 41, 800, 150, 210);
  ctx.fillStyle = 'rgba(60,60,60,0.5)';
  ctx.fillRect(0, 0, 64, 1);
  return repeating(c);
}
