// Geometry of the buildings (lot 2.16): plain-land houses, chalets, barns,
// and the gardens in front of them. Every building of the world is merged
// into six meshes (plaster, wood, stone, roofs, painted details, fences):
// six draw calls whatever the number of buildings.
// Scene frame: X east, Y up (altitude − base), Z south.

import {
  type BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import type { BuildingStyle, Lot } from './building-styles';
import {
  canvas,
  MeshBuilder,
  ROOF_COLORS,
  roofTexture,
  texture,
  WALL_COLORS,
} from './prop-builders';
import type { Building } from './settlements';
import { mulberry32 } from './world-data';

// Texture tiles, in metres.
const PLASTER_TILE = 4;
const WOOD_TILE = 1.6;
const STONE_TILE = 2;

/** The plinth goes this far under the lowest ground (bilinear vs mesh terrain). */
const PLINTH_BURY_M = 0.6;
/** Height of the stone plinth above the ground floor (m). */
const PLINTH_TOP_M = 0.45;
/** Height of a ground-floor storey (m). */
const STOREY_M = 3;

const WOOD_COLORS = [
  '#8c5f3d',
  '#b58a5c',
  '#c7a67a',
  '#6e4b34',
  '#9b7752',
  '#d3b88d',
  '#7f5c42',
  '#a98560',
];
const CHALET_ROOFS = ['#4e5258', '#7d8085', '#5b4636', '#3f4348'];
const SHUTTER_COLORS = [
  '#4f6e5a',
  '#8b2e2a',
  '#2f4f7a',
  '#c9a24a',
  '#e8e4da',
  '#5a4a3a',
  '#7a8f6a',
  '#a05a2c',
];
const DOOR_COLORS = ['#5a3a28', '#2f4f7a', '#8b2e2a', '#3d5a45', '#2b2d30', '#7a5a3a'];
const STONE_COLOR = '#a8a196';
const GLASS = '#34414d';
const WHITE = '#f3f0e9';
const DARK = '#2a2c2f';

type Rect = { a0: number; a1: number; f0: number; f1: number };
type Face = 'front' | 'right' | 'back' | 'left';
/** A wall seen from outside: start corner, direction to the right, outward normal. */
interface Seg {
  a: number;
  f: number;
  ua: number;
  uf: number;
  na: number;
  nf: number;
  len: number;
}
type Segs = Record<Face, Seg>;
type P3 = number[];
export interface Door {
  /** Position of the front door in the frame of the building (a: along the width, f: towards the road). */
  a: number;
  f: number;
}
interface Parts {
  plaster: MeshBuilder;
  wood: MeshBuilder;
  stone: MeshBuilder;
  roofs: MeshBuilder;
  plain: MeshBuilder;
  fence: MeshBuilder;
}
interface WindowOptions {
  frame?: string;
  shutter?: string | null;
  w?: number;
  h?: number;
  /** Fixed height of the sill above the storey floor, m. */
  sill?: number;
  big?: boolean;
}

const ZERO_UV = [
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
];
const c = (hex: string, mul = 1) => new Color(hex).multiplyScalar(mul);

/** Fence texture: v 0..0.45 is a picket fence, v 0.55..1 vertical slats. */
const FENCE_PICKET: [number, number] = [0.02, 0.43];
const FENCE_SLATS: [number, number] = [0.57, 0.98];

class Kit {
  readonly W: number;
  readonly D: number;
  readonly H: number;
  readonly R: number;
  readonly foot: number;
  readonly wall: Color;
  readonly roof: Color;
  readonly wood: Color;
  readonly rng: () => number;
  private readonly rx: number;
  private readonly ry: number;
  private readonly fx: number;
  private readonly fy: number;

  constructor(
    readonly b: Building,
    private readonly base: number,
    readonly m: Parts,
  ) {
    this.W = b.width / 2;
    this.D = b.depth / 2;
    this.H = b.wallHeight;
    this.R = b.roofHeight;
    this.foot = Math.min(-0.3, b.groundM - b.z - PLINTH_BURY_M);
    this.rx = Math.cos(b.yaw);
    this.ry = -Math.sin(b.yaw);
    this.fx = Math.sin(b.yaw);
    this.fy = Math.cos(b.yaw);
    this.wall = c(WALL_COLORS[b.wallTint % WALL_COLORS.length] ?? WHITE);
    const chalet = b.style.startsWith('chalet') || b.style === 'barn-alpine';
    this.roof = c((chalet ? CHALET_ROOFS : ROOF_COLORS)[b.roofTint % 4] ?? '#999999');
    this.wood = c(WOOD_COLORS[b.wallTint % WOOD_COLORS.length] ?? '#8c5f3d');
    this.rng = mulberry32(
      (Math.round(b.x * 10) * 73856093) ^ (Math.round(b.y * 10) * 19349663) ^ 0x2016,
    );
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rng() * list.length) % list.length] as T;
  }

  // ----- Frame -----

  P(a: number, f: number, h: number): P3 {
    return [
      this.b.x + this.rx * a + this.fx * f,
      this.b.z - this.base + h,
      -(this.b.y + this.ry * a + this.fy * f),
    ];
  }

  segs(r: Rect): Segs {
    return {
      front: { a: r.a0, f: r.f1, ua: 1, uf: 0, na: 0, nf: 1, len: r.a1 - r.a0 },
      right: { a: r.a1, f: r.f1, ua: 0, uf: -1, na: 1, nf: 0, len: r.f1 - r.f0 },
      back: { a: r.a1, f: r.f0, ua: -1, uf: 0, na: 0, nf: -1, len: r.a1 - r.a0 },
      left: { a: r.a0, f: r.f0, ua: 0, uf: 1, na: -1, nf: 0, len: r.f1 - r.f0 },
    };
  }

  pt(s: Seg, t: number, h: number, out = 0): P3 {
    return this.P(s.a + s.ua * t + s.na * out, s.f + s.uf * t + s.nf * out, h);
  }

  /** Local (a, f) of a point of a wall. */
  at(s: Seg, t: number, out = 0): { a: number; f: number } {
    return { a: s.a + s.ua * t + s.na * out, f: s.f + s.uf * t + s.nf * out };
  }

  // ----- Primitives -----

  /** A vertical rectangle on a wall (t along it, h up), `out` metres in front of it. */
  panel(
    mb: MeshBuilder,
    s: Seg,
    t0: number,
    t1: number,
    h0: number,
    h1: number,
    out: number,
    color: Color,
    uv?: { tile: number; vb?: number; vt?: number },
  ) {
    const br = this.pt(s, t1, h0, out);
    const bl = this.pt(s, t0, h0, out);
    const tl = this.pt(s, t0, h1, out);
    const tr = this.pt(s, t1, h1, out);
    let uvs = ZERO_UV;
    if (uv) {
      const vb = uv.vb ?? h0 / uv.tile;
      const vt = uv.vt ?? h1 / uv.tile;
      uvs = [
        [t1 / uv.tile, vb],
        [t0 / uv.tile, vb],
        [t0 / uv.tile, vt],
        [t1 / uv.tile, vt],
      ];
    }
    mb.quad(br, bl, tl, tr, uvs, color);
  }

  /** Box from a function of its corner flags (i: along, j: out, k: up). */
  private boxPts(
    mb: MeshBuilder,
    p: (i: number, j: number, k: number) => P3,
    du: number,
    dv: number,
    dh: number,
    color: Color,
    tile: number,
  ) {
    const q = (a: P3, b: P3, c2: P3, d: P3, w: number, h: number) =>
      mb.quad(
        a,
        b,
        c2,
        d,
        tile > 0
          ? [
              [0, 0],
              [w / tile, 0],
              [w / tile, h / tile],
              [0, h / tile],
            ]
          : ZERO_UV,
        color,
      );
    q(p(1, 1, 0), p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), du, dh);
    q(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1), du, dh);
    q(p(0, 1, 0), p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), dv, dh);
    q(p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1), dv, dh);
    q(p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1), du, dv);
  }

  box(mb: MeshBuilder, r: Rect, h0: number, h1: number, color: Color, tile = 0) {
    this.boxPts(
      mb,
      (i, j, k) => this.P(i ? r.a1 : r.a0, j ? r.f1 : r.f0, k ? h1 : h0),
      r.a1 - r.a0,
      r.f1 - r.f0,
      h1 - h0,
      color,
      tile,
    );
  }

  /** Box in the frame of a wall: t along it, `o` out from it. */
  boxSeg(
    mb: MeshBuilder,
    s: Seg,
    t0: number,
    t1: number,
    o0: number,
    o1: number,
    h0: number,
    h1: number,
    color: Color,
    tile = 0,
  ) {
    this.boxPts(
      mb,
      (i, j, k) => this.pt(s, i ? t1 : t0, k ? h1 : h0, j ? o1 : o0),
      t1 - t0,
      o1 - o0,
      h1 - h0,
      color,
      tile,
    );
  }

  /** Flat quad from four (a, f) corners at one height. */
  flat(mb: MeshBuilder, pts: [number, number][], h: number | number[], color: Color) {
    const hs = Array.isArray(h) ? h : [h, h, h, h];
    const [p0, p1, p2, p3] = pts.map(([a, f], i) => this.P(a, f, hs[i] ?? 0)) as [P3, P3, P3, P3];
    mb.quad(p0, p1, p2, p3, ZERO_UV, color);
  }

  // ----- Walls -----

  /** The four walls of a block between two heights; returns their segments. */
  walls(
    r: Rect,
    h0: number,
    h1: number,
    kind: 'plaster' | 'wood' | 'stone',
    color: Color,
    skip: Face[] = [],
  ): Segs {
    const segs = this.segs(r);
    const mb = this.m[kind];
    const tile = kind === 'plaster' ? PLASTER_TILE : kind === 'wood' ? WOOD_TILE : STONE_TILE;
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      if (skip.includes(face)) continue;
      const s = segs[face];
      this.panel(mb, s, 0, s.len, h0, h1, 0, color, { tile });
    }
    return segs;
  }

  /** Stone plinth from under the lowest ground to a little above the floor. */
  plinth(r: Rect, skip: Face[] = []) {
    this.walls(r, this.foot, PLINTH_TOP_M, 'stone', c(STONE_COLOR, 0.95), skip);
  }

  /** A triangle of wall above a wall: base at height h from t0 to t1, apex at (tm, hTop). */
  gableTri(
    kind: 'plaster' | 'wood',
    s: Seg,
    t0: number,
    t1: number,
    h: number,
    hTop: number,
    color: Color,
    out = 0,
  ) {
    const tile = kind === 'plaster' ? PLASTER_TILE : WOOD_TILE;
    this.m[kind].tri(
      this.pt(s, t0, h, out),
      this.pt(s, t1, h, out),
      this.pt(s, (t0 + t1) / 2, hTop, out),
      [t0 / tile, h / tile],
      [t1 / tile, h / tile],
      [(t0 + t1) / 2 / tile, hTop / tile],
      color,
    );
  }

  // ----- Roofs -----

  /**
   * Gable roof. `ridge` 'a': the ridge runs along the width (slopes to the
   * front and the back), 'f': along the depth (the gable faces the street).
   */
  gableRoof(
    r: Rect,
    he: number,
    rise: number,
    over: number,
    ridge: 'a' | 'f',
    roof: Color,
    gable: 'plaster' | 'wood' | null,
    gableColor: Color,
  ) {
    const along = ridge === 'a';
    const u0 = along ? r.f0 : r.a0;
    const u1 = along ? r.f1 : r.a1;
    const v0 = along ? r.a0 : r.f0;
    const v1 = along ? r.a1 : r.f1;
    const X = (u: number, v: number, h: number) => (along ? this.P(v, u, h) : this.P(u, v, h));
    const um = (u0 + u1) / 2;
    const half = (u1 - u0) / 2;
    const lift = over * (rise / half);
    const slope = Math.hypot(half + over, rise + lift);
    const len = v1 - v0 + 2 * over;
    for (const side of [1, -1]) {
      const ue = side === 1 ? u1 + over : u0 - over;
      const q0 = X(ue, v0 - over, he - lift);
      const q1 = X(ue, v1 + over, he - lift);
      const q2 = X(um, v1 + over, he + rise);
      const q3 = X(um, v0 - over, he + rise);
      const uvs = [
        [0, 0],
        [len, 0],
        [len, slope],
        [0, slope],
      ];
      if (side === 1) this.m.roofs.quad(q0, q1, q2, q3, uvs, roof);
      else this.m.roofs.quad(q1, q0, q3, q2, uvs, roof);
    }
    if (!gable) return;
    const tile = gable === 'plaster' ? PLASTER_TILE : WOOD_TILE;
    for (const v of [v0, v1]) {
      this.m[gable].tri(
        X(u1, v, he),
        X(u0, v, he),
        X(um, v, he + rise),
        [u1 / tile, he / tile],
        [u0 / tile, he / tile],
        [um / tile, (he + rise) / tile],
        gableColor,
      );
    }
  }

  /** Quads between two nested rectangles at two heights (a hip roof, a mansard). */
  ring(e: Rect, he: number, i: Rect, hi: number, color: Color) {
    const slope = Math.hypot(hi - he, Math.min(i.a0 - e.a0, i.f0 - e.f0, 4));
    const P = (a: number, f: number, h: number) => this.P(a, f, h);
    const q = (p0: P3, p1: P3, p2: P3, p3: P3, bottom: number, top: number) =>
      this.m.roofs.quad(
        p0,
        p1,
        p2,
        p3,
        [
          [0, 0],
          [bottom, 0],
          [top, slope],
          [0, slope],
        ],
        color,
      );
    q(
      P(e.a0, e.f1, he),
      P(e.a1, e.f1, he),
      P(i.a1, i.f1, hi),
      P(i.a0, i.f1, hi),
      e.a1 - e.a0,
      i.a1 - i.a0,
    );
    q(
      P(e.a1, e.f1, he),
      P(e.a1, e.f0, he),
      P(i.a1, i.f0, hi),
      P(i.a1, i.f1, hi),
      e.f1 - e.f0,
      i.f1 - i.f0,
    );
    q(
      P(e.a1, e.f0, he),
      P(e.a0, e.f0, he),
      P(i.a0, i.f0, hi),
      P(i.a1, i.f0, hi),
      e.a1 - e.a0,
      i.a1 - i.a0,
    );
    q(
      P(e.a0, e.f0, he),
      P(e.a0, e.f1, he),
      P(i.a0, i.f1, hi),
      P(i.a0, i.f0, hi),
      e.f1 - e.f0,
      i.f1 - i.f0,
    );
  }

  expand(r: Rect, o: number): Rect {
    return { a0: r.a0 - o, a1: r.a1 + o, f0: r.f0 - o, f1: r.f1 + o };
  }

  /** Hip roof; the ridge runs along the longer side. Returns the ridge rectangle. */
  hipRoof(r: Rect, he: number, rise: number, over: number, roof: Color): Rect {
    const ha = (r.a1 - r.a0) / 2;
    const hf = (r.f1 - r.f0) / 2;
    const short = Math.min(ha, hf);
    const lift = over * (rise / short);
    const am = (r.a0 + r.a1) / 2;
    const fm = (r.f0 + r.f1) / 2;
    const ridge: Rect =
      ha >= hf
        ? { a0: r.a0 + hf, a1: r.a1 - hf, f0: fm, f1: fm }
        : { a0: am, a1: am, f0: r.f0 + ha, f1: r.f1 - ha };
    this.ring(this.expand(r, over), he - lift, ridge, he + rise, roof);
    return ridge;
  }

  /** Mansard roof with a flat top: a steep ring, then a flat lid. */
  mansardRoof(r: Rect, he: number, rise: number, inset: number, roof: Color) {
    const inner: Rect = {
      a0: r.a0 + inset,
      a1: r.a1 - inset,
      f0: r.f0 + inset,
      f1: r.f1 - inset,
    };
    this.ring(this.expand(r, 0.3), he, inner, he + rise, roof);
    this.flat(
      this.m.roofs,
      [
        [inner.a0, inner.f1],
        [inner.a1, inner.f1],
        [inner.a1, inner.f0],
        [inner.a0, inner.f0],
      ],
      he + rise,
      roof,
    );
  }

  /** Flat roof: white fascia slab and a dark membrane. */
  flatRoof(r: Rect, h: number, over: number, fascia = c(WHITE)) {
    this.box(this.m.plain, this.expand(r, over), h, h + 0.3, fascia);
    this.flat(
      this.m.plain,
      [
        [r.a0 - over + 0.2, r.f1 + over - 0.2],
        [r.a1 + over - 0.2, r.f1 + over - 0.2],
        [r.a1 + over - 0.2, r.f0 - over + 0.2],
        [r.a0 - over + 0.2, r.f0 - over + 0.2],
      ],
      h + 0.31,
      c('#4a4d52'),
    );
  }

  chimney(a: number, f: number, h0: number, h1: number) {
    const r = { a0: a - 0.35, a1: a + 0.35, f0: f - 0.35, f1: f + 0.35 };
    this.box(this.m.stone, r, h0, h1, c('#9a8f84'), STONE_TILE);
    this.box(this.m.plain, this.expand(r, 0.1), h1, h1 + 0.12, c('#5e5a55'));
  }

  // ----- Openings -----

  window(s: Seg, t: number, h0: number, o: WindowOptions = {}) {
    const w = o.w ?? 1;
    const h = o.h ?? 1.4;
    const frame = c(o.frame ?? WHITE);
    const mb = this.m.plain;
    this.panel(mb, s, t - w / 2 - 0.09, t + w / 2 + 0.09, h0 - 0.09, h0 + h + 0.09, 0.02, frame);
    this.panel(mb, s, t - w / 2, t + w / 2, h0, h0 + h, 0.045, c(GLASS));
    this.panel(mb, s, t - 0.025, t + 0.025, h0, h0 + h, 0.06, frame);
    if (h > 1.3 && !o.big) {
      this.panel(mb, s, t - w / 2, t + w / 2, h0 + h * 0.62, h0 + h * 0.62 + 0.05, 0.06, frame);
    }
    if (o.shutter) {
      const sc = c(o.shutter);
      for (const side of [-1, 1]) {
        const t0 = t + side * (w / 2 + 0.1);
        this.panel(
          mb,
          s,
          Math.min(t0, t0 + side * 0.45),
          Math.max(t0, t0 + side * 0.45),
          h0 - 0.05,
          h0 + h + 0.05,
          0.03,
          sc,
        );
      }
    }
  }

  /**
   * Windows of the storeys between two heights: evenly spaced, skipping
   * `skip` ranges of t. An odd count centres a bay on the wall.
   */
  facade(
    s: Seg,
    h0: number,
    h1: number,
    o: WindowOptions & { skip?: [number, number][]; odd?: boolean; floors?: number } = {},
  ) {
    const floors = o.floors ?? Math.max(1, Math.round((h1 - h0) / STOREY_M));
    const sh = (h1 - h0) / floors;
    let n = Math.max(1, Math.round(s.len / 3.1));
    if (o.odd && n % 2 === 0) n += s.len / 3.1 > n ? 1 : -1;
    n = Math.max(1, n);
    if (s.len < 2) return;
    const w = o.w ?? 1;
    for (let k = 0; k < floors; k++) {
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) * s.len) / n;
        if (o.skip?.some(([a, b]) => t + w / 2 + 0.3 > a && t - w / 2 - 0.3 < b)) continue;
        const h = o.h ?? Math.min(1.5, sh - 1.4);
        const sill = o.sill ?? Math.max(0.5, (sh - h) / 2 - 0.1);
        this.window(s, t, h0 + k * sh + sill, { ...o, h });
      }
    }
  }

  door(s: Seg, t: number, color: Color, canopy = true): Door {
    const mb = this.m.plain;
    const frame = c(WHITE);
    this.panel(mb, s, t - 0.68, t + 0.68, 0, 2.28, 0.02, frame);
    this.panel(mb, s, t - 0.55, t + 0.55, 0, 2.15, 0.045, color);
    this.panel(mb, s, t - 0.12, t + 0.12, 1.0, 1.1, 0.07, c('#d8c27a'));
    if (canopy) this.boxSeg(mb, s, t - 1.05, t + 1.05, 0, 1.1, 2.45, 2.6, c(WHITE));
    return this.at(s, t);
  }

  /** A dormer window sitting in a roof above a wall. */
  dormer(s: Seg, t: number, h0: number, wall: Color, roof: Color) {
    const mb = this.m.plaster;
    this.boxSeg(mb, s, t - 0.65, t + 0.65, -1.3, 0.05, h0, h0 + 1.6, wall, PLASTER_TILE);
    this.window(s, t, h0 + 0.2, { w: 0.8, h: 1.1 });
    this.gableTri('plaster', s, t - 0.65, t + 0.65, h0 + 1.6, h0 + 2.3, wall, 0.05);
    for (const side of [-1, 1]) {
      this.m.roofs.quad(
        this.pt(s, t + side * 0.85, h0 + 1.45, 0.3),
        this.pt(s, t + side * 0.85, h0 + 1.45, -1.3),
        this.pt(s, t, h0 + 2.4, -1.3),
        this.pt(s, t, h0 + 2.4, 0.3),
        [
          [0, 0],
          [1.6, 0],
          [1.6, 1],
          [0, 1],
        ],
        roof,
      );
    }
  }

  /** Balcony: deck, posts and a railing (picket, or glass). */
  balcony(
    s: Seg,
    t0: number,
    t1: number,
    h: number,
    out: number,
    wood: Color,
    glass = false,
    sides = true,
  ) {
    this.boxSeg(this.m.plain, s, t0, t1, 0, out, h - 0.18, h, wood);
    for (const t of [t0 + 0.1, t1 - 0.1]) {
      this.boxSeg(
        this.m.plain,
        s,
        t - 0.07,
        t + 0.07,
        out - 0.2,
        out - 0.06,
        this.foot,
        h - 0.18,
        wood,
      );
    }
    const rail = (a: P3, b: P3, len: number) => {
      const top = [a[0] as number, (a[1] as number) + 1, a[2] as number];
      const topB = [b[0] as number, (b[1] as number) + 1, b[2] as number];
      if (glass) {
        this.m.plain.quad(a, b, topB, top, ZERO_UV, c('#a9c0cc'));
      } else {
        this.m.fence.quad(
          a,
          b,
          topB,
          top,
          [
            [0, FENCE_PICKET[0]],
            [len / 1, FENCE_PICKET[0]],
            [len / 1, FENCE_PICKET[1]],
            [0, FENCE_PICKET[1]],
          ],
          wood,
        );
      }
    };
    rail(this.pt(s, t0, h, out), this.pt(s, t1, h, out), t1 - t0);
    if (sides) {
      rail(this.pt(s, t0, h, 0), this.pt(s, t0, h, out), out);
      rail(this.pt(s, t1, h, out), this.pt(s, t1, h, 0), out);
    }
  }

  /** Window of a whole glazed front: glass, dark frame and mullions. */
  glazing(s: Seg, t0: number, t1: number, h0: number, h1: number, out = 0.04, bars = 3) {
    const frame = c(DARK);
    const mb = this.m.plain;
    this.panel(mb, s, t0 - 0.08, t1 + 0.08, h0 - 0.08, h1 + 0.08, out - 0.02, frame);
    this.panel(mb, s, t0, t1, h0, h1, out, c(GLASS));
    for (let i = 1; i <= bars; i++) {
      const t = t0 + ((t1 - t0) * i) / (bars + 1);
      this.panel(mb, s, t - 0.04, t + 0.04, h0, h1, out + 0.02, frame);
    }
    const mid = (h0 + h1) / 2;
    this.panel(mb, s, t0, t1, mid - 0.04, mid + 0.04, out + 0.02, frame);
  }

  /** A square pillar in the frame of a wall. */
  pillar(s: Seg, t: number, out: number, h0: number, h1: number, color: Color) {
    this.boxSeg(this.m.plain, s, t - 0.15, t + 0.15, out - 0.15, out + 0.15, h0, h1, color);
  }
}

