// Geometry of the vegetation (lot 2.6): trees, shrubs, grass clumps and
// flowers, generated in code (the CC0 tree models available are millions of
// triangles each, far too heavy to instance by the ten thousand).
//
// A tree is a skeleton (trunk, branches, and the cards of foliage they carry)
// drawn at 3 levels of detail from the same skeleton, so that the silhouette
// does not change from one level to the next: LOD 1 keeps a third of the
// branches with larger cards, LOD 2 a tenth. Far away, a pair of crossed
// quads (the imposter) with a painted picture of the tree.
//
// Foliage is made of alpha-tested cards (see vegetation-textures.ts for the
// pictures) whose normals point away from the centre of the crown, so that a
// crown is lit as a volume rather than as a heap of flat cards.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SPECIES_INDEX, type Species, speciesOf, type VegetationBatch } from './plants';
import { CHUNKS_PER_SIDE, toScene } from './scene-builders';
import { mulberry32, type Terrain } from './world-data';

/** A rectangle of a texture, in UV space (v up). */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** UV rectangle of a cell of `w × h` pixels at (x, y) (top-left origin) in a `W × H` atlas. */
export const cellUv = (
  x: number,
  y: number,
  w: number,
  h: number,
  W: number,
  H: number,
): UvRect => ({
  u0: x / W,
  u1: (x + w) / W,
  v0: 1 - (y + h) / H,
  v1: 1 - y / H,
});

/** Pixel cells of the foliage atlas (1024 × 512), see vegetation-textures.ts. */
export const FOLIAGE_ATLAS = { width: 1024, height: 512 } as const;
export const FOLIAGE_CELLS = {
  sprig: { x: 0, y: 0, w: 512, h: 320 },
  leaf: { x: 512, y: 0, w: 512, h: 512 },
  /** Opaque white, for the bark. */
  solid: { x: 0, y: 400, w: 16, h: 16 },
} as const;
export const FOLIAGE_UV = {
  sprig: cellUv(
    FOLIAGE_CELLS.sprig.x,
    FOLIAGE_CELLS.sprig.y,
    FOLIAGE_CELLS.sprig.w,
    FOLIAGE_CELLS.sprig.h,
    FOLIAGE_ATLAS.width,
    FOLIAGE_ATLAS.height,
  ),
  leaf: cellUv(
    FOLIAGE_CELLS.leaf.x,
    FOLIAGE_CELLS.leaf.y,
    FOLIAGE_CELLS.leaf.w,
    FOLIAGE_CELLS.leaf.h,
    FOLIAGE_ATLAS.width,
    FOLIAGE_ATLAS.height,
  ),
  solid: cellUv(
    FOLIAGE_CELLS.solid.x + 4,
    FOLIAGE_CELLS.solid.y + 4,
    8,
    8,
    FOLIAGE_ATLAS.width,
    FOLIAGE_ATLAS.height,
  ),
};

/** Imposter atlas: 4 cells of 256 × 512, in the order of the tree species. */
export const IMPOSTER_ATLAS = { width: 1024, height: 512, cellW: 256, cellH: 512 } as const;

/** Grass atlas: 5 cells of 256 × 256 (clump, tall tuft, three flowers). */
export const GRASS_ATLAS = { width: 1024, height: 512, cell: 256 } as const;
export const GRASS_CELLS = {
  grass: { x: 0, y: 0 },
  tall: { x: 256, y: 0 },
  daisy: { x: 512, y: 0 },
  buttercup: { x: 768, y: 0 },
  violet: { x: 0, y: 256 },
} as const;
export const grassUv = (kind: keyof typeof GRASS_CELLS): UvRect =>
  cellUv(
    GRASS_CELLS[kind].x,
    GRASS_CELLS[kind].y,
    GRASS_ATLAS.cell,
    GRASS_ATLAS.cell,
    GRASS_ATLAS.width,
    GRASS_ATLAS.height,
  );

// ---------------------------------------------------------------- builder

type Rgb = readonly [number, number, number];

const BARK_SPRUCE: Rgb = [0.34, 0.25, 0.19];
const BARK_PINE: Rgb = [0.5, 0.31, 0.2];
const BARK_BEECH: Rgb = [0.52, 0.5, 0.46];
const BARK_POPLAR: Rgb = [0.44, 0.4, 0.34];
const BARK_BUSH: Rgb = [0.3, 0.22, 0.16];

