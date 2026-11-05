// The bike (lot 2.12): SCOTT Addict RC, built from `bike-geometry.ts` with the
// shape builders of `bike-parts.ts`. Everything is code: no asset. The result
// is a three.js hierarchy in the rider frame (+Z forward, +Y up, ground y = 0):
// the wheels, the cranks and the pedals are the only moving parts; the
// pedalling code of `Rider.tsx` merges the rest by material.

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BAR,
  BOTTOM_BRACKET,
  COCKPIT,
  CRANK_LENGTH,
  FRAME,
  FRONT_AXLE,
  HEAD_ANGLE,
  REAR_AXLE,
  RIM_INNER_RADIUS,
  RIM_OUTER_RADIUS,
  SADDLE,
  SADDLE_TOP,
  STEM,
  WHEEL_RADIUS,
} from './bike-geometry';
import {
  barBetween,
  gearGeometry,
  makeOutward,
  mirrorProfile,
  plateGeometry,
  revolveX,
  slabGeometry,
  sweptTube,
  taper,
  uniform,
} from './bike-parts';
import { pedalPosition } from './rider-geometry';

/** Pitch of the chain (m). */
export const CHAIN_PITCH = 0.0127;
/** Pitch radius of the big chainring (50 teeth). */
export const BIG_RING_RADIUS = CHAIN_PITCH / (2 * Math.sin(Math.PI / 50));
const SMALL_RING_RADIUS = CHAIN_PITCH / (2 * Math.sin(Math.PI / 34));
/** x of the chain (the chain line of a road bike is about 43 mm from the centre). */
const CHAIN_X = -0.0515;

export interface Bike {
  /** The whole bike, in the rider frame. */
  root: Group;
  rearWheel: Group;
  frontWheel: Group;
  /** Cranks, chainrings and bottom bracket spindle, centred on the bottom bracket. */
  crank: Group;
  pedals: { l: Mesh; r: Mesh };
  /** Turns the wheels, the cranks (and the chain with them), and places the pedals. */
  setPose(crankAngle: number, wheelAngle: number): void;
  /** Length (m) of the chain loop. */
  chainLength: number;
  dispose(): void;
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const yz = (y: number, z: number, x = 0) => new Vector3(x, y, z);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// --- Paint ------------------------------------------------------------------

const BLUE = new Color('#0856b8');
const SILVER = new Color('#8a8f95');
const TAN = new Color('#a8794a');
const TREAD = new Color('#17171a');

/** Anodised blue at the front, silver at the rear (the paint of this frame). */
const paint = (p: Vector3): Color => SILVER.clone().lerp(BLUE, smooth(-0.05, 0.22, p.z));

// --- Handlebar --------------------------------------------------------------

/**
 * Centre line of the bar (`BAR`), from the left plug to the right one: the
 * tops straight across (sweeping forward a little), a bend of `bendRadius`
 * seen from above, the hook down to the drops (half an ellipse seen from the
 * side, its front `reach` ahead of the centre), and the drops back to the plug.
 */
export function barPath(): Vector3[] {
  const c = COCKPIT.barCenter;
  const half = BAR.width / 2;
  const r = BAR.bendRadius;
  const xBend = half - r;
  const uHook = BAR.topsSweep + r;
  const a = BAR.reach - uHook;
  const b = BAR.drop / 2;
  const side: Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const x = (xBend * i) / 8;
    side.push(v(x, c.y, c.z + BAR.topsSweep * smooth(0, xBend, x)));
  }
  for (let i = 1; i <= 8; i++) {
    const phi = (i / 8) * (Math.PI / 2);
    side.push(v(xBend + r * Math.sin(phi), c.y, c.z + BAR.topsSweep + r * (1 - Math.cos(phi))));
  }
  for (let i = 1; i <= 16; i++) {
    const theta = (i / 16) * Math.PI;
    side.push(v(half, c.y - b * (1 - Math.cos(theta)), c.z + uHook + a * Math.sin(theta)));
  }
  for (let i = 1; i <= 4; i++) {
    const k = i / 4;
    side.push(v(half, c.y - BAR.drop + 0.012 * k, c.z + uHook + (BAR.dropEnd - uHook) * k));
  }
  const other = side.slice(1).map((p) => v(-p.x, p.y, p.z));
  return [...other.reverse(), ...side];
}

// --- Wheels -----------------------------------------------------------------

/** Cross-section of the 28 mm tyre (superellipse) as `[radius, x]` points. */
function tyreProfile(): [number, number][] {
  const out: [number, number][] = [];
  const rc = (RIM_OUTER_RADIUS + WHEEL_RADIUS) / 2;
  const ar = (WHEEL_RADIUS - RIM_OUTER_RADIUS) / 2;
  const ax = 0.0155;
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push([
      rc + Math.sign(c) * Math.abs(c) ** 0.85 * ar,
      Math.sign(s) * Math.abs(s) ** 0.85 * ax,
    ]);
  }
  return out;
}

const tyreColor = (r: number, x: number): Color => {
  const height = (r - RIM_OUTER_RADIUS) / (WHEEL_RADIUS - RIM_OUTER_RADIUS);
  return height > 0.7 && Math.abs(x) < 0.0125 ? TREAD : TAN;
};

/** Half profile of the 65 mm deep carbon rim, `[radius, x]` from the tyre bed down. */
const RIM_HALF: [number, number][] = [
  [RIM_OUTER_RADIUS, 0.0125],
  [RIM_OUTER_RADIUS - 0.012, 0.0128],
  [RIM_OUTER_RADIUS - 0.035, 0.0112],
  [RIM_INNER_RADIUS + 0.007, 0.0085],
  [RIM_INNER_RADIUS, 0.006],
];