// ---------------------------------------------------------------------------
// Styles. Each draws one building in the frame of the building and returns
// the position of the front door. Local frame: a to the right of the facade,
// f towards the road, h up from the ground floor.
// ---------------------------------------------------------------------------

type StyleFn = (k: Kit) => Door;

const fullRect = (k: Kit): Rect => ({ a0: -k.W, a1: k.W, f0: -k.D, f1: k.D });

/** Windows on the four walls of a block; the front gets a central door on the ground floor. */
function dressedBlock(
  k: Kit,
  segs: Segs,
  h0: number,
  h1: number,
  o: WindowOptions,
  doorColor: Color,
  canopy = true,
): Door {
  const front = segs.front;
  const dt = front.len / 2;
  const floors = Math.max(1, Math.round((h1 - h0) / STOREY_M));
  const sh = (h1 - h0) / floors;
  // Ground floor of the front: skip the bay of the door.
  k.facade(front, h0, h0 + sh, { ...o, odd: true, skip: [[dt - 1.6, dt + 1.6]], floors: 1 });
  if (floors > 1) k.facade(front, h0 + sh, h1, { ...o, odd: true, floors: floors - 1 });
  for (const face of ['right', 'back', 'left'] as const) k.facade(segs[face], h0, h1, o);
  return k.door(front, dt, doorColor, canopy);
}

