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
  ExtrudeGeometry,
  LatheGeometry,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
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
/** The plinth goes this far under the lowest ground (bilinear vs mesh terrain). */
const PLINTH_BURY_M = 0.6;
/** Plinth colour: the wall colour, darker (stone or rendered base). */
const PLINTH_SHADE = 0.68;
/** Top of the plain band of a facade row (the window frame starts at 0.29 of the row). */
const PLINTH_V = 0.25;

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
  const plinth = new Color();
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
    // A whole number of window rows between the floor and the eave: a fixed
    // 3 m row left the top windows cut by the roof (docs/16 §2).
    const rowH = H / Math.max(1, Math.round(H / FLOOR_H));
    // A blank plinth from the floor down into the lowest ground under the
    // walls, so that no house floats or shows windows below the ground.
    const foot = Math.min(-0.3, b.groundM - b.z - PLINTH_BURY_M);
    const target = b.kind === 'barn' ? barns : walls;
    color.set(WALL_COLORS[b.wallTint % WALL_COLORS.length] ?? '#ffffff');
    if (b.kind === 'barn') color.lerp(new Color('#ffffff'), 0.5);
    plinth.copy(color).multiplyScalar(PLINTH_SHADE);
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
        P(a1, f1, 0),
        P(a0, f0, 0),
        P(a0, f0, H),
        P(a1, f1, H),
        [
          [0, 0],
          [len, 0],
          [len, H / rowH],
          [0, H / rowH],
        ],
        color,
      );
      // The plinth samples the plain bottom of a row (no window there).
      target.quad(
        P(a1, f1, foot),
        P(a0, f0, foot),
        P(a0, f0, 0),
        P(a1, f1, 0),
        [
          [0, 0.02],
          [len, 0.02],
          [len, PLINTH_V],
          [0, PLINTH_V],
        ],
        plinth,
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
        [0, H / rowH],
        [b.depth / BAY_W, H / rowH],
        [b.depth / 2 / BAY_W, (H + R) / rowH],
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

/** A thin box from `a` to `b` (scene points, same x), `w` wide across X and `t` thick. */
function strut(a: [number, number, number], b: [number, number, number], w: number, t: number) {
  const len = Math.hypot(b[1] - a[1], b[2] - a[2]);
  return new BoxGeometry(w, t, len)
    .rotateX(-Math.atan2(b[1] - a[1], b[2] - a[2]))
    .translate(a[0], (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/**
 * A side profile (x along the car, forward +; y up) extruded across the car,
 * `width` wide with rounded edges, centred on X = 0, length along +Z.
 */
function extrudeShape(shape: Shape, width: number, round: number) {
  return new ExtrudeGeometry(shape, {
    depth: width - 2 * round,
    bevelEnabled: round > 0,
    bevelThickness: round,
    bevelSize: round,
    bevelSegments: 1,
    curveSegments: 5,
  })
    .rotateY(-Math.PI / 2)
    .translate(width / 2 - round, 0, 0);
}

function profile(points: readonly [number, number][]): Shape {
  const shape = new Shape();
  points.forEach(([x, y], k) => {
    if (k === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

/**
 * Small hatchback (4.05 x 1.76 m), length along +Z (forward): body with wheel
 * arches, glasshouse, pillars and roof, bumpers, lights, mirrors, wheels with
 * rims. White parts take the instance colour; glass, tyres, trims and lights
 * keep their own (vertex colours multiply).
 */
export function carGeometry(): BufferGeometry {
  const wheelbase = 2.5;
  const wheelR = 0.31;
  const arch = 0.37;
  // Lower body, front at +x: sills with the two wheel arches, nose, bonnet, waist, tailgate.
  const body = new Shape();
  body.moveTo(-1.98, 0.24);
  for (const ax of [-wheelbase / 2, wheelbase / 2]) {
    body.lineTo(ax - arch * Math.cos(0.19), 0.24);
    body.absarc(ax, wheelR, arch, Math.PI - 0.19, 0.19, true);
  }
  body.lineTo(1.98, 0.24);
  body.lineTo(2.04, 0.44);
  body.lineTo(1.98, 0.66);
  body.lineTo(1.1, 0.86);
  body.lineTo(-1.7, 0.96);
  body.lineTo(-1.97, 0.94);
  body.lineTo(-2.03, 0.46);
  body.closePath();
  // Glasshouse: windscreen, side windows and rear window in one tinted volume.
  const glass = profile([
    [1.16, 0.84],
    [0.32, 1.37],
    [-1.22, 1.39],
    [-1.86, 0.93],
  ]);
  const side = (x: number) => [
    // A, B and C pillars.
    strut([x, 0.88, 1.12], [x, 1.37, 0.33], 0.05, 0.08),
    new BoxGeometry(0.05, 0.5, 0.12).translate(x, 1.14, -0.42),
    strut([x, 1.39, -1.22], [x, 0.95, -1.84], 0.05, 0.16),
    // Mirror.
    new BoxGeometry(0.16, 0.1, 0.12).translate(x * 1.22, 0.98, 1.02),
  ];
  const wheels = [-0.79, 0.79].flatMap((x) =>
    [-wheelbase / 2, wheelbase / 2].flatMap((z) => [
      paint(
        new CylinderGeometry(wheelR, wheelR, 0.2, 10).rotateZ(Math.PI / 2).translate(x, wheelR, z),
        '#151515',
      ),
      paint(
        new CylinderGeometry(0.19, 0.19, 0.205, 7).rotateZ(Math.PI / 2).translate(x, wheelR, z),
        '#a9adb3',
      ),
    ]),
  );
  return merge([
    paint(extrudeShape(body, 1.76, 0.07), '#ffffff'),
    paint(extrudeShape(glass, 1.5, 0.04), '#1f262d'),
    // Roof panel over the glasshouse.
    paint(new BoxGeometry(1.5, 0.05, 1.5).translate(0, 1.4, -0.45), '#ffffff'),
    ...[-0.76, 0.76].flatMap((x) => side(x).map((g) => paint(g, '#ffffff'))),
    // Bumpers and sill trim.
    paint(new BoxGeometry(1.74, 0.16, 0.12).translate(0, 0.33, 2.0), '#2a2d31'),
    paint(new BoxGeometry(1.74, 0.16, 0.12).translate(0, 0.35, -2.0), '#2a2d31'),
    paint(new BoxGeometry(1.79, 0.06, 1.6).translate(0, 0.27, 0), '#2a2d31'),
    // Head and tail lights, number plates.
    paint(new BoxGeometry(0.34, 0.1, 0.06).translate(-0.6, 0.62, 2.0), '#fff6d8'),
    paint(new BoxGeometry(0.34, 0.1, 0.06).translate(0.6, 0.62, 2.0), '#fff6d8'),
    paint(new BoxGeometry(0.26, 0.14, 0.05).translate(-0.66, 0.8, -1.99), '#b00000'),
    paint(new BoxGeometry(0.26, 0.14, 0.05).translate(0.66, 0.8, -1.99), '#b00000'),
    paint(new BoxGeometry(0.5, 0.11, 0.02).translate(0, 0.42, 2.07), '#f4f4f4'),
    paint(new BoxGeometry(0.5, 0.11, 0.02).translate(0, 0.55, -2.04), '#f4f4f4'),
    ...wheels,
  ]);
}

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