interface WheelSpec {
  /** Distance of the hub flanges from the centre, left and right. */
  flangeL: number;
  flangeR: number;
  rotorRadius: number;
  rotorX: number;
  cassette: boolean;
}

function wheelGeometries(spec: WheelSpec) {
  const tyre = revolveX(tyreProfile(), 72, tyreColor);
  const rim = revolveX(mirrorProfile(RIM_HALF), 72);

  // Spokes: 12 a side, laced two-cross (trailing and leading alternately).
  const spokes: BufferGeometry[] = [];
  const rimEnd = RIM_INNER_RADIUS + 0.004;
  for (const side of [1, -1]) {
    for (let k = 0; k < 12; k++) {
      const hubAngle = (k / 12) * Math.PI * 2 + (side === 1 ? 0 : Math.PI / 12);
      const rimAngle = hubAngle + (k % 2 === 0 ? 0.3 : -0.3);
      const flange = side === 1 ? spec.flangeL : spec.flangeR;
      const hub = v(side * flange, 0.021 * Math.cos(hubAngle), 0.021 * Math.sin(hubAngle));
      const end = v(side * 0.004, rimEnd * Math.cos(rimAngle), rimEnd * Math.sin(rimAngle));
      spokes.push(barBetween(hub, end, 0.0022, 0.0022));
    }
  }
  const hubParts = [
    sweptTube([v(-0.05, 0, 0), v(0.05, 0, 0)], uniform({ w: 0.03, d: 0.03 }), { radial: 12 }),
    sweptTube(
      [v(spec.flangeL - 0.003, 0, 0), v(spec.flangeL + 0.003, 0, 0)],
      uniform({ w: 0.046, d: 0.046 }),
      { radial: 12 },
    ),
    sweptTube(
      [v(-spec.flangeR - 0.003, 0, 0), v(-spec.flangeR + 0.003, 0, 0)],
      uniform({ w: 0.046, d: 0.046 }),
      { radial: 12 },
    ),
  ];
  // Valve, pointing at the hub from the inside of the rim.
  const valveAngle = 0.9;
  const valve = sweptTube(
    [
      v(0, RIM_INNER_RADIUS * Math.cos(valveAngle), RIM_INNER_RADIUS * Math.sin(valveAngle)),
      v(
        0,
        (RIM_INNER_RADIUS - 0.045) * Math.cos(valveAngle),
        (RIM_INNER_RADIUS - 0.045) * Math.sin(valveAngle),
      ),
    ],
    uniform({ w: 0.006, d: 0.006 }),
    { radial: 6 },
  );
  const spokeMesh = mergeGeometries(
    [...spokes, ...hubParts, valve].map(stripToBasics),
  ) as BufferGeometry;

  // Disc rotor (left side).
  const rotor = revolveX(
    [
      [spec.rotorRadius, spec.rotorX],
      [spec.rotorRadius, spec.rotorX + 0.002],
      [0.04, spec.rotorX + 0.002],
      [0.04, spec.rotorX],
    ],
    56,
  );
  const steel: BufferGeometry[] = [rotor];
  if (spec.cassette) {
    // 11 sprockets, 11 to 30 teeth, largest next to the spokes.
    const teeth = [30, 27, 24, 21, 19, 17, 15, 14, 13, 12, 11];
    teeth.forEach((n, i) => {
      const pitch = CHAIN_PITCH / (2 * Math.sin(Math.PI / n));
      steel.push(gearGeometry(n, pitch, 0.004, 0.0016, -(0.0317 + i * 0.0038)));
    });
    // The body behind the sprockets.
    steel.push(
      revolveX(
        [
          [0.062, -0.0295],
          [0.062, -0.0325],
          [0.02, -0.0325],
          [0.02, -0.072],
          [0.0245, -0.072],
          [0.0245, -0.0295],
        ],
        32,
      ),
    );
  }
  return {
    tyre,
    rim,
    spokes: spokeMesh,
    steel: mergeGeometries(steel.map(stripToBasics)) as BufferGeometry,
  };
}

/** Keeps `position` and `normal` (non-indexed) so that parts can be merged freely. */
function stripToBasics(g: BufferGeometry): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal') out.deleteAttribute(name);
  }
  return out;
}

// --- Chain ------------------------------------------------------------------

interface Circle2D {
  y: number;
  z: number;
  r: number;
  /** Turning counter-clockwise in the (z, y) plane (z to the right, y up). */
  ccw: boolean;
}

/** Closed belt around circles (outer or crossing tangents, by turning direction). */
export function beltPath(circles: readonly Circle2D[], arcStep = 0.1): [number, number][] {
  const n = circles.length;
  const tangents = circles.map((a, i) => {
    const b = circles[(i + 1) % n] as Circle2D;
    const dz = b.z - a.z;
    const dy = b.y - a.y;
    const length = Math.hypot(dz, dy);
    const sa = a.ccw ? 1 : -1;
    const sb = b.ccw ? 1 : -1;
    const phi = Math.atan2(dy, dz) - Math.asin((sb * b.r - sa * a.r) / length);
    const lz = -Math.sin(phi);
    const ly = Math.cos(phi);
    return {
      from: [a.z - sa * a.r * lz, a.y - sa * a.r * ly] as const,
      to: [b.z - sb * b.r * lz, b.y - sb * b.r * ly] as const,
    };
  });
  const out: [number, number][] = [];
  circles.forEach((c, i) => {
    const arrive = (tangents[(i + n - 1) % n] as (typeof tangents)[number]).to;
    const leave = (tangents[i] as (typeof tangents)[number]).from;
    const a0 = Math.atan2(arrive[1] - c.y, arrive[0] - c.z);
    let a1 = Math.atan2(leave[1] - c.y, leave[0] - c.z);
    if (c.ccw) while (a1 < a0) a1 += Math.PI * 2;
    else while (a1 > a0) a1 -= Math.PI * 2;
    const steps = Math.max(1, Math.ceil(((Math.abs(a1 - a0) * c.r) / arcStep) * 4));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + ((a1 - a0) * k) / steps;
      out.push([c.z + c.r * Math.cos(a), c.y + c.r * Math.sin(a)]);
    }
  });
  return out;
}