const gable: StyleFn = (k) => {
  const r = fullRect(k);
  k.plinth(r);
  const segs = k.walls(r, PLINTH_TOP_M, k.H, 'plaster', k.wall);
  const door = dressedBlock(
    k,
    segs,
    PLINTH_TOP_M,
    k.H,
    { shutter: k.pick(SHUTTER_COLORS) },
    c(k.pick(DOOR_COLORS)),
  );
  k.gableRoof(r, k.H, k.R, 0.45, 'a', k.roof, 'plaster', k.wall);
  k.chimney(k.W * 0.45, 0, k.H, k.H + k.R + 0.7);
  return door;
};

const hip: StyleFn = (k) => {
  const r = fullRect(k);
  k.plinth(r);
  const segs = k.walls(r, PLINTH_TOP_M, k.H, 'plaster', k.wall);
  const door = dressedBlock(
    k,
    segs,
    PLINTH_TOP_M,
    k.H,
    { shutter: k.pick(SHUTTER_COLORS) },
    c(k.pick(DOOR_COLORS)),
  );
  const ridge = k.hipRoof(r, k.H, k.R, 0.6, k.roof);
  k.chimney(ridge.a1 * 0.7, 0, k.H, k.H + k.R + 0.6);
  return door;
};

const villa: StyleFn = (k) => {
  const r = fullRect(k);
  const wall = k.wall.clone().lerp(c(WHITE), 0.45);
  k.plinth(r);
  const segs = k.walls(r, PLINTH_TOP_M, k.H, 'plaster', wall);
  const door = dressedBlock(
    k,
    segs,
    PLINTH_TOP_M,
    k.H,
    { h: 1.7, shutter: null },
    c(k.pick(DOOR_COLORS)),
    false,
  );
  // Cornice, porch with pillars.
  k.box(k.m.plain, k.expand(r, 0.15), k.H - 0.3, k.H, c(WHITE));
  const f = segs.front;
  const dt = f.len / 2;
  for (const t of [dt - 0.85, dt + 0.85]) k.pillar(f, t, 1.0, 0, 2.6, c(WHITE));
  k.boxSeg(k.m.plain, f, dt - 1.15, dt + 1.15, 0, 1.2, 2.6, 2.85, c(WHITE));
  const rise = k.R * 0.85;
  const inset = Math.min(1.6, k.W * 0.3, k.D * 0.3);
  k.mansardRoof(r, k.H, rise, inset, k.roof);
  // Dormers on the front and the back, one on each side.
  for (const t of [f.len * 0.28, f.len * 0.72]) k.dormer(f, t, k.H + 0.3, wall, k.roof);
  for (const t of [segs.back.len * 0.28, segs.back.len * 0.72])
    k.dormer(segs.back, t, k.H + 0.3, wall, k.roof);
  k.dormer(segs.right, segs.right.len / 2, k.H + 0.3, wall, k.roof);
  k.dormer(segs.left, segs.left.len / 2, k.H + 0.3, wall, k.roof);
  const top = k.H + rise;
  k.chimney(-k.W + inset + 0.8, 0, top - 0.2, top + 1.3);
  k.chimney(k.W - inset - 0.8, 0, top - 0.2, top + 1.3);
  return door;
};

