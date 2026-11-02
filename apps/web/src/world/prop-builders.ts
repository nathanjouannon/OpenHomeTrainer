// Buildings, cars, people and street furniture: geometries and textures.
// Scene frame: X east, Y up (altitude − base), Z south.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Building } from './settlements';
import { mulberry32 } from './world-data';

export const WALL_COLORS = [
  '#efe6d2',
  '#e3c99a',
  '#f2e3b3',
  '#d9d6cf',
  '#e8d5bd',
  '#e9cfc4',
  '#f7f5ef',
  '#c9bba3',
];
export const ROOF_COLORS = ['#b4553a', '#8a4a32', '#4e5258', '#7d8085'];
export const CAR_COLORS = [
  '#f2f2f2',
  '#1d1f22',
  '#9aa0a6',
  '#b3261e',
  '#1f4e8c',
  '#2f6b3a',
  '#c9b48a',
  '#5a6470',
];
export const CLOTHES_COLORS = [
  '#2b4c7e',
  '#a23b3b',
  '#3e7d4f',
  '#d9a441',
  '#6b4c9a',
  '#e7e3da',
  '#333333',
  '#c75f2a',
];

const BAY_W = 3.2;
const FLOOR_H = 3;

/** Flat-shaded geometry from triangles (positions, uvs, colours). */
class MeshBuilder {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];

  tri(
    a: number[],
    b: number[],
    c: number[],
    ua: number[],
    ub: number[],
    uc: number[],
    color: Color,
  ) {
    this.pos.push(...a, ...b, ...c);
    this.uv.push(...ua, ...ub, ...uc);
    for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
  }

  quad(a: number[], b: number[], c: number[], d: number[], uvs: number[][], color: Color) {
    const [ua, ub, uc, ud] = uvs as [number[], number[], number[], number[]];
    this.tri(a, b, c, ua, ub, uc, color);
    this.tri(a, c, d, ua, uc, ud, color);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * All buildings merged into three meshes (house walls, barn walls, roofs):
 * three draw calls whatever the number of buildings.
 */
export function buildBuildings(buildings: readonly Building[], base: number) {
  const walls = new MeshBuilder();
  const barns = new MeshBuilder();
  const roofs = new MeshBuilder();
  const color = new Color();
  for (const b of buildings) {
    const rx = Math.cos(b.yaw);
    const ry = -Math.sin(b.yaw);
    const fx = Math.sin(b.yaw);
    const fy = Math.cos(b.yaw);
    // Local (a: along the width, to the right of the facade; f: towards the road; h: height).
    const P = (a: number, f: number, h: number) => [
      b.x + rx * a + fx * f,
      b.z - base + h,
      -(b.y + ry * a + fy * f),
    ];
    const W = b.width / 2;
    const D = b.depth / 2;
    const H = b.wallHeight;
    const foot = -3; // foundations go into the ground on slopes
    const target = b.kind === 'barn' ? barns : walls;
    color.set(WALL_COLORS[b.wallTint % WALL_COLORS.length] ?? '#ffffff');
    if (b.kind === 'barn') color.lerp(new Color('#ffffff'), 0.5);
    // Four walls, counter-clockwise seen from outside.
    const corners: [number, number][] = [
      [-W, D],
      [W, D],
      [W, -D],
      [-W, -D],
    ];
    for (let i = 0; i < 4; i++) {
      const [a0, f0] = corners[i] as [number, number];
      const [a1, f1] = corners[(i + 1) % 4] as [number, number];
      const len = Math.hypot(a1 - a0, f1 - f0) / BAY_W;
      // Wound so that the normal points outwards.
      target.quad(
        P(a1, f1, foot),
        P(a0, f0, foot),
        P(a0, f0, H),
        P(a1, f1, H),
        [
          [0, foot / FLOOR_H],
          [len, foot / FLOOR_H],
          [len, H / FLOOR_H],
          [0, H / FLOOR_H],
        ],
        color,
      );
    }
    // Gables at both ends of the ridge (ridge parallel to the facade).
    const R = b.roofHeight;
    for (const side of [-1, 1]) {
      const a = side * W;
      const t1 = P(a, side === 1 ? D : -D, H);
      const t2 = P(a, side === 1 ? -D : D, H);
      const top = P(a, 0, H + R);
      target.tri(
        t1,
        t2,
        top,
        [0, H / FLOOR_H],
        [b.depth / BAY_W, H / FLOOR_H],
        [b.depth / 2 / BAY_W, (H + R) / FLOOR_H],
        color,
      );
    }
    // Roof slopes with overhangs.
    const o = 0.45;
    const slope = Math.hypot(D + o, R + o * (R / D));
    color.set(ROOF_COLORS[b.roofTint % ROOF_COLORS.length] ?? '#999999');
    const eave = H - o * (R / D);
    for (const side of [1, -1]) {
      const fe = side * (D + o);
      const quad = [
        P(-W - o, fe, eave),
        P(W + o, fe, eave),
        P(W + o, 0, H + R),
        P(-W - o, 0, H + R),
      ];
      const uvs = [
        [0, 0],
        [(b.width + 2 * o) / 1, 0],
        [(b.width + 2 * o) / 1, slope / 1],
        [0, slope / 1],
      ];
      if (side === 1)
        roofs.quad(
          quad[0] as number[],
          quad[1] as number[],
          quad[2] as number[],
          quad[3] as number[],
          uvs,
          color,
        );
      else
        roofs.quad(
          quad[1] as number[],
          quad[0] as number[],
          quad[3] as number[],
          quad[2] as number[],
          uvs,
          color,
        );
    }
  }
  return { walls: walls.build(), barns: barns.build(), roofs: roofs.build() };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { c, ctx };
}

function texture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** One 3.2 × 3 m bay of a rendered house front: window with wooden shutters. */
export function facadeTexture(): CanvasTexture {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(51);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) {
    const v = 225 + rand() * 30;
    ctx.fillStyle = `rgb(${v},${v},${v - 4})`;
    ctx.fillRect(rand() * S, rand() * S, 2, 2);
  }
  const px = S / BAY_W;
  const wx = (BAY_W / 2 - 0.5) * px;
  // Canvas y goes down; v = 0 is the bottom of the image.
  const top = S - 2.4 * (S / FLOOR_H);
  const h = 1.4 * (S / FLOOR_H);
  ctx.fillStyle = '#e8e4da';
  ctx.fillRect(wx - 4, top - 4, px + 8, h + 10);
  ctx.fillStyle = '#2e3a44';
  ctx.fillRect(wx, top, px, h);
  ctx.fillStyle = 'rgba(160,190,210,0.35)';
  ctx.fillRect(wx + 3, top + 3, px / 2 - 5, h / 2 - 4);
  ctx.fillStyle = '#e8e4da';
  ctx.fillRect(wx + px / 2 - 1.5, top, 3, h);
  ctx.fillRect(wx, top + h / 2 - 1.5, px, 3);
  // Shutters.
  ctx.fillStyle = '#4f6e5a';
  ctx.fillRect(wx - px * 0.5 - 2, top, px * 0.48, h);
  ctx.fillRect(wx + px + 2, top, px * 0.48, h);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let k = 0; k < 7; k++) {
    ctx.fillRect(wx - px * 0.5 - 2, top + (k * h) / 7, px * 0.48, 1);
    ctx.fillRect(wx + px + 2, top + (k * h) / 7, px * 0.48, 1);
  }
  return texture(c);
}

