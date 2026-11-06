// Buildings, cars, people and street furniture: geometries and textures.
// Scene frame: X east, Y up (altitude − base), Z south.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  LatheGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

/** Flat-shaded geometry from triangles (positions, uvs, colours). */
export class MeshBuilder {
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

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { c, ctx };
}

export function texture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
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

export function paint(g: BufferGeometry, hex: string): BufferGeometry {
  const geometry = g.index ? g.toNonIndexed() : g;
  const c = new Color(hex);
  const n = geometry.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

export const merge = (parts: BufferGeometry[]) => {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('Could not merge geometries');
  g.computeBoundingSphere();
  return g;
};

/** Trousers of the pedestrians (instance colours of the legs). */
export const TROUSERS_COLORS = ['#2c3340', '#3b4a6b', '#6b5b45', '#222222', '#55606e', '#8a7b62'];

/** Height of the hips and shoulders of a pedestrian (m): pivots of the legs and arms. */
export const PEDESTRIAN_HIP_M = 0.9;
export const PEDESTRIAN_SHOULDER_M = 1.42;

/**
 * A walking pedestrian, in four instanced parts: the body (shirt, white: it
 * takes the instance colour, with short-sleeve stubs), the head (neck, skin,
 * hair), one arm (bare, hand) and one leg (white trousers: instance colour;
 * shoe), the arm and the leg hanging from their pivot at y = 0.
 */
export function pedestrianGeometries() {
  // Torso turned on a lathe (radius by height), flattened front to back.
  const torso = new LatheGeometry(
    [
      [0, 0.86],
      [0.15, 0.88],
      [0.165, 0.98],
      [0.15, 1.12],
      [0.175, 1.3],
      [0.19, 1.4],
      [0.12, 1.47],
      [0, 1.49],
    ].map(([r, y]) => new Vector2(r, y)),
    8,
  ).scale(1, 1, 0.62);
  const sleeve = (x: number) =>
    new CylinderGeometry(0.065, 0.058, 0.2, 6).translate(x, PEDESTRIAN_SHOULDER_M - 0.08, 0);
  return {
    body: merge([
      paint(torso, '#ffffff'),
      paint(sleeve(0.21), '#ffffff'),
      paint(sleeve(-0.21), '#ffffff'),
    ]),
    head: merge([
      paint(new CylinderGeometry(0.05, 0.055, 0.12, 6).translate(0, 1.51, 0), '#d6a283'),
      paint(
        new SphereGeometry(0.1, 8, 6).scale(0.92, 1.12, 1).translate(0, 1.64, 0.005),
        '#d6a283',
      ),
      paint(
        new SphereGeometry(0.104, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.55)
          .scale(0.94, 1.1, 1.04)
          .translate(0, 1.655, -0.012),
        '#3b2a1e',
      ),
      paint(new BoxGeometry(0.03, 0.05, 0.04).translate(0, 1.625, 0.1), '#c99474'),
    ]),
    arm: merge([
      paint(new CapsuleGeometry(0.042, 0.5, 1, 5).translate(0, -0.29, 0), '#d6a283'),
      paint(new SphereGeometry(0.05, 5, 3).scale(0.8, 1.2, 0.6).translate(0, -0.62, 0), '#c99474'),
    ]),
    leg: merge([
      paint(new CapsuleGeometry(0.068, 0.74, 1, 6).translate(0, -0.44, 0), '#ffffff'),
      paint(
        new BoxGeometry(0.11, 0.08, 0.26).translate(0, -PEDESTRIAN_HIP_M + 0.04, 0.05),
        '#1d1d1f',
      ),
    ]),
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
