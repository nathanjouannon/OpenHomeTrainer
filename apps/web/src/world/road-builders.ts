// Road surfaces: asphalt, gravel shoulders, sidewalks with curbs, and their
// procedural textures. Scene frame: X east, Y up, Z south.

import type { Route } from '@hrt/route-engine';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import {
  ROAD_HALF_WIDTH_M,
  SIDEWALK_HEIGHT_M,
  SIDEWALK_WIDTH_M,
  type VillageSpan,
} from './settlements';
import { mulberry32, ROAD_SINK_M } from './world-data';

export const ROAD_WIDTH_M = ROAD_HALF_WIDTH_M * 2;
/** Length of one repetition of the road texture: a 3 m dash every 13 m (French T1 line). */
export const ROAD_TEXTURE_LENGTH_M = 13;
const ASPHALT_Z = 0.04;

export interface RibbonEdge {
  /** Lateral offset from the axis, positive to the right of travel (m). */
  offset: number;
  /** Height above the road axis (m). */
  dz: number;
}

/**
 * Strip following a route between two lateral edges, over [fromM, toM]
 * (the whole lap when omitted). v runs along the road in units of `vScaleM`.
 */
export function buildRibbon(
  route: Route,
  base: number,
  a: RibbonEdge,
  b: RibbonEdge,
  vScaleM: number,
  fromM = 0,
  toM = route.lengthM,
): BufferGeometry {
  const step = route.meta.sampleStepM;
  const count = Math.max(2, Math.ceil((toM - fromM) / step) + 1);
  const positions = new Float32Array(count * 6);
  const uvs = new Float32Array(count * 4);
  for (let k = 0; k < count; k++) {
    const d = Math.min(toM, fromM + k * step);
    const p = route.sampleAt(d);
    const rx = Math.cos(p.heading);
    const ry = -Math.sin(p.heading);
    const z = p.z - base;
    positions.set(
      [
        p.x + rx * a.offset,
        z + a.dz,
        -(p.y + ry * a.offset),
        p.x + rx * b.offset,
        z + b.dz,
        -(p.y + ry * b.offset),
      ],
      k * 6,
    );
    const v = d / vScaleM;
    uvs.set([0, v, 1, v], k * 4);
  }
  const indices: number[] = [];
  for (let k = 0; k < count - 1; k++) {
    const i = k * 2;
    const j = (k + 1) * 2;
    // Counter-clockwise seen from above when a is left of b.
    indices.push(i, i + 1, j, i + 1, j + 1, j);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Asphalt of a whole route. */
export const buildAsphalt = (route: Route, base: number) =>
  buildRibbon(
    route,
    base,
    { offset: -ROAD_HALF_WIDTH_M, dz: ASPHALT_Z },
    { offset: ROAD_HALF_WIDTH_M, dz: ASPHALT_Z },
    ROAD_TEXTURE_LENGTH_M,
  );

/** Gravel shoulders sloping down from the asphalt to the sunk ground. */
export const buildShoulders = (route: Route, base: number): BufferGeometry[] => [
  buildRibbon(
    route,
    base,
    { offset: -ROAD_HALF_WIDTH_M - 1.6, dz: -ROAD_SINK_M - 0.05 },
    { offset: -ROAD_HALF_WIDTH_M + 0.02, dz: ASPHALT_Z - 0.01 },
    4,
  ),
  buildRibbon(
    route,
    base,
    { offset: ROAD_HALF_WIDTH_M - 0.02, dz: ASPHALT_Z - 0.01 },
    { offset: ROAD_HALF_WIDTH_M + 1.6, dz: -ROAD_SINK_M - 0.05 },
    4,
  ),
];

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

/**
 * Asphalt over one texture length (13 m): aggregate grain, darker wheel
 * tracks, patches, dashed centre line and dashed edge lines (French rural road).
 * Returns the colour map and a bump map.
 */
export function asphaltTextures(): { map: CanvasTexture; bump: CanvasTexture } {
  const W = 256;
  const H = 1024; // ≈ 1.27 cm per pixel along the road
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = '#56575a';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 11, 26000, 60, 120, [1, 1, 1.03]);
  // Wheel tracks: slightly darker and smoother bands.
  const rand = mulberry32(5);
  for (const centre of [0.18, 0.36, 0.64, 0.82]) {
    const g = ctx.createLinearGradient(W * (centre - 0.07), 0, W * (centre + 0.07), 0);
    g.addColorStop(0, 'rgba(30,30,32,0)');
    g.addColorStop(0.5, 'rgba(30,30,32,0.22)');
    g.addColorStop(1, 'rgba(30,30,32,0)');
    ctx.fillStyle = g;
    ctx.fillRect(W * (centre - 0.07), 0, W * 0.14, H);
  }
  // Repair patches and cracks.
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(${40 + rand() * 20},${40 + rand() * 20},${44 + rand() * 20},0.35)`;
    ctx.fillRect(rand() * W * 0.8, rand() * H, 20 + rand() * 60, 30 + rand() * 120);
  }
  ctx.strokeStyle = 'rgba(25,25,25,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    let x = rand() * W;
    let y = rand() * H;
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rand() - 0.5) * 18;
      y += rand() * 25;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Markings: worn white paint.
  const paint = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = 'rgba(232,232,224,0.92)';
    ctx.fillRect(x, y, w, h);
  };
  const px = W / ROAD_WIDTH_M; // pixels per meter across
  const py = H / ROAD_TEXTURE_LENGTH_M; // pixels per meter along
  paint(W / 2 - 0.06 * px, 0, 0.12 * px, 3 * py);
  for (const y0 of [0, 6.5]) {
    paint(0.12 * px, y0 * py, 0.15 * px, 3 * py);
    paint(W - 0.27 * px, y0 * py, 0.15 * px, 3 * py);
  }
  const { c: b, ctx: bctx } = canvas(W, H);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, W, H);
  speckle(bctx, W, H, 13, 40000, 40, 220, [1, 1, 1], 1.2);
  return { map: repeating(c), bump: repeating(b, false) };
}

export function gravelTexture(): CanvasTexture {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = '#7a7466';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, 21, 5000, 70, 160, [1, 0.96, 0.88], 2);
  speckle(ctx, 128, 128, 22, 600, 40, 70, [1, 1.05, 0.9], 3);
  return repeating(c);
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