/** The chain as a band whose side faces carry the link texture (u = length / pitch). */
function chainBand(path: readonly [number, number][]): {
  geometry: BufferGeometry;
  length: number;
} {
  const n = path.length;
  const halfW = 0.00375;
  const halfT = 0.0024;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  // Per point: 2 vertices on the outer/inner faces (+x/-x) share the dark strip
  // of the texture; the side faces have their own vertices and the plate uv.
  let s = 0;
  const frames: { y: number; z: number; ny: number; nz: number; u: number }[] = [];
  for (let i = 0; i < n; i++) {
    const [z0, y0] = path[i] as [number, number];
    const [z1, y1] = path[(i + 1) % n] as [number, number];
    const [zp, yp] = path[(i + n - 1) % n] as [number, number];
    const tz = z1 - zp;
    const ty = y1 - yp;
    const tl = Math.hypot(tz, ty) || 1;
    frames.push({ y: y0, z: z0, ny: tz / tl, nz: -ty / tl, u: s / CHAIN_PITCH });
    s += Math.hypot(z1 - z0, y1 - y0);
  }
  // Vertices of point i: 0..3 are the corners (+x +n, -x +n, -x -n, +x -n) for
  // the outer and inner faces, 4..7 the side vertices (+x +n, +x -n, -x +n, -x -n).
  for (const f of frames) {
    for (const [dx, dn] of [
      [halfW, halfT],
      [-halfW, halfT],
      [-halfW, -halfT],
      [halfW, -halfT],
    ] as const) {
      positions.push(CHAIN_X + dx, f.y + f.ny * dn, f.z + f.nz * dn);
      uvs.push(f.u, 0.03);
    }
    for (const [dx, dn] of [
      [halfW, halfT],
      [halfW, -halfT],
      [-halfW, halfT],
      [-halfW, -halfT],
    ] as const) {
      positions.push(CHAIN_X + dx, f.y + f.ny * dn, f.z + f.nz * dn);
      uvs.push(f.u, dn > 0 ? 0.85 : 0.15);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = i * 8;
    const b = ((i + 1) % n) * 8;
    // Outer face (corners 0-1) and inner face (corners 2-3).
    index.push(a, a + 1, b, a + 1, b + 1, b);
    index.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    // Side faces.
    index.push(a + 4, a + 5, b + 4, a + 5, b + 5, b + 4);
    index.push(a + 6, b + 6, a + 7, a + 7, b + 6, b + 7);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return { geometry: makeOutward(geometry), length: s };
}

/** Plates and pins of one link, repeated along the chain. */
function chainTexture(): Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#1d1f23';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#aab0b8';
  ctx.beginPath();
  ctx.roundRect(3, 12, 122, 40, 16);
  ctx.fill();
  ctx.fillStyle = '#e2e5ea';
  for (const x of [16, 112]) {
    ctx.beginPath();
    ctx.arc(x, 32, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  return texture;
}

// --- Logos ------------------------------------------------------------------

/** A transparent texture with lettering, drawn on a canvas (null without a DOM). */
function lettering(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** SCOTT, each letter in a colour of the frame's decal. */
function scottTexture(): Texture | null {
  return lettering(1024, 200, (ctx) => {
    ctx.font = 'italic 900 190px "Arial Black", Impact, sans-serif';
    ctx.textBaseline = 'middle';
    const colors = ['#ef4a24', '#f6a11a', '#79b51f', '#1fa3de', '#f4c61b'];
    let x = 20;
    [...'SCOTT'].forEach((letter, i) => {
      ctx.fillStyle = colors[i] as string;
      ctx.fillText(letter, x, 104);
      x += ctx.measureText(letter).width + 8;
    });
  });
}

function ultegraTexture(): Texture | null {
  return lettering(512, 100, (ctx) => {
    ctx.font = 'italic 700 74px "Helvetica Neue", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c9ced4';
    ctx.fillText('ULTEGRA', 10, 54);
  });
}

// --- Bottle cage ------------------------------------------------------------

/** A carbon bottle cage on a tube: `origin` on the tube axis, `axis` along it, `out` away from it. */
function bottleCage(origin: Vector3, axis: Vector3, out: Vector3, lift: number): BufferGeometry {
  const lateral = new Vector3(1, 0, 0);
  const a = axis.clone().normalize();
  const o = out.clone().normalize();
  const radius = 0.036;
  const ring = (along: number): Vector3[] => {
    const c = origin.clone().addScaledVector(a, along).addScaledVector(o, lift);
    const pts: Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const phi = ((i / 12) * 2 - 1) * ((130 * Math.PI) / 180);
      pts.push(
        c
          .clone()
          .addScaledVector(lateral, radius * Math.sin(phi))
          .addScaledVector(o, -radius * Math.cos(phi)),
      );
    }
    return pts;
  };
  const section = uniform({ w: 0.0055, d: 0.0055 });
  const parts: BufferGeometry[] = [];
  for (const along of [0.01, 0.075, 0.135]) {
    parts.push(sweptTube(ring(along), section, { radial: 6, samples: 14, caps: true }));
  }
  for (const sign of [1, -1]) {
    const rail = [0.01, 0.075, 0.135].map((al) => {
      const c = origin.clone().addScaledVector(a, al).addScaledVector(o, lift);
      return c
        .addScaledVector(lateral, sign * radius * Math.sin((130 * Math.PI) / 180))
        .addScaledVector(o, -radius * Math.cos((130 * Math.PI) / 180));
    });
    parts.push(sweptTube(rail, section, { radial: 6, samples: 4 }));
  }
  // Back plate on the tube.
  parts.push(
    sweptTube(
      [
        origin.clone().addScaledVector(a, 0.0).addScaledVector(o, 0.012),
        origin.clone().addScaledVector(a, 0.14).addScaledVector(o, 0.012),
      ],
      uniform({ w: 0.03, d: 0.006 }),
      { radial: 6, samples: 2 },
    ),
  );
  return mergeGeometries(parts.map(stripToBasics)) as BufferGeometry;
}

// --- The bike -----------------------------------------------------------------

export interface BikeOptions {
  /** Draw the link texture of the chain and the logos (needs a DOM; off in tests). */
  textures?: boolean;
  /**
   * Brand lettering of the real bike (SCOTT on the down tube, ULTEGRA on the
   * cranks), as flat decals. They are trademarks: switch them off if the app is
   * ever distributed (see docs/11-legal-licences.md). Default: on.
   */
  logos?: boolean;
}

export function buildBike(options: BikeOptions = {}): Bike {
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };

  const mat = {
    paint: track(
      new MeshPhysicalMaterial({
        vertexColors: true,
        metalness: 0.55,
        roughness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
      }),
    ),
    carbon: track(
      new MeshPhysicalMaterial({
        color: '#16171a',
        metalness: 0.15,
        roughness: 0.42,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
      }),
    ),
    rubber: track(new MeshStandardMaterial({ color: '#131315', roughness: 0.9 })),
    tyre: track(new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })),
    rim: track(
      new MeshPhysicalMaterial({
        color: '#1c1d20',
        metalness: 0.1,
        roughness: 0.48,
        clearcoat: 0.4,
      }),
    ),
    dark: track(new MeshStandardMaterial({ color: '#0f0f10', metalness: 0.7, roughness: 0.5 })),
    steel: track(new MeshStandardMaterial({ color: '#9da1a7', metalness: 0.9, roughness: 0.38 })),
    group: track(new MeshStandardMaterial({ color: '#2a2c31', metalness: 0.55, roughness: 0.5 })),
    red: track(new MeshStandardMaterial({ color: '#d3261b', metalness: 0.7, roughness: 0.35 })),
    white: track(new MeshStandardMaterial({ color: '#eceff1', roughness: 0.4 })),
  };
  const map = options.textures === false ? null : chainTexture();
  if (map) track(map);
  const chainMaterial = track(
    new MeshStandardMaterial({
      color: map ? '#ffffff' : '#7d8188',
      map,
      metalness: 0.75,
      roughness: 0.45,
    }),
  );

  const root = new Group();
  root.name = 'bike';
  const add = (
    parent: Group,
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    name?: string,
  ) => {
    track(geometry);
    // Same attributes for every part of a material, so that they can be merged.
    if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
    const mesh = new Mesh(geometry, material);
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  };
  const BB = BOTTOM_BRACKET;
  const axisDown = v(0, -Math.sin(HEAD_ANGLE), Math.cos(HEAD_ANGLE)); // head tube axis, top to bottom

  // --- Frame and fork (paint) ---
  const frameTube = (
    points: Vector3[],
    section: (t: number) => { w: number; d: number },
    exponent = 2.6,
    radial = 14,
  ) => add(root, sweptTube(points, section, { exponent, radial, color: paint }), mat.paint);

  const headBottom = yz(FRAME.headTubeBottom.y, FRAME.headTubeBottom.z);
  const headTop = yz(FRAME.headTubeTop.y, FRAME.headTubeTop.z);
  frameTube([headBottom, headTop], taper({ w: 0.058, d: 0.072 }, { w: 0.05, d: 0.062 }), 2.4);
  frameTube(
    [yz(BB.y + 0.012, BB.z + 0.02), yz(headBottom.y + 0.025, headBottom.z - 0.012)],
    taper({ w: 0.062, d: 0.088 }, { w: 0.052, d: 0.074 }),
    3.2,
  );
  frameTube(
    [yz(0.722, FRAME.seatCluster.z + 0.004), yz(0.784, headTop.z + 0.004)],
    taper({ w: 0.032, d: 0.034 }, { w: 0.042, d: 0.06 }),
    3,
  );
  frameTube(
    [
      yz(BB.y + 0.012, BB.z - 0.008),
      yz(FRAME.seatTubeMiddle.y, FRAME.seatTubeMiddle.z),
      yz(0.745, FRAME.seatCluster.z),
    ],
    taper({ w: 0.044, d: 0.05 }, { w: 0.034, d: 0.034 }),
    3,
  );
  // Bottom bracket shell.
  frameTube([v(-0.047, BB.y, BB.z), v(0.047, BB.y, BB.z)], uniform({ w: 0.056, d: 0.046 }), 2, 16);
  // Rear triangle.
  for (const side of [1, -1]) {
    frameTube(
      [
        v(side * 0.04, BB.y + 0.004, BB.z - 0.03),
        v(side * 0.079, REAR_AXLE.y, REAR_AXLE.z + 0.006),
      ],
      taper({ w: 0.022, d: 0.038 }, { w: 0.016, d: 0.03 }),
      3,
      10,
    );
    frameTube(
      [
        v(side * 0.08, REAR_AXLE.y + 0.012, REAR_AXLE.z + 0.004),
        v(side * 0.03, FRAME.seatStayJoint.y, FRAME.seatStayJoint.z),
      ],
      taper({ w: 0.016, d: 0.03 }, { w: 0.016, d: 0.024 }),
      3,
      10,
    );
  }
  // Fork: an integrated crown, flush with the bottom of the head tube (seen
  // from the saddle it hides under the stem and the head tube), then two
  // blades that open out from it to the axle.
  // The tyre passes 1–2 cm under the crown: it stays short.
  const crown = headBottom.clone().addScaledVector(axisDown, 0.012);
  frameTube(
    [headBottom.clone().addScaledVector(axisDown, -0.02), crown],
    taper({ w: 0.058, d: 0.072 }, { w: 0.066, d: 0.066 }),
    2.6,
    14,
  );
  const axle = yz(FRONT_AXLE.y, FRONT_AXLE.z);
  for (const side of [1, -1]) {
    const top = crown.clone().addScaledVector(axisDown, -0.012);
    const mid = crown.clone().lerp(axle, 0.5);
    const low = crown.clone().lerp(axle, 0.85);
    frameTube(
      [
        v(side * 0.022, top.y, top.z),
        v(side * 0.03, crown.y - 0.025, crown.z + 0.006),
        v(side * 0.04, mid.y, mid.z + 0.006),
        v(side * 0.052, low.y, low.z + 0.012),
        v(side * 0.056, FRONT_AXLE.y, FRONT_AXLE.z),
      ],
      // Aero blades: narrow across, deep fore-aft; ≥ 1 cm from the 28 mm tyre.
      taper({ w: 0.022, d: 0.056 }, { w: 0.015, d: 0.028 }),
      3,
      10,
    );
  }

  // --- Seatpost, saddle, bag, light (carbon and rubber) ---
  add(
    root,
    sweptTube(
      [
        yz(0.715, FRAME.seatCluster.z),
        yz(0.84, FRAME.seatCluster.z - 0.037),
        yz(SADDLE.clamp.y - 0.004, SADDLE.clamp.z),
      ],
      uniform({ w: 0.027, d: 0.034 }),
      { exponent: 2.4, radial: 12 },
    ),
    mat.carbon,
    'seatpost',
  );
  const SADDLE_HEIGHT = 0.034;
  const saddleWidth = (u: number) => {
    const knots: [number, number][] = [
      [0, 0.064],
      [0.12, 0.071],
      [0.35, 0.067],
      [0.6, 0.044],
      [0.85, 0.025],
      [1, 0.017],
    ];
    for (let i = 1; i < knots.length; i++) {
      const [u0, w0] = knots[i - 1] as [number, number];
      const [u1, w1] = knots[i] as [number, number];
      if (u <= u1) return w0 + ((w1 - w0) * (u - u0)) / (u1 - u0);
    }
    return 0.017;
  };
  const tailZ = SADDLE.tail.z;
  const noseZ = SADDLE.nose.z;
  const outline: [number, number][] = [];
  const us = [0, 0.04, 0.12, 0.35, 0.6, 0.85, 0.97, 1];
  for (const u of us) outline.push([saddleWidth(u) - 0.008, tailZ + (noseZ - tailZ) * u]);
  for (const u of [...us].reverse())
    outline.push([-(saddleWidth(u) - 0.008), tailZ + (noseZ - tailZ) * u]);
  const saddle = add(root, slabGeometry(outline, SADDLE_HEIGHT, 0.008), mat.rubber, 'saddle');
  saddle.position.y = SADDLE_TOP.y - SADDLE_HEIGHT;
  for (const side of [1, -1]) {
    add(
      root,
      sweptTube(
        [
          v(side * 0.042, SADDLE_TOP.y - SADDLE_HEIGHT - 0.003, tailZ + 0.05),
          v(side * 0.03, SADDLE_TOP.y - SADDLE_HEIGHT - 0.014, SADDLE.clamp.z),
          v(side * 0.013, SADDLE_TOP.y - SADDLE_HEIGHT - 0.002, noseZ - 0.02),
        ],
        uniform({ w: 0.007, d: 0.007 }),
        { radial: 6, samples: 8 },
      ),
      mat.carbon,
    );
  }
  const bagTop = SADDLE_TOP.y - SADDLE_HEIGHT - 0.008;
  const bag = add(
    root,
    slabGeometry(
      [
        [0.036, tailZ + 0.0],
        [0.04, tailZ + 0.07],
        [0.036, SADDLE.clamp.z + 0.03],
        [-0.036, SADDLE.clamp.z + 0.03],
        [-0.04, tailZ + 0.07],
        [-0.036, tailZ + 0.0],
      ],
      0.052,
      0.012,
    ),
    mat.rubber,
    'saddle-bag',
  );
  bag.position.y = bagTop - 0.052;
  add(
    root,
    sweptTube([yz(0.755, -0.247), yz(0.805, -0.243)], uniform({ w: 0.03, d: 0.016 }), {
      exponent: 3,
      radial: 8,
    }),
    mat.red,
    'rear-light',
  );

  // Bottle cages: on the seat tube (facing forward) and on the down tube (facing up).
  {
    const seatLow = yz(BB.y + 0.012, BB.z - 0.008);
    const seatMid = yz(FRAME.seatTubeMiddle.y, FRAME.seatTubeMiddle.z);
    const seatAxis = seatMid.clone().sub(seatLow).normalize();
    const seatOrigin = seatLow.clone().lerp(seatMid, 0.5);
    add(
      root,
      bottleCage(seatOrigin, seatAxis, v(0, -seatAxis.z, seatAxis.y), 0.062),
      mat.carbon,
      'cage-seat-tube',
    );
    const downLow = yz(BB.y + 0.012, BB.z + 0.02);
    const downHigh = yz(headBottom.y + 0.025, headBottom.z - 0.012);
    const downAxis = downHigh.clone().sub(downLow).normalize();
    const downOrigin = downLow.clone().lerp(downHigh, 0.3);
    add(
      root,
      bottleCage(downOrigin, downAxis, v(0, downAxis.z, -downAxis.y), 0.086),
      mat.carbon,
      'cage-down-tube',
    );
  }

  // --- Cockpit (carbon + tape): one-piece stem and bar, see `STEM` and `BAR` ---
  const stemTop = yz(FRAME.stemTop.y, FRAME.stemTop.z);
  // Steerer and spacers, along the steering axis up to the stem cap.
  add(
    root,
    sweptTube(
      [headTop.clone().addScaledVector(axisDown, 0.02), stemTop],
      uniform({ w: 0.05, d: 0.058 }),
      {
        exponent: 2.4,
      },
    ),
    mat.carbon,
    'steerer',
  );
  const barCenter = yz(COCKPIT.barCenter.y, COCKPIT.barCenter.z);
  // Stem: the same width from the cap to the bar, where it flares into the
  // bar (the fillets of the T); its height thins down to the bar's.
  {
    const start = stemTop.clone().add(v(0, -0.02, 0));
    const end = barCenter.clone().add(v(0, 0, 0.004));
    add(
      root,
      sweptTube(
        [
          start,
          start
            .clone()
            .lerp(end, 0.5)
            .add(v(0, 0.002, 0)),
          end,
        ],
        (t) => ({
          w: STEM.width + (STEM.filletWidth - STEM.width) * smooth(0.55, 1, t),
          d: 0.04 + (BAR.topsHeight + 0.002 - 0.04) * smooth(0, 0.9, t),
        }),
        { exponent: 3, radial: 16, samples: 16 },
      ),
      mat.carbon,
      'stem',
    );
  }
  // Bar: one tube from plug to plug (no joint, so no bump), flat on the tops
  // and round where the tape starts.
  add(
    root,
    sweptTube(
      barPath(),
      (_t, p) => {
        const k = smooth(BAR.flatUntil, BAR.tapeFrom, Math.abs(p.x));
        return {
          w: BAR.topsDepth + (BAR.tapeDiameter - BAR.topsDepth) * k,
          d: BAR.topsHeight + (BAR.tapeDiameter - BAR.topsHeight) * k,
        };
      },
      { exponent: 2.4, radial: 14, samples: 200 },
    ),
    mat.rubber,
    'bar',
  );
  const half = BAR.width / 2;
  for (const side of [1, -1]) {
    /** A point of this side of the bar, from its centre (`u` forwards, `h` upwards). */
    const at = (u: number, h: number, dx = 0) =>
      v(side * (half + dx), barCenter.y + h, barCenter.z + u);
    // Hood (Di2 lever body): wraps the front of the hook and runs forward to its tip.
    add(
      root,
      sweptTube(
        [
          at(BAR.hoodStart + 0.005, -0.03),
          at(0.085, -0.004),
          at(0.12, 0),
          at(BAR.hoodTip - 0.006, 0.012),
        ],
        taper({ w: 0.034, d: 0.054 }, { w: 0.026, d: 0.034 }),
        { exponent: 2.8, radial: 12, samples: 12 },
      ),
      mat.rubber,
      'hood',
    );
    // Brake lever, in front of the hook, and the shift paddle behind it.
    add(
      root,
      sweptTube(
        [
          at(BAR.hoodTip - 0.008, -0.006, 0.002),
          at(0.128, -0.06, 0.004),
          at(COCKPIT.leverBottom.z - barCenter.z, COCKPIT.leverBottom.y - barCenter.y, 0.006),
        ],
        taper({ w: 0.016, d: 0.012 }, { w: 0.02, d: 0.008 }),
        { exponent: 2.6, radial: 8, samples: 8 },
      ),
      mat.group,
      'brake-lever',
    );
    add(
      root,
      sweptTube(
        [at(0.135, -0.012, -0.012), at(0.115, -0.07, -0.012)],
        uniform({ w: 0.008, d: 0.01 }),
        {
          radial: 6,
          samples: 2,
        },
      ),
      mat.group,
    );
  }
  // Bike computer on an out-front mount: entirely in front of the bar, as on
  // the photos (it hides the top of the fork from the saddle).
  add(
    root,
    sweptTube(
      [yz(barCenter.y + 0.004, barCenter.z - 0.01), yz(barCenter.y + 0.026, barCenter.z + 0.08)],
      uniform({ w: 0.03, d: 0.012 }),
      { exponent: 3, radial: 8 },
    ),
    mat.carbon,
    'computer-mount',
  );
  add(
    root,
    sweptTube(
      [yz(barCenter.y + 0.04, barCenter.z + 0.028), yz(barCenter.y + 0.04, barCenter.z + 0.133)],
      uniform({ w: 0.056, d: 0.016 }),
      { exponent: 3.4, radial: 10, samples: 3 },
    ),
    mat.white,
    'computer',
  );
  // The screen, at the front; the rear end (towards the rider) carries the logo.
  add(
    root,
    sweptTube(
      [
        yz(barCenter.y + 0.0485, barCenter.z + 0.051),
        yz(barCenter.y + 0.0485, barCenter.z + 0.125),
      ],
      uniform({ w: 0.046, d: 0.002 }),
      { exponent: 6, radial: 8, samples: 2 },
    ),
    mat.carbon,
    'computer-screen',
  );

  // --- Wheels ---
  const makeWheel = (z: number, spec: WheelSpec, name: string) => {
    const g = wheelGeometries(spec);
    const wheel = new Group();
    wheel.name = name;
    wheel.position.set(0, WHEEL_RADIUS, z);
    add(wheel, g.tyre, mat.tyre, 'tyre');
    add(wheel, g.rim, mat.rim, 'rim');
    add(wheel, g.spokes, mat.dark, 'spokes');
    add(wheel, g.steel, mat.steel, 'steel');
    root.add(wheel);
    return wheel;
  };
  const rearWheel = makeWheel(
    REAR_AXLE.z,
    { flangeL: 0.034, flangeR: 0.022, rotorRadius: 0.07, rotorX: 0.036, cassette: true },
    'rear-wheel',
  );
  const frontWheel = makeWheel(
    FRONT_AXLE.z,
    { flangeL: 0.026, flangeR: 0.026, rotorRadius: 0.08, rotorX: 0.028, cassette: false },
    'front-wheel',
  );

  // Axle ends and calipers (disc brakes).
  for (const [axle, side] of [
    [REAR_AXLE, 0.082],
    [FRONT_AXLE, 0.062],
  ] as const) {
    for (const s of [1, -1]) {
      add(
        root,
        sweptTube(
          [v(s * (side - 0.008), axle.y, axle.z), v(s * (side + 0.006), axle.y, axle.z)],
          uniform({ w: 0.024, d: 0.024 }),
          { radial: 10 },
        ),
        mat.group,
      );
    }
  }
  const caliper = (axle: { y: number; z: number }, radius: number, angle: number, x: number) => {
    const cy = axle.y + radius * Math.sin(angle);
    const cz = axle.z + radius * Math.cos(angle);
    return plateGeometry(
      [
        [cy + 0.01 * Math.cos(angle), cz - 0.01 * Math.sin(angle), 0.016],
        [cy - 0.01 * Math.cos(angle), cz + 0.01 * Math.sin(angle), 0.013],
      ],
      0.026,
      x,
      0.003,
    );
  };
  add(root, caliper(FRONT_AXLE, 0.077, (135 * Math.PI) / 180, 0.017), mat.group, 'front-caliper');
  add(root, caliper(REAR_AXLE, 0.068, (35 * Math.PI) / 180, 0.023), mat.group, 'rear-caliper');

  // --- Drivetrain ---
  const crank = new Group();
  crank.name = 'crank';
  crank.position.set(0, BB.y, BB.z);
  add(
    crank,
    sweptTube([v(-0.078, 0, 0), v(0.078, 0, 0)], uniform({ w: 0.024, d: 0.024 }), { radial: 10 }),
    mat.group,
    'spindle',
  );
  add(
    crank,
    plateGeometry(
      [
        [0, 0, 0.026],
        [-CRANK_LENGTH, 0, 0.017],
      ],
      0.017,
      0.064,
      0.003,
    ),
    mat.group,
    'crank-left',
  );
  add(
    crank,
    plateGeometry(
      [
        [0, 0, 0.026],
        [CRANK_LENGTH, 0, 0.017],
      ],
      0.017,
      -0.081,
      0.003,
    ),
    mat.group,
    'crank-right',
  );
  add(
    crank,
    gearGeometry(50, BIG_RING_RADIUS, 0.007, 0.0028, -0.0525, 0.079),
    mat.group,
    'ring-50',
  );
  add(
    crank,
    gearGeometry(34, SMALL_RING_RADIUS, 0.007, 0.0028, -0.0425, 0.052),
    mat.group,
    'ring-34',
  );
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.5;
    add(
      crank,
      plateGeometry(
        [
          [0, 0, 0.014],
          [0.082 * Math.sin(a), 0.082 * Math.cos(a), 0.012],
        ],
        0.0095,
        -0.0555,
        0,
      ),
      mat.group,
    );
  }
  root.add(crank);

  // Rear derailleur with its oversized cage, front derailleur.
  const guide = { y: REAR_AXLE.y - 0.105, z: REAR_AXLE.z - 0.003 };
  const tension = { y: REAR_AXLE.y - 0.168, z: REAR_AXLE.z + 0.017 };
  add(
    root,
    plateGeometry(
      [
        [REAR_AXLE.y - 0.005, REAR_AXLE.z - 0.022, 0.014],
        [REAR_AXLE.y - 0.06, REAR_AXLE.z - 0.012, 0.016],
      ],
      0.03,
      -0.088,
      0.003,
    ),
    mat.group,
    'derailleur',
  );
  for (const x of [-0.0605, -0.0435]) {
    add(
      root,
      plateGeometry(
        [
          [guide.y, guide.z, 0.013],
          [tension.y, tension.z, 0.016],
        ],
        0.0025,
        x,
        0,
      ),
      mat.carbon,
      'cage',
    );
  }
  for (const p of [guide, tension]) {
    const g = gearGeometry(17, 0.0265, 0.0045, 0.012, -0.0575, 0.008);
    g.translate(0, p.y, p.z);
    add(root, g, mat.red, 'pulley');
  }
  add(
    root,
    plateGeometry(
      [
        [BB.y + 0.105, -0.125, 0.021],
        [BB.y + 0.105, -0.1, 0.019],
      ],
      0.04,
      -0.056,
      0.004,
    ),
    mat.group,
    'front-derailleur',
  );
  add(
    root,
    plateGeometry(
      [
        [BB.y + 0.093, -0.14, 0.007],
        [BB.y + 0.097, -0.04, 0.006],
      ],
      0.0045,
      -0.0585,
      0,
    ),
    mat.group,
    'front-cage',
  );

  // Brand lettering, as flat decals a hair off the surface.
  if (map && options.logos !== false) {
    const decal = (texture: Texture | null, w: number, h: number) => {
      if (!texture) return null;
      track(texture);
      const material = track(
        new MeshStandardMaterial({
          map: texture,
          transparent: true,
          roughness: 0.4,
          metalness: 0.2,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      const geometry = track(new PlaneGeometry(w, h));
      return { material, geometry };
    };
    // Down tube: SCOTT, readable from outside on both sides.
    const scott = decal(scottTexture(), 0.3, 0.058);
    if (scott) {
      const low = yz(BB.y + 0.012, BB.z + 0.02);
      const high = yz(headBottom.y + 0.025, headBottom.z - 0.012);
      const tilt = -Math.atan2(high.y - low.y, high.z - low.z);
      const centre = low.clone().lerp(high, 0.52);
      for (const side of [1, -1]) {
        const mesh = new Mesh(scott.geometry, scott.material);
        mesh.name = 'logo-scott';
        mesh.position.set(side * 0.0315, centre.y, centre.z);
        mesh.rotation.set(tilt, side === 1 ? Math.PI / 2 : -Math.PI / 2, 0);
        root.add(mesh);
      }
    }
    // Cranks: ULTEGRA along each arm, reading from the pedal to the bottom bracket
    // (the group turns with the cranks).
    const ultegra = decal(ultegraTexture(), 0.12, 0.0235);
    if (ultegra) {
      const right = new Mesh(ultegra.geometry, ultegra.material);
      right.name = 'logo-ultegra-right';
      right.position.set(-0.0818, 0.095, 0);
      right.rotation.set(Math.PI / 2, -Math.PI / 2, 0);
      crank.add(right);
      const left = new Mesh(ultegra.geometry, ultegra.material);
      left.name = 'logo-ultegra-left';
      left.position.set(0.0818, -0.095, 0);
      left.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      crank.add(left);
    }
  }

  // Chain: bottom run forward... around the chainring and sprocket, S through the cage.
  const sprocket = CHAIN_PITCH / (2 * Math.sin(Math.PI / 17));
  const path = beltPath(
    [
      { y: BB.y, z: BB.z, r: BIG_RING_RADIUS, ccw: false },
      { y: tension.y, z: tension.z, r: 0.0265, ccw: false },
      { y: guide.y, z: guide.z, r: 0.0265, ccw: true },
      { y: REAR_AXLE.y, z: REAR_AXLE.z, r: sprocket, ccw: false },
    ],
    0.01,
  );
  const band = chainBand(path);
  track(band.geometry);
  const chain = new Mesh(band.geometry, chainMaterial);
  chain.name = 'chain';
  root.add(chain);

  // --- Pedals (clipless, carbon) ---
  const pedalGeometry = (side: 1 | -1) => {
    const body = slabGeometry(
      [
        [0.032, -0.046],
        [0.034, 0.0],
        [0.03, 0.046],
        [-0.03, 0.046],
        [-0.034, 0.0],
        [-0.032, -0.046],
      ],
      0.016,
      0.004,
    );
    body.translate(0, -0.008, 0);
    const spindle = sweptTube(
      [v(-side * 0.0225, 0, 0), v(side * 0.01, 0, 0)],
      uniform({ w: 0.014, d: 0.014 }),
      { radial: 8 },
    );
    return mergeGeometries([body, spindle].map(stripToBasics)) as BufferGeometry;
  };
  const pedals = {
    l: add(root, pedalGeometry(1), mat.carbon, 'pedal-left'),
    r: add(root, pedalGeometry(-1), mat.carbon, 'pedal-right'),
  };
  const tmp = new Vector3();
  pedals.l.position.copy(pedalPosition(1, 0, tmp));
  pedals.r.position.copy(pedalPosition(-1, 0, tmp));

  const setPose = (crankAngle: number, wheelAngle: number) => {
    rearWheel.rotation.x = wheelAngle;
    frontWheel.rotation.x = wheelAngle;
    crank.rotation.x = crankAngle;
    pedals.l.position.copy(pedalPosition(1, crankAngle, tmp));
    pedals.r.position.copy(pedalPosition(-1, crankAngle, tmp));
    if (map) map.offset.x = -(((crankAngle * BIG_RING_RADIUS) / CHAIN_PITCH) % 1);
  };

  return {
    root,
    rearWheel,
    frontWheel,
    crank,
    pedals,
    setPose,
    chainLength: band.length,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