const gables: StyleFn = (k) => {
  const r = fullRect(k);
  k.plinth(r);
  const wall = k.wall.clone().lerp(c(WHITE), 0.5);
  const segs = k.walls(r, PLINTH_TOP_M, k.H, 'plaster', wall);
  const red = k.pick(['#a3282a', '#8b2e2a', '#3d5a45']);
  const opt: WindowOptions = { frame: red, shutter: null };
  const door = dressedBlock(k, segs, PLINTH_TOP_M, k.H, opt, c(red), true);
  k.gableRoof(r, k.H, k.R, 0.7, 'a', k.roof, 'plaster', wall);
  // Cross gable over the left of the front, and a tower at the right corner.
  const ww = Math.min(5.4, k.W * 0.95);
  const wing: Rect = { a0: -k.W + 0.7, a1: -k.W + 0.7 + ww, f0: 0, f1: k.D };
  const rw = Math.max(k.R + 0.4, (ww / 2) * 1.05);
  k.gableRoof(wing, k.H, rw, 0.6, 'f', k.roof, null, wall);
  const f = segs.front;
  k.gableTri('plaster', f, wing.a0 + k.W, wing.a1 + k.W, k.H, k.H + rw, wall);
  k.window(f, (wing.a0 + wing.a1) / 2 + k.W, k.H + 0.5, { frame: red, w: 1.0, h: 1.3 });
  const tower: Rect = { a0: k.W - 2.4, a1: k.W, f0: k.D - 2.4, f1: k.D };
  const redC = c(red);
  k.walls(tower, k.H - 0.5, k.H + 2.8, 'plaster', redC);
  k.hipRoof(tower, k.H + 2.8, 3.2, 0.35, redC);
  k.box(k.m.plain, k.expand(tower, 0.12), k.H + 2.7, k.H + 2.85, c(DARK));
  return door;
};