/** Vertical wooden planks with a dark band at the bottom. */
export function barnTexture(): CanvasTexture {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(61);
  for (let x = 0; x < S; x += 8) {
    const v = 120 + rand() * 40;
    ctx.fillStyle = `rgb(${v},${v * 0.78},${v * 0.55})`;
    ctx.fillRect(x, 0, 8, S);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, 0, 1, S);
  }
  ctx.fillStyle = 'rgba(40,30,20,0.35)';
  ctx.fillRect(0, S - 12, S, 12);
  return texture(c);
}

/** Rows of roof tiles (1 m × 1 m tile). */
export function roofTexture(): CanvasTexture {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  const rand = mulberry32(71);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  const rows = 5;
  const cols = 5;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols + 1; k++) {
      const v = 200 + rand() * 55;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      const x = ((k + (r % 2) * 0.5) * S) / cols - S / cols / 2;
      ctx.fillRect(x, (r * S) / rows, S / cols - 2, S / rows - 3);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, ((r + 1) * S) / rows - 3, S, 3);
  }
  return texture(c);
}

function paint(g: BufferGeometry, hex: string): BufferGeometry {
  const geometry = g.index ? g.toNonIndexed() : g;
  const c = new Color(hex);
  const n = geometry.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

const merge = (parts: BufferGeometry[]) => {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('Could not merge geometries');
  g.computeBoundingSphere();
  return g;
};

/**
 * Small hatchback, length along +Z (forward). White parts take the instance
 * colour; glass, tyres and lights keep their own (vertex colours multiply).
 */
export function carGeometry(): BufferGeometry {
  return merge([
    paint(new BoxGeometry(1.76, 0.62, 4.05).translate(0, 0.6, 0), '#ffffff'),
    paint(new BoxGeometry(1.7, 0.18, 0.9).translate(0, 0.98, 1.45).rotateX(0.0), '#ffffff'),
    paint(new BoxGeometry(1.6, 0.56, 2.15).translate(0, 1.18, -0.25), '#2a3138'),
    paint(new BoxGeometry(1.56, 0.07, 1.95).translate(0, 1.48, -0.3), '#ffffff'),
    ...[-0.78, 0.78].flatMap((x) =>
      [-1.3, 1.3].map((z) =>
        paint(
          new CylinderGeometry(0.33, 0.33, 0.24, 14).rotateZ(Math.PI / 2).translate(x, 0.33, z),
          '#151515',
        ),
      ),
    ),
    paint(new BoxGeometry(0.35, 0.12, 0.05).translate(-0.6, 0.72, 2.03), '#fff6d8'),
    paint(new BoxGeometry(0.35, 0.12, 0.05).translate(0.6, 0.72, 2.03), '#fff6d8'),
    paint(new BoxGeometry(0.3, 0.12, 0.05).translate(-0.62, 0.78, -2.03), '#b00000'),
    paint(new BoxGeometry(0.3, 0.12, 0.05).translate(0.62, 0.78, -2.03), '#b00000'),
  ]);
}

/** Pedestrian parts: body (instance colour), skin, and one leg pivoting at the hip. */
export function pedestrianGeometries() {
  return {
    body: merge([
      paint(new BoxGeometry(0.4, 0.62, 0.24).translate(0, 1.2, 0), '#ffffff'),
      paint(new BoxGeometry(0.1, 0.55, 0.1).translate(0.25, 1.17, 0), '#ffffff'),
      paint(new BoxGeometry(0.1, 0.55, 0.1).translate(-0.25, 1.17, 0), '#ffffff'),
    ]),
    head: merge([
      paint(new SphereGeometry(0.11, 12, 8).translate(0, 1.64, 0), '#d6a283'),
      paint(
        new SphereGeometry(0.115, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.67, -0.01),
        '#3b2a1e',
      ),
    ]),
    leg: paint(new BoxGeometry(0.14, 0.88, 0.15).translate(0, -0.44, 0), '#2c3340'),
  };
}

export function lampGeometry(): BufferGeometry {
  return merge([
    paint(new CylinderGeometry(0.05, 0.08, 5.5, 8).translate(0, 2.75, 0), '#3a3d42'),
    paint(new BoxGeometry(0.06, 0.06, 1.1).translate(0, 5.45, 0.55), '#3a3d42'),
    paint(new BoxGeometry(0.28, 0.12, 0.5).translate(0, 5.38, 1.05), '#2b2e33'),
    paint(new BoxGeometry(0.22, 0.02, 0.42).translate(0, 5.31, 1.05), '#fff2c4'),
  ]);
}

/** French roadside delineator: white post, black band, small reflector. */
export function delineatorGeometry(): BufferGeometry {
  return merge([
    paint(new BoxGeometry(0.12, 1.05, 0.12).translate(0, 0.52, 0), '#f1f1ec'),
    paint(new BoxGeometry(0.125, 0.22, 0.125).translate(0, 0.86, 0), '#1a1a1a'),
    paint(new BoxGeometry(0.05, 0.12, 0.13).translate(0, 0.86, 0), '#f08c00'),
  ]);
}

/** Village entrance (or exit, crossed out) sign. */
export function villageSignTexture(name: string, end: boolean): CanvasTexture {
  const W = 512;
  const H = 192;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c8102e';
  ctx.lineWidth = 16;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), W / 2, H / 2 + 4, W - 70);
  if (end) {
    ctx.strokeStyle = '#c8102e';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(30, H - 30);
    ctx.lineTo(W - 30, 30);
    ctx.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