/** Accumulates a mesh: positions, normals, vertex colours (ambient occlusion), UVs. */
class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  private vertex(p: Vector3, n: Vector3, c: Rgb, u: number, v: number): number {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.colors.push(c[0], c[1], c[2]);
    this.uvs.push(u, v);
    return this.positions.length / 3 - 1;
  }

  /** A tapered tube from `a` to `b` (radius r0 at a, r1 at b), open at both ends. */
  tube(
    a: Vector3,
    b: Vector3,
    r0: number,
    r1: number,
    sides: number,
    color: Rgb,
    shade0 = 1,
    shade1 = 1,
  ) {
    const axis = b.clone().sub(a).normalize();
    const helper = Math.abs(axis.y) > 0.95 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const side = new Vector3().crossVectors(axis, helper).normalize();
    const front = new Vector3().crossVectors(side, axis).normalize();
    const uv = FOLIAGE_UV.solid;
    const first = this.positions.length / 3;
    for (let ring = 0; ring < 2; ring++) {
      const centre = ring === 0 ? a : b;
      const r = ring === 0 ? r0 : r1;
      const k = ring === 0 ? shade0 : shade1;
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        const n = side
          .clone()
          .multiplyScalar(Math.cos(angle))
          .addScaledVector(front, Math.sin(angle));
        const p = centre.clone().addScaledVector(n, r);
        this.vertex(p, n, [color[0] * k, color[1] * k, color[2] * k], uv.u0, uv.v0);
      }
    }
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const a0 = first + i;
      const a1 = first + j;
      const b0 = first + sides + i;
      const b1 = first + sides + j;
      this.indices.push(a0, b0, a1, a1, b0, b1);
    }
  }

  /**
   * A card of foliage: `length` along `along` from `origin` (or centred on it),
   * `width` across. The winding makes it face away from `crown`; the shading
   * normal is mostly the direction from the crown centre.
   */
  card(
    origin: Vector3,
    along: Vector3,
    across: Vector3,
    length: number,
    width: number,
    uv: UvRect,
    radial: Vector3,
    shade: number,
    centred = false,
    tilt = 0.6,
  ) {
    const start = centred ? origin.clone().addScaledVector(along, -length / 2) : origin;
    const p00 = start.clone().addScaledVector(across, -width / 2);
    const p10 = start.clone().addScaledVector(across, width / 2);
    const p01 = p00.clone().addScaledVector(along, length);
    const p11 = p10.clone().addScaledVector(along, length);
    // Geometric normal of (p00, p10, p11): across × along.
    const geometric = new Vector3().crossVectors(across, along).normalize();
    const flip = geometric.dot(radial) < 0;
    if (flip) geometric.negate();
    const n = radial
      .clone()
      .multiplyScalar(1 - tilt)
      .addScaledVector(geometric, tilt)
      .normalize();
    const c: Rgb = [shade, shade, shade];
    const i00 = this.vertex(p00, n, c, uv.u0, uv.v0);
    const i10 = this.vertex(p10, n, c, uv.u0, uv.v1);
    const i11 = this.vertex(p11, n, c, uv.u1, uv.v1);
    const i01 = this.vertex(p01, n, c, uv.u1, uv.v0);
    if (flip) this.indices.push(i00, i11, i10, i00, i01, i11);
    else this.indices.push(i00, i10, i11, i00, i11, i01);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    g.setIndex(this.indices);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- skeleton

interface Limb {
  from: Vector3;
  to: Vector3;
  r0: number;
  r1: number;
  /** Only drawn as a tube at the highest level of detail. */
  tube: boolean;
}

interface Card {
  origin: Vector3;
  along: Vector3;
  across: Vector3;
  length: number;
  width: number;
  kind: 'sprig' | 'leaf';
  centred: boolean;
  shade: number;
  radial: Vector3;
  /** Importance: 0 cards survive every level of detail, higher ones the closer ones only. */
  rank: number;
  /** Conifers thin out by whole whorls: kept at LOD 1 when set (overrides `rank`). */
  lod1?: boolean;
}

interface Skeleton {
  trunk: { height: number; r0: number; r1: number; color: Rgb; lean: Vector3 };
  limbs: Limb[];
  cards: Card[];
}

/** Level of detail of a mesh: share of the cards kept, their growth, sides of the tubes. */
const LODS = [
  { keep: 1, grow: 1, sides: 7, branches: true },
  { keep: 0.38, grow: 1.4, sides: 5, branches: false },
] as const;

const UP = new Vector3(0, 1, 0);

/** Perpendicular to `along`, as horizontal as possible, rotated by `roll` around it. */
function acrossOf(along: Vector3, roll: number): Vector3 {
  const side = new Vector3().crossVectors(
    along,
    Math.abs(along.y) > 0.95 ? new Vector3(1, 0, 0) : UP,
  );
  side.normalize();
  const up = new Vector3().crossVectors(side, along).normalize();
  return side.multiplyScalar(Math.cos(roll)).addScaledVector(up, Math.sin(roll)).normalize();
}

/** Direction pointing away from the crown, from the centre of an ellipsoid. */
function radialOf(p: Vector3, centre: Vector3, radii: Vector3): Vector3 {
  const d = p.clone().sub(centre);
  const n = new Vector3(
    d.x / (radii.x * radii.x),
    d.y / (radii.y * radii.y),
    d.z / (radii.z * radii.z),
  );
  if (n.lengthSq() < 1e-9) return UP.clone();
  return n.normalize();
}

/** Ambient occlusion of a card: dark inside the crown and low down, bright on the outside. */
function occlusion(p: Vector3, centre: Vector3, radii: Vector3, heightFrac: number): number {
  const d = Math.hypot(
    (p.x - centre.x) / radii.x,
    (p.y - centre.y) / radii.y,
    (p.z - centre.z) / radii.z,
  );
  const outer = Math.min(1, d);
  return (0.68 + 0.32 * outer * outer) * (0.84 + 0.16 * heightFrac);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Spruce: straight trunk, whorls of drooping branches, a narrow cone. */
function spruce(): Skeleton {
  const rand = mulberry32(101);
  const H = 11;
  const limbs: Limb[] = [];
  const cards: Card[] = [];
  const centre = new Vector3(0, 5.8, 0);
  const radii = new Vector3(2.7, 6, 2.7);
  let whorl = 0;
  for (let y = 1.7; y < H - 0.8; y += 0.4, whorl++) {
    const t = (y - 1.7) / (H - 2.5);
    const L = 0.35 + 2.35 * (1 - t) ** 0.85;
    const n = t > 0.7 ? 4 : 6;
    for (let k = 0; k < n; k++) {
      const a = whorl * 2.4 + (k / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const droop = lerp(-0.5, -0.12, t) + (rand() - 0.5) * 0.18;
      const dir = new Vector3(
        Math.cos(a) * Math.cos(droop),
        Math.sin(droop),
        Math.sin(a) * Math.cos(droop),
      );
      const from = new Vector3(0, y, 0);
      const to = from.clone().addScaledVector(dir, L);
      limbs.push({ from, to, r0: 0.05 * (1 - t * 0.6), r1: 0.012, tube: true });
      // The sprig lifts a little at the tip, like the real ones.
      const along = dir
        .clone()
        .add(new Vector3(0, 0.18, 0))
        .normalize();
      const start = from.clone().addScaledVector(dir, L * 0.18);
      const mid = start.clone().addScaledVector(along, L * 0.4);
      const shade = occlusion(mid, centre, radii, y / H) * (0.92 + rand() * 0.16);
      const radial = radialOf(mid, centre, new Vector3(1, 3, 1))
        .setY(0.25)
        .normalize();
      for (let c = 0; c < 2; c++) {
        cards.push({
          origin: start,
          along,
          across: acrossOf(along, c === 0 ? 0.25 : 0.25 + 1.0),
          length: L * 0.92,
          width: L * 0.56 + 0.4,
          kind: 'sprig',
          centred: false,
          shade,
          radial,
          rank: rand(),
          lod1: whorl % 2 === 0,
        });
      }
    }
  }
  // Leader at the top of the tree.
  for (let c = 0; c < 2; c++) {
    cards.push({
      origin: new Vector3(0, H - 1.6, 0),
      along: UP.clone(),
      across: acrossOf(UP, (c * Math.PI) / 2 + 0.3),
      length: 1.9,
      width: 0.9,
      kind: 'sprig',
      centred: false,
      shade: 1,
      radial: new Vector3(c === 0 ? 1 : 0, 0.3, c === 0 ? 0 : 1).normalize(),
      rank: 0,
      lod1: true,
    });
  }
  return {
    trunk: { height: H - 0.4, r0: 0.3, r1: 0.04, color: BARK_SPRUCE, lean: new Vector3() },
    limbs,
    cards,
  };
}

/** Pine: tall bare trunk with a leaning, irregular crown of wide sprigs. */
function pine(): Skeleton {
  const rand = mulberry32(202);
  const H = 14;
  const limbs: Limb[] = [];
  const cards: Card[] = [];
  const centre = new Vector3(0.3, 10, 0);
  const radii = new Vector3(2.9, 4.3, 2.9);
  for (let i = 0; i < 38; i++) {
    const t = i / 37;
    const y = lerp(5.8, H - 0.8, t) + (rand() - 0.5) * 0.3;
    const L = lerp(2.9, 0.9, t ** 0.9) * (0.7 + rand() * 0.6);
    const a = i * 2.4 + rand();
    const rise = lerp(-0.1, 0.5, t) + (rand() - 0.5) * 0.3;
    const dir = new Vector3(
      Math.cos(a) * Math.cos(rise),
      Math.sin(rise),
      Math.sin(a) * Math.cos(rise),
    );
    const from = new Vector3(0, y, 0);
    const to = from.clone().addScaledVector(dir, L);
    limbs.push({ from, to, r0: 0.06 * (1 - t * 0.5), r1: 0.015, tube: true });
    const along = dir.clone();
    const mid = from.clone().addScaledVector(dir, L * 0.65);
    const shade = occlusion(mid, centre, radii, y / H) * (0.9 + rand() * 0.2);
    const radial = radialOf(mid, centre, radii);
    for (let c = 0; c < 2; c++) {
      cards.push({
        origin: from.clone().addScaledVector(dir, L * 0.3),
        along,
        across: acrossOf(along, c * 1.1 + rand() * 0.4),
        length: L * 0.9 + 0.5,
        width: L * 0.75 + 0.5,
        kind: 'sprig',
        centred: false,
        shade,
        radial,
        rank: rand(),
        lod1: i % 2 === 0,
      });
    }
  }
  return {
    trunk: { height: H - 1, r0: 0.34, r1: 0.05, color: BARK_PINE, lean: new Vector3(0.35, 0, 0) },
    limbs,
    cards,
  };
}

/** A deciduous crown: limbs spreading from the top of the trunk, clusters of leaves around and inside. */
function deciduous(
  seed: number,
  o: {
    trunkH: number;
    crown: Vector3;
    radii: Vector3;
    limbs: number;
    limbLen: [number, number];
    limbRise: [number, number];
    clusters: number;
    clusterSize: [number, number];
    bark: Rgb;
    trunkR: number;
  },
): Skeleton {
  const rand = mulberry32(seed);
  const limbs: Limb[] = [];
  const cards: Card[] = [];
  const top = new Vector3(0, o.trunkH, 0);
  const anchors: Vector3[] = [];
  for (let i = 0; i < o.limbs; i++) {
    const a = (i / o.limbs) * Math.PI * 2 + rand() * 0.8;
    const rise = lerp(o.limbRise[0], o.limbRise[1], rand());
    const L = lerp(o.limbLen[0], o.limbLen[1], rand());
    const dir = new Vector3(
      Math.cos(a) * Math.cos(rise),
      Math.sin(rise),
      Math.sin(a) * Math.cos(rise),
    );
    const from = top.clone().add(new Vector3(0, -rand() * 0.6, 0));
    const to = from.clone().addScaledVector(dir, L);
    limbs.push({ from, to, r0: o.trunkR * 0.5, r1: 0.04, tube: true });
    anchors.push(to);
    // Twigs on the way out.
    for (let s = 0; s < 3; s++) {
      const f = 0.4 + s * 0.2;
      const base = from.clone().lerp(to, f);
      const ta = a + (rand() - 0.5) * 2.4;
      const tdir = new Vector3(Math.cos(ta), rand() * 0.7 + 0.1, Math.sin(ta)).normalize();
      const tl = L * (0.3 + rand() * 0.25);
      const tip = base.clone().addScaledVector(tdir, tl);
      limbs.push({ from: base, to: tip, r0: o.trunkR * 0.18, r1: 0.02, tube: true });
      anchors.push(tip);
    }
  }
  for (let i = 0; i < o.clusters; i++) {
    // Mostly at the tips of the limbs and twigs, the rest filling the crown.
    let p: Vector3;
    if (i < anchors.length * 1.5) {
      const base = anchors[i % anchors.length] as Vector3;
      p = base
        .clone()
        .add(new Vector3(rand() - 0.5, rand() * 0.6 - 0.2, rand() - 0.5).multiplyScalar(1.1));
    } else {
      let q: Vector3;
      do {
        q = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      } while (q.lengthSq() > 1);
      p = o.crown.clone().add(q.multiply(o.radii));
    }
    const radial = radialOf(p, o.crown, o.radii);
    const size = lerp(o.clusterSize[0], o.clusterSize[1], rand());
    // A card faces mostly outwards, turned at random around that.
    const along = acrossOf(radial, rand() * Math.PI * 2);
    const across = new Vector3().crossVectors(radial, along).normalize();
    cards.push({
      origin: p,
      along,
      across,
      length: size,
      width: size,
      kind: 'leaf',
      centred: true,
      shade: occlusion(p, o.crown, o.radii, p.y / (o.crown.y + o.radii.y)) * (0.9 + rand() * 0.2),
      radial,
      rank: rand(),
    });
  }
  return {
    trunk: {
      height: o.trunkH,
      r0: o.trunkR,
      r1: o.trunkR * 0.5,
      color: o.bark,
      lean: new Vector3(),
    },
    limbs,
    cards,
  };
}

const beech = () =>
  deciduous(303, {
    trunkH: 3.3,
    crown: new Vector3(0, 6.3, 0),
    radii: new Vector3(3.4, 3.0, 3.4),
    limbs: 6,
    limbLen: [2.4, 3.4],
    limbRise: [0.55, 0.95],
    clusters: 210,
    clusterSize: [1.8, 2.5],
    bark: BARK_BEECH,
    trunkR: 0.3,
  });

const poplar = () =>
  deciduous(404, {
    trunkH: 3.4,
    crown: new Vector3(0, 8.2, 0),
    radii: new Vector3(1.9, 4.7, 1.9),
    limbs: 6,
    limbLen: [2.0, 3.6],
    limbRise: [1.1, 1.45],
    clusters: 190,
    clusterSize: [1.5, 2.1],
    bark: BARK_POPLAR,
    trunkR: 0.22,
  });

const bush = () =>
  deciduous(505, {
    trunkH: 0.25,
    crown: new Vector3(0, 0.7, 0),
    radii: new Vector3(0.95, 0.7, 0.95),
    limbs: 5,
    limbLen: [0.5, 0.9],
    limbRise: [0.5, 1.0],
    clusters: 40,
    clusterSize: [0.55, 0.85],
    bark: BARK_BUSH,
    trunkR: 0.04,
  });

const SKELETONS = { spruce, pine, beech, poplar, bush } as const;
export type ModelName = keyof typeof SKELETONS;

/** Height of each species at scale 1 (m), and the width of its crown. */
export const MODEL_SIZE: Record<ModelName, { heightM: number; widthM: number }> = {
  spruce: { heightM: 11, widthM: 5.4 },
  pine: { heightM: 14, widthM: 6.2 },
  beech: { heightM: 9.6, widthM: 7.4 },
  poplar: { heightM: 13, widthM: 4.2 },
  bush: { heightM: 1.5, widthM: 2.1 },
};

/** Meshes of a species at the given level of detail (0 = most detailed). */
export function buildModel(name: ModelName, lod: 0 | 1): BufferGeometry {
  const sk = SKELETONS[name]();
  const { keep, grow, sides, branches } = LODS[lod];
  const mesh = new MeshBuilder();
  // Trunk: three segments, following the lean.
  const { trunk } = sk;
  const segments = lod === 0 ? 3 : 1;
  for (let i = 0; i < segments; i++) {
    const f0 = i / segments;
    const f1 = (i + 1) / segments;
    const at = (f: number) =>
      new Vector3(trunk.lean.x * f * f, trunk.height * f, trunk.lean.z * f * f);
    mesh.tube(
      at(f0),
      at(f1),
      lerp(trunk.r0, trunk.r1, f0),
      lerp(trunk.r0, trunk.r1, f1),
      sides + (lod === 0 ? 2 : 0),
      trunk.color,
      0.75 + 0.25 * f0,
      0.75 + 0.25 * f1,
    );
  }
  if (branches) {
    for (const l of sk.limbs) {
      if (l.tube) mesh.tube(l.from, l.to, l.r0, l.r1, 3, trunk.color, 0.9, 1);
    }
  }
  for (const c of sk.cards) {
    if (lod === 1 && c.lod1 !== undefined ? !c.lod1 : c.rank >= keep) continue;
    // Whorls and branches kept at LOD 1 grow to cover the ones left out.
    const g = lod === 1 && c.lod1 ? 1.5 : grow;
    mesh.card(
      c.origin,
      c.along,
      c.across,
      c.length * g,
      c.width * g,
      FOLIAGE_UV[c.kind],
      c.radial,
      c.shade,
      c.centred,
    );
  }
  return mesh.build();
}

/** Opaque silhouette of a tree for the shadow maps (positions only). */
export function buildShadowModel(name: ModelName): BufferGeometry {
  const flat = (g: BufferGeometry) => {
    const out = new BufferGeometry();
    out.setAttribute('position', (g.index ? g.toNonIndexed() : g).getAttribute('position'));
    return out;
  };
  const { heightM, widthM } = MODEL_SIZE[name];
  const parts: BufferGeometry[] = [];
  const cone = (radius: number, height: number, y: number, sides: number) => {
    const g = new BufferGeometry();
    const p: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      // Side and base of a cone.
      p.push(
        0,
        y + height,
        0,
        Math.cos(a0) * radius,
        y,
        Math.sin(a0) * radius,
        Math.cos(a1) * radius,
        y,
        Math.sin(a1) * radius,
      );
      p.push(
        0,
        y,
        0,
        Math.cos(a1) * radius,
        y,
        Math.sin(a1) * radius,
        Math.cos(a0) * radius,
        y,
        Math.sin(a0) * radius,
      );
    }
    g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
    return g;
  };
  if (name === 'spruce' || name === 'pine') {
    const bottom = name === 'spruce' ? 1.6 : 5.6;
    parts.push(cone(0.22, bottom + 1, 0, 3));
    parts.push(cone(widthM * 0.5, (heightM - bottom) * 0.62, bottom, 6));
    parts.push(
      cone(widthM * 0.33, (heightM - bottom) * 0.55, bottom + (heightM - bottom) * 0.45, 6),
    );
  } else if (name === 'bush') {
    parts.push(
      flat(
        new IcosahedronGeometry(1, 0)
          .scale(widthM * 0.45, heightM * 0.45, widthM * 0.45)
          .translate(0, heightM * 0.45, 0),
      ),
    );
  } else {
    parts.push(cone(0.22, 3.6, 0, 3));
    parts.push(
      flat(
        new IcosahedronGeometry(1, 0)
          .scale(widthM * 0.46, heightM * (name === 'poplar' ? 0.36 : 0.3), widthM * 0.46)
          .translate(0, heightM * (name === 'poplar' ? 0.62 : 0.65), 0),
      ),
    );
  }
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error(`Could not build the shadow of ${name}`);
  return merged;
}

/** Crossed quads standing on the ground, textured with `uv`: the far-away tree. */
export function buildImposter(name: ModelName, uv: UvRect, quads = 2): BufferGeometry {
  const { heightM, widthM } = MODEL_SIZE[name];
  const m = new MeshBuilder();
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < quads; i++) {
    const a = (i * Math.PI) / quads;
    const across = new Vector3(Math.cos(a), 0, Math.sin(a));
    // Vertical card: both faces up-lit, the shading normal pointing up and out.
    for (const sign of [1, -1]) {
      const radial = across
        .clone()
        .multiplyScalar(sign)
        .multiplyScalar(0.5)
        .add(new Vector3(0, 0.6, 0))
        .normalize();
      m.card(
        new Vector3(0, 0, 0).addScaledVector(across, 0),
        up,
        across.clone().multiplyScalar(sign),
        heightM,
        widthM,
        uv,
        radial,
        0.85,
        false,
        0.2,
      );
    }
  }
  return m.build();
}

// ---------------------------------------------------------- grass and flowers

/**
 * A clump of grass: `blades` quads standing on the ground and crossing at
 * regular angles, with the texture cell `uv`. Normals point up (grass is lit
 * like the ground it grows on). `bend` is 0 at the root and 1 at the tip: the
 * wind moves the tip only.
 */
export function buildClump(uv: UvRect, widthM: number, heightM: number, quads = 3): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const bend: number[] = [];
  const indices: number[] = [];
  for (let q = 0; q < quads; q++) {
    const a = (q / quads) * Math.PI;
    const dx = Math.cos(a) * widthM * 0.5;
    const dz = Math.sin(a) * widthM * 0.5;
    const i = positions.length / 3;
    positions.push(-dx, 0, -dz, dx, 0, dz, dx, heightM, dz, -dx, heightM, -dz);
    for (let k = 0; k < 4; k++) normals.push(0, 1, 0);
    uvs.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
    bend.push(0, 0, 1, 1);
    // One winding: the material is double-sided with a fixed (up) shading normal.
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.setAttribute('bend', new BufferAttribute(new Float32Array(bend), 1));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- instances

/** A tree or a shrub to place. */
export interface PlantInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  /** 0..1, for the variation of size and colour. */
  tint: number;
  species: Species;
}

/** Colour multiplier of an instance (the picture carries the real colours). */
export function instanceTint(species: Species, tint: number, out = new Color()): Color {
  const l = 0.8 + 0.3 * tint;
  switch (species) {
    case 'spruce':
      return out.setRGB(0.88 * l, 1.0 * l, 0.96 * l);
    case 'pine':
      return out.setRGB(1.0 * l, 1.0 * l, 0.84 * l);
    case 'beech':
      return out.setRGB((0.92 + 0.2 * tint) * l, 1.0 * l, 0.8 * l);
    case 'poplar':
      return out.setRGB(0.98 * l, 1.05 * l, 0.78 * l);
    default:
      return out.setRGB((0.85 + 0.35 * tint) * l, 1.0 * l, (0.7 + 0.3 * (1 - tint)) * l);
  }
}

/** Groups plants by terrain chunk (scene instance matrices and colours). */
export function batchPlants(
  plants: readonly PlantInstance[],
  t: Terrain,
  base: number,
): VegetationBatch[] {
  const half = t.sizeM / 2;
  const chunkM = t.sizeM / CHUNKS_PER_SIDE;
  const groups = new Map<number, PlantInstance[]>();
  for (const p of plants) {
    const col = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((p.x + half) / chunkM));
    const row = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((half - p.y) / chunkM));
    const key = row * CHUNKS_PER_SIDE + col;
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const pos = new Vector3();
  const scale = new Vector3();
  const color = new Color();
  const out: VegetationBatch[] = [];
  for (const [chunk, list] of groups) {
    const matrices = new Float32Array(list.length * 16);
    const colors = new Float32Array(list.length * 3);
    const species = new Uint8Array(list.length);
    list.forEach((p, i) => {
      toScene(p.x, p.y, p.z - 0.3, base, pos);
      q.setFromAxisAngle(up, p.rotation);
      scale.set(p.scale, p.scale * (0.88 + p.tint * 0.3), p.scale);
      m.compose(pos, q, scale).toArray(matrices, i * 16);
      instanceTint(p.species, p.tint, color);
      colors.set([color.r, color.g, color.b], i * 3);
      species[i] = SPECIES_INDEX[p.species];
    });
    const row = Math.floor(chunk / CHUNKS_PER_SIDE);
    const col = chunk % CHUNKS_PER_SIDE;
    out.push({
      chunk,
      center: { x: -half + (col + 0.5) * chunkM, z: -half + (row + 0.5) * chunkM },
      matrices,
      colors,
      species,
      count: list.length,
    });
  }
  return out;
}

/** Species of a tree of the forest (see placeTrees). */
export const plantOf = (tree: {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  tint: number;
  kind: 'conifer' | 'broadleaf';
}): PlantInstance => ({ ...tree, species: speciesOf(tree.kind, tree.x, tree.y, tree.z) });