const bungalow: StyleFn = (k) => {
  const white = c('#f4f2ec').lerp(k.wall, 0.15);
  const A: Rect = { a0: -k.W, a1: k.W, f0: -k.D, f1: 0.1 * k.D };
  const B: Rect = { a0: -k.W, a1: -0.1 * k.W, f0: 0.1 * k.D, f1: k.D };
  k.plinth(A);
  k.plinth(B, ['back']);
  const sa = k.walls(A, PLINTH_TOP_M, k.H, 'plaster', white);
  const sb = k.walls(B, PLINTH_TOP_M, k.H, 'plaster', white, ['back']);
  k.flatRoof(A, k.H, 0.45);
  k.flatRoof(B, k.H, 0.45);
  const big: WindowOptions = { frame: DARK, w: 2.2, h: 2.2, sill: 0.35, big: true, shutter: null };
  // Big glazed bays on the front of the wing, the terrace wall and the sides.
  k.facade(sb.front, PLINTH_TOP_M, k.H, { ...big, floors: 1 });
  k.facade(sb.right, PLINTH_TOP_M, k.H, { ...big, floors: 1 });
  k.facade(sb.left, PLINTH_TOP_M, k.H, { ...big, floors: 1 });
  k.facade(sa.back, PLINTH_TOP_M, k.H, { ...big, w: 1.4, floors: 1 });
  k.facade(sa.right, PLINTH_TOP_M, k.H, { ...big, w: 1.2, floors: 1 });
  const dt = 1.55 * k.W;
  k.facade(sa.front, PLINTH_TOP_M, k.H, {
    ...big,
    skip: [
      [0, 0.9 * k.W],
      [dt - 1.9, dt + 1.9],
    ],
    floors: 1,
  });
  const door = k.door(sa.front, dt, c(k.pick(DOOR_COLORS)), false);
  // Terrace under a cantilevered slab held by two pillars.
  const slab: Rect = { a0: 0.1 * k.W, a1: k.W, f0: 0.1 * k.D, f1: k.D };
  k.box(k.m.plain, k.expand(slab, 0.15), k.H, k.H + 0.3, c(WHITE));
  const fr = k.segs(slab).front;
  for (const t of [0.4, slab.a1 - slab.a0 - 0.4]) k.pillar(fr, t, -0.3, 0, k.H, c(WHITE));
  return { a: door.a, f: 0.1 * k.D };
};

const balconyHouse: StyleFn = (k) => {
  const r = fullRect(k);
  k.plinth(r);
  const segs = k.walls(r, PLINTH_TOP_M, k.H, 'plaster', k.wall);
  const f = segs.front;
  const sh = (k.H - PLINTH_TOP_M) / Math.max(2, Math.round((k.H - PLINTH_TOP_M) / STOREY_M));
  const door = dressedBlock(
    k,
    segs,
    PLINTH_TOP_M,
    k.H,
    { shutter: k.pick(SHUTTER_COLORS) },
    c(k.pick(DOOR_COLORS)),
    false,
  );
  k.gableRoof(r, k.H, k.R, 0.9, 'a', k.roof, 'wood', k.wood);
  k.balcony(f, f.len * 0.18, f.len * 0.82, PLINTH_TOP_M + sh - 0.05, 1.3, k.wood);
  k.chimney(-k.W * 0.4, 0, k.H, k.H + k.R + 0.7);
  return door;
};

const longere: StyleFn = (k) => {
  const split = 0.35 * k.W;
  const M: Rect = { a0: -k.W, a1: split, f0: -k.D, f1: k.D };
  const N: Rect = { a0: split, a1: k.W, f0: -k.D * 0.9, f1: k.D * 0.9 };
  const hn = k.H * 0.72;
  k.plinth(M);
  k.plinth(N, ['left']);
  const sm = k.walls(M, PLINTH_TOP_M, k.H, 'plaster', k.wall);
  const sn = k.walls(N, PLINTH_TOP_M, hn, 'plaster', k.wall, ['left']);
  const shutter = k.pick(SHUTTER_COLORS);
  const door = dressedBlock(k, sm, PLINTH_TOP_M, k.H, { shutter }, c(k.pick(DOOR_COLORS)));
  for (const face of ['front', 'right', 'back'] as const)
    k.facade(sn[face], PLINTH_TOP_M, hn, { shutter, floors: 1 });
  k.gableRoof(M, k.H, k.R, 0.5, 'a', k.roof, 'plaster', k.wall);
  k.gableRoof(N, hn, k.R * 0.75, 0.5, 'a', k.roof, 'plaster', k.wall);
  for (const t of [sm.front.len * 0.22, sm.front.len * 0.78])
    k.dormer(sm.front, t, k.H + 0.2, k.wall, k.roof);
  k.chimney(-k.W * 0.55, 0, k.H, k.H + k.R + 0.7);
  return door;
};

const town: StyleFn = (k) => {
  const r = fullRect(k);
  k.plinth(r);
  const segs = k.walls(r, PLINTH_TOP_M, k.H, 'plaster', k.wall);
  const shutter = k.pick(SHUTTER_COLORS);
  const door = dressedBlock(
    k,
    segs,
    PLINTH_TOP_M,
    k.H,
    { shutter, h: 1.6 },
    c(k.pick(DOOR_COLORS)),
  );
  k.gableRoof(r, k.H, k.R, 0.55, 'f', k.roof, 'plaster', k.wall);
  const f = segs.front;
  k.window(f, f.len / 2, k.H + 0.5, { shutter, w: 0.9, h: 1.2 });
  k.chimney(0, -k.D * 0.4, k.H, k.H + k.R + 0.8);
  return door;
};

const garageHouse: StyleFn = (k) => {
  const split = 0.3 * k.W;
  const M: Rect = { a0: -k.W, a1: split, f0: -k.D, f1: k.D };
  const G: Rect = { a0: split, a1: k.W, f0: -k.D, f1: 0.6 * k.D };
  const hg = 3;
  k.plinth(M);
  k.plinth(G, ['left']);
  const sm = k.walls(M, PLINTH_TOP_M, k.H, 'plaster', k.wall);
  const sg = k.walls(G, PLINTH_TOP_M, hg, 'plaster', k.wall, ['left']);
  const door = dressedBlock(
    k,
    sm,
    PLINTH_TOP_M,
    k.H,
    { shutter: k.pick(SHUTTER_COLORS) },
    c(k.pick(DOOR_COLORS)),
  );
  k.gableRoof(M, k.H, k.R, 0.5, 'a', k.roof, 'plaster', k.wall);
  k.flatRoof(G, hg, 0.35);
  // Garage door: panelled leaf.
  const gf = sg.front;
  const leaf = c(k.pick(['#d9d6cf', '#8a8f94', '#6b4a34', '#3d5a45']));
  k.panel(k.m.plain, gf, 0.5, gf.len - 0.5, 0, 2.3, 0.03, leaf);
  for (let i = 1; i < 5; i++)
    k.panel(
      k.m.plain,
      gf,
      0.5,
      gf.len - 0.5,
      i * 0.46,
      i * 0.46 + 0.04,
      0.05,
      leaf.clone().multiplyScalar(0.7),
    );
  k.chimney(-k.W * 0.5, 0, k.H, k.H + k.R + 0.7);
  return door;
};

const shuttersHouse: StyleFn = (k) => {
  const r = fullRect(k);
  k.plinth(r);
  const wall = k.wall.clone().lerp(c(WHITE), 0.25);
  const segs = k.walls(r, PLINTH_TOP_M, k.H, 'plaster', wall);
  const shutter = k.pick(['#8b2e2a', '#2f4f7a', '#3d5a45', '#a05a2c']);
  const door = dressedBlock(k, segs, PLINTH_TOP_M, k.H, { shutter, h: 1.5 }, c(shutter));
  k.gableRoof(r, k.H, k.R, 0.7, 'f', k.roof, 'wood', k.wood);
  // Window boxes under the ground-floor windows of the front.
  k.chimney(0, -k.D * 0.3, k.H, k.H + k.R + 0.7);
  return door;
};

/** Stone ground floor, wood above, wide gable towards the street. */
const chaletClassic: StyleFn = (k) => {
  const r = fullRect(k);
  const stone = c(STONE_COLOR, 0.95);
  const floor1 = 2.9;
  k.walls(r, k.foot, floor1, 'stone', stone);
  const segs = k.walls(r, floor1, k.H, 'wood', k.wood);
  const shutter = k.pick(SHUTTER_COLORS);
  const f = segs.front;
  const dt = f.len / 2;
  k.facade(f, PLINTH_TOP_M, floor1, {
    shutter,
    odd: true,
    skip: [[dt - 1.6, dt + 1.6]],
    floors: 1,
    h: 1.2,
    sill: 0.8,
  });
  k.facade(f, floor1, k.H, { shutter, odd: true, floors: 1, h: 1.4 });
  for (const face of ['right', 'back', 'left'] as const) {
    k.facade(segs[face], PLINTH_TOP_M, floor1, { shutter, floors: 1, h: 1.2, sill: 0.8 });
    k.facade(segs[face], floor1, k.H, { shutter, floors: 1, h: 1.4 });
  }
  const door = k.door(f, dt, c(k.pick(DOOR_COLORS)), false);
  k.gableRoof(r, k.H, k.R, 1.2, 'f', k.roof, 'wood', k.wood);
  k.balcony(f, 0.4, f.len - 0.4, floor1 + 0.1, 1.3, k.wood.clone().multiplyScalar(0.85));
  k.chimney(0, -k.D * 0.3, k.H, k.H + k.R + 0.8);
  return door;
};

/** Garage and entrance in a concrete base, wood volume with a glazed front above, glass terrace. */
const chaletGarage: StyleFn = (k) => {
  const r = fullRect(k);
  const base = 2.9;
  const concrete = c('#9a9a95');
  const sb = k.walls(r, k.foot, base, 'stone', concrete);
  // Terrace deck on top of the base.
  k.flat(
    k.m.plain,
    [
      [r.a0, r.f1],
      [r.a1, r.f1],
      [r.a1, r.f0],
      [r.a0, r.f0],
    ],
    base + 0.01,
    c('#a07f58'),
  );
  const up: Rect = { a0: -k.W, a1: k.W, f0: -k.D, f1: 0.35 * k.D };
  const su = k.walls(up, base, k.H, 'wood', k.wood);
  k.gableRoof(up, k.H, k.R, 1.0, 'a', k.roof, 'wood', k.wood);
  const uf = su.front;
  k.glazing(uf, 0.7, uf.len - 0.7, base + 0.4, k.H - 0.5, 0.04, 4);
  // Glass railing around the terrace.
  const tf = sb.front;
  k.m.plain.quad(
    k.pt(tf, 0, base, 0.02),
    k.pt(tf, tf.len, base, 0.02),
    k.pt(tf, tf.len, base + 1, 0.02),
    k.pt(tf, 0, base + 1, 0.02),
    ZERO_UV,
    c('#a9c0cc'),
  );
  for (const side of ['left', 'right'] as const) {
    const s = sb[side];
    k.m.plain.quad(
      k.pt(s, 0, base, 0.02),
      k.pt(s, s.len, base, 0.02),
      k.pt(s, s.len, base + 1, 0.02),
      k.pt(s, 0, base + 1, 0.02),
      ZERO_UV,
      c('#a9c0cc'),
    );
  }
  k.facade(su.right, base, k.H, { floors: 1, frame: DARK, h: 1.5 });
  k.facade(su.left, base, k.H, { floors: 1, frame: DARK, h: 1.5 });
  // Garage door (left) and entrance (right) in the base.
  const slats = c('#b08a5e');
  k.panel(k.m.plain, tf, 0.7, tf.len * 0.5 - 0.3, -0.1, 2.4, 0.03, slats);
  for (let i = 1; i < 9; i++)
    k.panel(
      k.m.plain,
      tf,
      0.7,
      tf.len * 0.5 - 0.3,
      i * 0.28 - 0.1,
      i * 0.28 - 0.07,
      0.05,
      slats.clone().multiplyScalar(0.7),
    );
  const door = k.door(tf, tf.len * 0.75, c('#3a3d40'), false);
  k.window(tf, tf.len * 0.9, 0.9, { frame: DARK, w: 0.9, h: 1.0 });
  k.chimney(k.W * 0.5, -k.D * 0.5, k.H, k.H + k.R + 0.8);
  return door;
};

/** Black cladding, huge glazed gable, stone blocks and a light wood annex. */
const chaletBlack: StyleFn = (k) => {
  const split = 0.35 * k.W;
  const U: Rect = { a0: -k.W, a1: split, f0: -k.D, f1: k.D };
  const N: Rect = { a0: split, a1: k.W, f0: -k.D * 0.6, f1: k.D * 0.7 };
  const hn = k.H * 0.62;
  const black = c('#2a2c2f');
  const stone = c('#8d8780');
  k.walls(U, k.foot, 1.4, 'stone', stone);
  const su = k.walls(U, 1.4, k.H, 'wood', black);
  k.gableRoof(U, k.H, k.R, 0.8, 'f', c('#3b3f44'), 'wood', black);
  const f = su.front;
  k.glazing(f, 0.5, f.len - 0.5, 1.9, k.H, 0.05, 3);
  k.m.plain.tri(
    k.pt(f, 0.5, k.H, 0.05),
    k.pt(f, f.len - 0.5, k.H, 0.05),
    k.pt(f, f.len / 2, k.H + k.R - 0.9, 0.05),
    [0, 0],
    [0, 0],
    [0, 0],
    c(GLASS),
  );
  k.facade(su.right, 1.4, k.H, { floors: 1, frame: DARK, h: 1.4 });
  k.facade(su.left, 1.4, k.H, { floors: 1, frame: DARK, h: 1.4 });
  k.walls(N, k.foot, 1.0, 'stone', stone, ['left']);
  const sn = k.walls(N, 1.0, hn, 'wood', k.wood.clone().lerp(c('#e0c29a'), 0.4), ['left']);
  k.flatRoof(N, hn, 0.5, c('#3b3f44'));
  k.facade(sn.right, 1.0, hn, { floors: 1, frame: DARK, h: 1.2, sill: 0.4 });
  k.facade(sn.back, 1.0, hn, { floors: 1, frame: DARK, h: 1.2, sill: 0.4 });
  k.glazing(sn.front, 0.4, sn.front.len * 0.5 - 0.5, 1.3, hn - 0.3, 0.04, 1);
  const door = k.door(sn.front, sn.front.len * 0.78, c('#3a3d40'), false);
  k.chimney(0, -k.D * 0.2, k.H + k.R * 0.5, k.H + k.R + 0.9);
  return door;
};

/** Light wood, tall glazing behind a slat screen, covered terrace and balcony. */
const chaletSlats: StyleFn = (k) => {
  const r = fullRect(k);
  k.plinth(r);
  const light = k.wood.clone().lerp(c('#dcc7a2'), 0.45);
  const segs = k.walls(r, PLINTH_TOP_M, k.H, 'wood', light);
  const f = segs.front;
  k.gableRoof(r, k.H, k.R, 1.1, 'a', c('#4a4d52'), 'wood', light);
  const glassEnd = f.len * 0.55;
  k.glazing(f, 0.8, glassEnd, 0.6, k.H - 0.6, 0.04, 3);
  // Slat screen in front of the glazing.
  k.m.fence.quad(
    k.pt(f, 0.5, 0.4, 0.4),
    k.pt(f, glassEnd + 0.4, 0.4, 0.4),
    k.pt(f, glassEnd + 0.4, k.H - 0.3, 0.4),
    k.pt(f, 0.5, k.H - 0.3, 0.4),
    [
      [0, FENCE_SLATS[0]],
      [(glassEnd - 0.1) / 1, FENCE_SLATS[0]],
      [(glassEnd - 0.1) / 1, FENCE_SLATS[1]],
      [0, FENCE_SLATS[1]],
    ],
    light.clone().multiplyScalar(0.9),
  );
  // Balcony over the covered terrace on the right.
  const deckH = 3.1;
  k.balcony(f, f.len * 0.62, f.len - 0.3, deckH, 2.0, light.clone().multiplyScalar(0.85));
  k.facade(f, deckH, k.H, {
    floors: 1,
    frame: DARK,
    h: 1.5,
    skip: [[0, glassEnd + 0.6]],
    shutter: null,
  });
  const door = k.door(f, f.len * 0.8, c('#3a3d40'), false);
  for (const face of ['right', 'back', 'left'] as const)
    k.facade(segs[face], PLINTH_TOP_M, k.H, { frame: DARK, shutter: null, h: 1.5 });
  k.chimney(k.W * 0.4, 0, k.H, k.H + k.R + 0.8);
  return door;
};

const chaletSmall: StyleFn = (k) => {
  const r = fullRect(k);
  const baseH = 1.4;
  k.walls(r, k.foot, baseH, 'stone', c(STONE_COLOR, 0.95));
  const segs = k.walls(r, baseH, k.H, 'wood', k.wood.clone().multiplyScalar(0.85));
  const shutter = k.pick(['#8b2e2a', '#3d5a45', '#2f4f7a', '#e8e4da']);
  const f = segs.front;
  const dt = f.len * 0.3;
  k.facade(f, PLINTH_TOP_M, baseH + 1.7, {
    shutter,
    floors: 1,
    odd: false,
    skip: [[dt - 1.3, dt + 1.3]],
    h: 1.2,
    sill: 0.8,
  });
  for (const face of ['right', 'back', 'left'] as const)
    k.facade(segs[face], PLINTH_TOP_M, k.H, { shutter, floors: 1, h: 1.2 });
  const door = k.door(f, dt, c(k.pick(DOOR_COLORS)), true);
  k.gableRoof(r, k.H, k.R, 1.0, 'a', k.roof, 'wood', k.wood.clone().multiplyScalar(0.85));
  k.balcony(f, f.len * 0.52, f.len - 0.5, baseH + 1.9, 1.0, k.wood);
  k.chimney(k.W * 0.5, 0, k.H, k.H + k.R + 0.7);
  // Log pile against the left wall.
  const left = segs.left;
  k.boxSeg(k.m.plain, left, left.len * 0.2, left.len * 0.2 + 2, 0, 0.5, 0, 1.2, c('#9b6f45'));
  return door;
};

const barn: StyleFn = (k) => {
  const r = fullRect(k);
  const alpine = k.b.style === 'barn-alpine';
  const wood = alpine ? c('#4a3426') : k.wood.clone().lerp(c('#a8553a'), 0.5);
  k.walls(r, k.foot, alpine ? 1.2 : 0.8, 'stone', c(STONE_COLOR, 0.85));
  const segs = k.walls(r, alpine ? 1.2 : 0.8, k.H, 'wood', wood);
  const f = segs.front;
  const dark = wood.clone().multiplyScalar(0.55);
  k.panel(k.m.plain, f, f.len / 2 - 1.7, f.len / 2 + 1.7, 0, 3.5, 0.03, dark);
  k.panel(k.m.plain, f, f.len / 2 - 0.05, f.len / 2 + 0.05, 0, 3.5, 0.05, wood);
  k.panel(k.m.plain, f, f.len / 2 - 1.7, f.len / 2 + 1.7, 1.7, 1.78, 0.05, wood);
  k.panel(k.m.plain, f, f.len / 2 - 0.6, f.len / 2 + 0.6, 4.4, 5.4, 0.03, dark);
  k.gableRoof(r, k.H, k.R, alpine ? 0.9 : 0.5, 'a', k.roof, 'wood', wood);
  return { a: 0, f: k.D };
};

const STYLES: Record<BuildingStyle, StyleFn> = {
  gable,
  hip,
  villa,
  gables,
  bungalow,
  balcony: balconyHouse,
  longere,
  town,
  garage: garageHouse,
  shutters: shuttersHouse,
  'chalet-classic': chaletClassic,
  'chalet-garage': chaletGarage,
  'chalet-black': chaletBlack,
  'chalet-slats': chaletSlats,
  'chalet-small': chaletSmall,
  barn,
  'barn-alpine': barn,
};

// ---------------------------------------------------------------------------
// Gardens
// ---------------------------------------------------------------------------

const GATE_HALF_M = 0.8;
const HEDGE_GREENS = ['#3d6b34', '#476f33', '#35602f'];

/** Fence, gate and gravel path of a lot, in the frame of the building. */
function garden(k: Kit, lot: Lot, door: Door) {
  const { W, D } = k;
  const margin = 1.2;
  const fL = D + lot.frontM;
  const zr = lot.roadZ - k.b.z;
  const gm = lot.groundM - k.b.z;
  const low = Math.min(gm, k.b.groundM - k.b.z) - 0.1;
  const dA = Math.max(-W + 1, Math.min(W - 1, door.a));
  const kind = lot.fence;
  const green = c(k.pick(HEDGE_GREENS));
  const wallC = c('#b4ada0', 0.95);
  const post = c(WHITE);
  const rect = (a0: number, a1: number, f0: number, f1: number): Rect => ({ a0, a1, f0, f1 });

  /** A run of fence along one axis-aligned line, from (a0, f0) to (a1, f1). */
  const run = (a0: number, f0: number, a1: number, f1: number) => {
    const len = Math.hypot(a1 - a0, f1 - f0);
    if (len < 0.3) return;
    const t = 0.35;
    const lo = Math.min(a0, a1);
    const hi = Math.max(a0, a1);
    const flo = Math.min(f0, f1);
    const fhi = Math.max(f0, f1);
    const horizontal = Math.abs(f1 - f0) < 1e-6;
    const r = horizontal
      ? rect(lo, hi, f0 - t / 2, f0 + t / 2)
      : rect(a0 - t / 2, a0 + t / 2, flo, fhi);
    if (kind === 'hedge') {
      k.box(k.m.plain, r, low, zr + 1.3, green);
    } else if (kind === 'wall') {
      k.box(
        k.m.stone,
        k.expand(rect(r.a0 + 0.03, r.a1 - 0.03, r.f0 + 0.03, r.f1 - 0.03), 0),
        low,
        zr + 0.9,
        wallC,
        STONE_TILE,
      );
      k.box(k.m.plain, k.expand(r, 0.05), zr + 0.9, zr + 1.0, c('#cfc9bd'));
    } else {
      const p0 = k.P(a0, f0, zr);
      const p1 = k.P(a1, f1, zr);
      const top = (p: P3) => [p[0] as number, (p[1] as number) + 1.05, p[2] as number];
      k.m.fence.quad(
        p0,
        p1,
        top(p1),
        top(p0),
        [
          [0, FENCE_PICKET[0]],
          [len, FENCE_PICKET[0]],
          [len, FENCE_PICKET[1]],
          [0, FENCE_PICKET[1]],
        ],
        post,
      );
      const n = Math.max(1, Math.ceil(len / 2.5));
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        const f = f0 + ((f1 - f0) * i) / n;
        k.box(k.m.plain, rect(a - 0.06, a + 0.06, f - 0.06, f + 0.06), low, zr + 1.2, post);
      }
    }
  };

  const gap = lot.gate ? ([dA - GATE_HALF_M, dA + GATE_HALF_M] as const) : null;
  if (gap) {
    run(-W - margin, fL, gap[0], fL);
    run(gap[1], fL, W + margin, fL);
  } else {
    run(-W - margin, fL, W + margin, fL);
  }
  run(-W - margin, fL, -W - margin, D);
  run(W + margin, fL, W + margin, D);

  if (!gap) return;
  // Gate pillars and two open gate leaves.
  const pillar = c('#bdb6a8');
  for (const a of gap) {
    k.box(
      k.m.stone,
      rect(a - 0.22, a + 0.22, fL - 0.22, fL + 0.22),
      low,
      zr + 1.6,
      pillar,
      STONE_TILE,
    );
    k.box(k.m.plain, rect(a - 0.3, a + 0.3, fL - 0.3, fL + 0.3), zr + 1.6, zr + 1.72, c('#8f897e'));
    const side = a < dA ? -1 : 1;
    const p0 = k.P(a - side * 0.22, fL, zr + 0.1);
    const p1 = k.P(a - side * 0.22, fL - 0.8, zr + 0.1);
    const up = (p: P3) => [p[0] as number, (p[1] as number) + 1.1, p[2] as number];
    k.m.fence.quad(
      p0,
      p1,
      up(p1),
      up(p0),
      [
        [0, FENCE_PICKET[0]],
        [0.8, FENCE_PICKET[0]],
        [0.8, FENCE_PICKET[1]],
        [0, FENCE_PICKET[1]],
      ],
      c('#2b2d30'),
    );
  }

  if (!lot.gravel) return;
  // Gravel path from the gate to the door, a ramp between the street and the floor.
  const gravel = c('#b9ae98').multiplyScalar(0.92 + k.rng() * 0.1);
  const fd = Math.min(door.f, D);
  const a0 = dA - 0.65;
  const a1 = dA + 0.65;
  const hTop = zr + 0.03;
  const hDoor = 0.03;
  const q = (pts: P3[]) =>
    k.m.plain.quad(pts[0] as P3, pts[1] as P3, pts[2] as P3, pts[3] as P3, ZERO_UV, gravel);
  q([k.P(a0, fL, hTop), k.P(a1, fL, hTop), k.P(a1, fd, hDoor), k.P(a0, fd, hDoor)]);
  q([k.P(a0, fL, hTop), k.P(a0, fd, hDoor), k.P(a0, fd, low), k.P(a0, fL, low)]);
  q([k.P(a1, fd, hDoor), k.P(a1, fL, hTop), k.P(a1, fL, low), k.P(a1, fd, low)]);
  q([k.P(a0, fL, low), k.P(a1, fL, low), k.P(a1, fL, hTop), k.P(a0, fL, hTop)]);
}

// ---------------------------------------------------------------------------

export interface BuildingGeometries {
  plaster: BufferGeometry;
  wood: BufferGeometry;
  stone: BufferGeometry;
  roofs: BufferGeometry;
  plain: BufferGeometry;
  fence: BufferGeometry;
}

/** All buildings merged into six meshes. */
export function buildBuildings(buildings: readonly Building[], base: number): BuildingGeometries {
  const parts: Parts = {
    plaster: new MeshBuilder(),
    wood: new MeshBuilder(),
    stone: new MeshBuilder(),
    roofs: new MeshBuilder(),
    plain: new MeshBuilder(),
    fence: new MeshBuilder(),
  };
  for (const b of buildings) {
    const k = new Kit(b, base, parts);
    const door = STYLES[b.style](k);
    if (b.lot) garden(k, b.lot, door);
  }
  return {
    plaster: parts.plaster.build(),
    wood: parts.wood.build(),
    stone: parts.stone.build(),
    roofs: parts.roofs.build(),
    plain: parts.plain.build(),
    fence: parts.fence.build(),
  };
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

/** Rendered wall: fine grain, neutral so that the vertex colour sets the paint. */
export function plasterTexture(): CanvasTexture {
  const S = 128;
  const { c: cv, ctx } = canvas(S, S);
  const rand = mulberry32(51);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) {
    const v = 222 + rand() * 33;
    ctx.fillStyle = `rgb(${v},${v},${v - 3})`;
    ctx.fillRect(rand() * S, rand() * S, 2, 2);
  }
  return texture(cv);
}

/** Vertical planks, neutral grey-light: the vertex colour sets the wood tone. */
export function woodTexture(): CanvasTexture {
  const S = 128;
  const { c: cv, ctx } = canvas(S, S);
  const rand = mulberry32(61);
  const plank = S / 8;
  for (let x = 0; x < S; x += plank) {
    const v = 195 + rand() * 60;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, 0, plank, S);
    for (let g = 0; g < 7; g++) {
      ctx.fillStyle = `rgba(0,0,0,${0.04 + rand() * 0.08})`;
      ctx.fillRect(x + rand() * plank, 0, 1, S);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x, 0, 1.5, S);
  }
  return texture(cv);
}

/** Courses of rough stone blocks, neutral grey. */
export function stoneTexture(): CanvasTexture {
  const S = 256;
  const { c: cv, ctx } = canvas(S, S);
  const rand = mulberry32(81);
  ctx.fillStyle = '#6a6a66';
  ctx.fillRect(0, 0, S, S);
  const rows = 8;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * 40;
    while (x < S) {
      const w = 36 + rand() * 40;
      const v = 175 + rand() * 70;
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      ctx.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
      x += w;
    }
  }
  return texture(cv);
}

/** Alpha fence texture: pickets with rails (lower half), plain slats (upper half). */
export function fenceTexture(): CanvasTexture {
  const S = 256;
  const { c: cv, ctx } = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  // Canvas y goes down: the lower half of the image (v 0..0.5) is the picket fence.
  const lowTop = S / 2;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) ctx.fillRect(i * 64 + 6, lowTop + 12, 38, S / 2 - 24);
  ctx.fillStyle = '#e4e0d6';
  ctx.fillRect(0, lowTop + 40, S, 14);
  ctx.fillRect(0, S - 60, S, 14);
  // Upper half: slats.
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) ctx.fillRect(i * 43 + 9, 8, 24, S / 2 - 24);
  const t = new CanvasTexture(cv);
  t.wrapS = RepeatWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The six materials of `BuildingGeometries` (same keys). */
export function createBuildingMaterials(): Record<keyof BuildingGeometries, MeshStandardMaterial> {
  const opts = { vertexColors: true, side: DoubleSide } as const;
  return {
    plaster: new MeshStandardMaterial({ ...opts, map: plasterTexture(), roughness: 0.9 }),
    wood: new MeshStandardMaterial({ ...opts, map: woodTexture(), roughness: 0.9 }),
    stone: new MeshStandardMaterial({ ...opts, map: stoneTexture(), roughness: 0.95 }),
    roofs: new MeshStandardMaterial({ ...opts, map: roofTexture(), roughness: 0.8 }),
    plain: new MeshStandardMaterial({ ...opts, roughness: 0.6 }),
    fence: new MeshStandardMaterial({
      ...opts,
      map: fenceTexture(),
      roughness: 0.8,
      alphaTest: 0.5,
    }),
  };
}
