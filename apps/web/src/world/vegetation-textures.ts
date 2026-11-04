// Pictures of the vegetation (lot 2.6), painted in code at load time on 2D
// canvases (no asset to download, nothing to license): sprigs of needles and
// clusters of leaves for the crowns, a picture of each tree for its imposter,
// tufts of grass and flowers. Each atlas is turned into a mipmapped texture
// whose transparent pixels carry the colour of their cell, so that the edges
// of the cards do not turn dark in the distance.

import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import {
  cellUv,
  FOLIAGE_ATLAS,
  FOLIAGE_CELLS,
  GRASS_ATLAS,
  GRASS_CELLS,
  IMPOSTER_ATLAS,
  MODEL_SIZE,
  type ModelName,
  type UvRect,
} from './vegetation-builders';
import { mulberry32 } from './world-data';

type Ctx = CanvasRenderingContext2D;

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

function newCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not available');
  return { canvas, ctx };
}

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pixels of the canvas as a texture: fully transparent pixels take the mean
 * colour of the opaque ones of their cell (no dark fringe in the mipmaps).
 */
function toTexture(canvas: HTMLCanvasElement, cells: readonly Cell[]): DataTexture {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d') as Ctx;
  const src = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h * 4);
  for (const cell of cells) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = cell.y; y < cell.y + cell.h; y++) {
      for (let x = cell.x; x < cell.x + cell.w; x++) {
        const i = (y * w + x) * 4;
        if ((src[i + 3] as number) > 200) {
          r += src[i] as number;
          g += src[i + 1] as number;
          b += src[i + 2] as number;
          n++;
        }
      }
    }
    const mean = n > 0 ? [r / n, g / n, b / n] : [70, 100, 50];
    for (let y = cell.y; y < cell.y + cell.h; y++) {
      for (let x = cell.x; x < cell.x + cell.w; x++) {
        const i = (y * w + x) * 4;
        // Rows are flipped: the first row of a texture is its bottom.
        const o = ((h - 1 - y) * w + x) * 4;
        const a = src[i + 3] as number;
        const opaque = a > 24;
        data[o] = opaque ? (src[i] as number) : (mean[0] as number);
        data[o + 1] = opaque ? (src[i + 1] as number) : (mean[1] as number);
        data[o + 2] = opaque ? (src[i + 2] as number) : (mean[2] as number);
        data[o + 3] = a;
      }
    }
  }
  const t = new DataTexture(data, w, h);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// --------------------------------------------------------------- foliage

/** A sprig of conifer needles lying along x, root on the left. */
function paintSprig(ctx: Ctx, c: Cell, rand: () => number) {
  ctx.save();
  ctx.translate(c.x, c.y);
  const mid = c.h / 2;
  ctx.lineCap = 'round';
  // Main twig, slightly curved.
  ctx.strokeStyle = hsl(28, 35, 22);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(2, mid);
  ctx.quadraticCurveTo(c.w * 0.5, mid + 6, c.w - 6, mid - 4);
  ctx.stroke();
  const twigs = 34;
  for (let i = 0; i < twigs; i++) {
    const t = (i + rand() * 0.6) / twigs;
    const x = 10 + t * (c.w - 40);
    const reach =
      (c.h / 2 - 12) * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85)) * (0.65 + rand() * 0.35);
    for (const side of [-1, 1]) {
      const angle = side * (0.7 + rand() * 0.35);
      const ex = x + Math.sin(Math.abs(angle)) * reach * 0.8 + 14;
      const ey = mid + side * Math.cos(angle * 0.9) * reach;
      ctx.strokeStyle = hsl(30, 30, 24);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, mid);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // Needles along the twig, both sides, shorter at the tip.
      const needles = 16;
      for (let k = 0; k < needles; k++) {
        const f = (k + rand()) / needles;
        const px = x + (ex - x) * f;
        const py = mid + (ey - mid) * f;
        const len = (13 + rand() * 9) * (1 - 0.45 * f);
        for (const turn of [-1, 1]) {
          const a = Math.atan2(ey - mid, ex - x) + turn * (0.7 + rand() * 0.5);
          const light = 24 + rand() * 14 + f * 9;
          ctx.strokeStyle = hsl(100 + rand() * 18, 42 + rand() * 14, light);
          ctx.lineWidth = 1.7 + rand() * 0.6;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}

/** A cluster of leaves, filling a disc. */
function paintLeaves(ctx: Ctx, c: Cell, rand: () => number) {
  ctx.save();
  ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
  const R = c.w * 0.46;
  const n = 175;
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(rand()) * (R - 28);
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const rot = rand() * Math.PI;
    const length = 46 + rand() * 26;
    const width = length * (0.42 + rand() * 0.12);
    // Darker towards the middle (in the shade of its neighbours), lighter on the rim.
    const rim = r / R;
    const hue = 78 + rand() * 26;
    const light = 30 + rand() * 16 + rim * 14;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, length / 2, width / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = hsl(hue, 52 + rand() * 14, light);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = hsl(hue + 4, 46, light - 10);
    ctx.stroke();
    // Midrib.
    ctx.beginPath();
    ctx.moveTo(-length / 2 + 3, 0);
    ctx.lineTo(length / 2 - 4, 0);
    ctx.strokeStyle = hsl(hue + 10, 44, light + 14, 0.8);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** Foliage atlas: sprig, leaf cluster and an opaque white texel for the bark. */
export function foliageTexture(): DataTexture {
  const { canvas, ctx } = newCanvas(FOLIAGE_ATLAS.width, FOLIAGE_ATLAS.height);
  const rand = mulberry32(61);
  paintSprig(ctx, FOLIAGE_CELLS.sprig, rand);
  paintLeaves(ctx, FOLIAGE_CELLS.leaf, rand);
  ctx.fillStyle = '#ffffff';
  const s = FOLIAGE_CELLS.solid;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  return toTexture(canvas, [FOLIAGE_CELLS.sprig, FOLIAGE_CELLS.leaf, FOLIAGE_CELLS.solid]);
}

// -------------------------------------------------------------- imposters

type Painter = (ctx: Ctx, widthM: number, heightM: number, rand: () => number) => void;

/** A fir-like shape: tiers of drooping branches, dark inside, lighter on the tips. */
const paintConiferImposter =
  (bottomM: number, tiers: number, hue: number): Painter =>
  (ctx, w, h, rand) => {
    ctx.fillStyle = hsl(28, 30, 22);
    ctx.fillRect(-0.12, 0.1, 0.24, h - 0.4);
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const y = h - 0.5 - (h - bottomM - 0.5) * t;
      // t = 0 is the top tier: the narrowest.
      const half = (w / 2) * (0.1 + 0.9 * t) + 0.15;
      const drop = 0.9 + t * 0.7;
      ctx.beginPath();
      ctx.moveTo(0, y - drop - 0.7);
      for (let k = 0; k <= 10; k++) {
        const f = k / 10;
        const jag = (k % 2 === 0 ? 0 : 0.18) + rand() * 0.15;
        ctx.lineTo(-half * f - jag * 0.4, y - drop * (1 - f * 0.9) + (rand() - 0.5) * 0.2);
      }
      ctx.lineTo(0, y + 0.3);
      for (let k = 10; k >= 0; k--) {
        const f = k / 10;
        const jag = (k % 2 === 0 ? 0 : 0.18) + rand() * 0.15;
        ctx.lineTo(half * f + jag * 0.4, y - drop * (1 - f * 0.9) + (rand() - 0.5) * 0.2);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(-half, 0, half, 0);
      g.addColorStop(0, hsl(hue, 38, 13 + t * 4));
      g.addColorStop(0.55, hsl(hue, 40, 21 + t * 5));
      g.addColorStop(1, hsl(hue - 4, 38, 15 + t * 4));
      ctx.fillStyle = g;
      ctx.fill();
      // Texture of the needles.
      for (let s = 0; s < 70; s++) {
        const px = (rand() * 2 - 1) * half * 0.9;
        const py = y - rand() * drop;
        ctx.strokeStyle = hsl(hue + rand() * 12, 42, 16 + rand() * 16, 0.7);
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + (rand() - 0.5) * 0.5, py - rand() * 0.35);
        ctx.stroke();
      }
    }
  };

/** A rounded crown made of overlapping clumps of leaves, lit from the upper left. */
const paintBroadleafImposter =
  (
    trunkTopM: number,
    crownR: [number, number],
    crownCentreM: number,
    hue: number,
    clump = 1,
  ): Painter =>
  (ctx, w, h, rand) => {
    ctx.fillStyle = hsl(30, 12, 38);
    ctx.fillRect(-0.16, 0, 0.32, trunkTopM + 0.6);
    const clumps = Math.round(150 / clump);
    for (let i = 0; i < clumps; i++) {
      let x: number;
      let y: number;
      do {
        x = rand() * 2 - 1;
        y = rand() * 2 - 1;
      } while (x * x + y * y > 1);
      const px = x * crownR[0];
      const py = crownCentreM + y * crownR[1];
      const r = (0.45 + rand() * 0.6) * clump;
      // Light from the upper left: the top of the crown is bright, its underside dark.
      const lit = 0.5 + 0.5 * (y * 0.7 - x * 0.3);
      const light = 17 + lit * 20 + rand() * 6;
      const g = ctx.createRadialGradient(px - r * 0.3, py + r * 0.3, r * 0.1, px, py, r);
      g.addColorStop(0, hsl(hue + rand() * 14, 46, light + 8));
      g.addColorStop(1, hsl(hue + rand() * 10, 44, light - 4));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    void w;
    void h;
  };

const IMPOSTER_PAINTERS: Record<Exclude<ModelName, 'bush'>, Painter> = {
  spruce: paintConiferImposter(1.6, 9, 118),
  pine: paintConiferImposter(5.8, 6, 112),
  beech: paintBroadleafImposter(3.3, [3.3, 2.9], 6.3, 96),
  poplar: paintBroadleafImposter(3.4, [1.5, 4.6], 8.2, 102, 0.65),
};

export const IMPOSTER_ORDER = ['spruce', 'pine', 'beech', 'poplar'] as const;

/** UV rectangle of a tree's picture in the imposter atlas. */
export const imposterUv = (name: (typeof IMPOSTER_ORDER)[number]): UvRect => {
  const i = IMPOSTER_ORDER.indexOf(name);
  return cellUv(
    i * IMPOSTER_ATLAS.cellW,
    0,
    IMPOSTER_ATLAS.cellW,
    IMPOSTER_ATLAS.cellH,
    IMPOSTER_ATLAS.width,
    IMPOSTER_ATLAS.height,
  );
};

/** One picture per tree species, each drawn in metres into its cell. */
export function imposterTexture(): DataTexture {
  const { canvas, ctx } = newCanvas(IMPOSTER_ATLAS.width, IMPOSTER_ATLAS.height);
  const cells: Cell[] = [];
  IMPOSTER_ORDER.forEach((name, i) => {
    const cell = {
      x: i * IMPOSTER_ATLAS.cellW,
      y: 0,
      w: IMPOSTER_ATLAS.cellW,
      h: IMPOSTER_ATLAS.cellH,
    };
    cells.push(cell);
    const { widthM, heightM } = MODEL_SIZE[name];
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.w, cell.h);
    ctx.clip();
    // Metres, y up, the foot of the tree at the bottom middle of the cell.
    ctx.translate(cell.x + cell.w / 2, cell.y + cell.h);
    ctx.scale(cell.w / widthM, -cell.h / heightM);
    IMPOSTER_PAINTERS[name](ctx, widthM, heightM, mulberry32(80 + i));
    ctx.restore();
  });
  return toTexture(canvas, cells);
}

// ----------------------------------------------------------------- grass

/** Blades fanning out from the foot of the cell. */
function paintBlades(
  ctx: Ctx,
  c: Cell,
  rand: () => number,
  o: { count: number; height: number; spread: number; hue: [number, number]; seeds?: boolean },
) {
  ctx.save();
  ctx.translate(c.x + c.w / 2, c.y + c.h);
  ctx.lineCap = 'round';
  for (let i = 0; i < o.count; i++) {
    const a = (rand() - 0.5) * o.spread;
    const len = c.h * o.height * (0.45 + rand() * 0.55);
    const bend = (rand() - 0.5) * 0.55;
    const x0 = (rand() - 0.5) * c.w * 0.3;
    const tipX = x0 + Math.sin(a) * len + bend * len * 0.5;
    const tipY = -Math.cos(a) * len;
    const w = 2.2 + rand() * 2.2;
    const hue = o.hue[0] + rand() * (o.hue[1] - o.hue[0]);
    const g = ctx.createLinearGradient(0, 0, 0, tipY);
    g.addColorStop(0, hsl(hue, 42, 14));
    g.addColorStop(0.5, hsl(hue, 48, 30));
    g.addColorStop(1, hsl(hue + 10, 52, 46));
    ctx.strokeStyle = g;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.quadraticCurveTo(x0 + Math.sin(a) * len * 0.5, tipY * 0.55, tipX, tipY);
    ctx.stroke();
    if (o.seeds && rand() < 0.4) {
      ctx.strokeStyle = hsl(45, 40, 52);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + bend * 6, tipY - 14 - rand() * 10);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A flower plant: stalks with a few leaves and flower heads. */
function paintFlowers(
  ctx: Ctx,
  c: Cell,
  rand: () => number,
  o: { petals: string; centre: string; heads: number; petalCount: number; headR: number },
) {
  paintBlades(ctx, c, rand, { count: 14, height: 0.45, spread: 1.1, hue: [88, 108] });
  ctx.save();
  ctx.translate(c.x + c.w / 2, c.y + c.h);
  for (let i = 0; i < o.heads; i++) {
    const a = (rand() - 0.5) * 0.9;
    const len = c.h * (0.5 + rand() * 0.38);
    const hx = Math.sin(a) * len;
    const hy = -Math.cos(a) * len;
    const x0 = (rand() - 0.5) * 30;
    ctx.strokeStyle = hsl(100, 40, 28);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.quadraticCurveTo(x0 + hx * 0.2, hy * 0.5, hx, hy);
    ctx.stroke();
    const r = o.headR * (0.8 + rand() * 0.4);
    for (let p = 0; p < o.petalCount; p++) {
      const pa = (p / o.petalCount) * Math.PI * 2 + rand() * 0.2;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(pa);
      ctx.beginPath();
      ctx.ellipse(r * 0.9, 0, r * 0.95, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fillStyle = o.petals;
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = o.centre;
    ctx.fill();
  }
  ctx.restore();
}

/** Grass atlas: a clump, a tall tuft with seed heads, and three kinds of flower. */
export function grassTexture(): DataTexture {
  const { canvas, ctx } = newCanvas(GRASS_ATLAS.width, GRASS_ATLAS.height);
  const rand = mulberry32(131);
  const cell = (k: keyof typeof GRASS_CELLS): Cell => ({
    x: GRASS_CELLS[k].x,
    y: GRASS_CELLS[k].y,
    w: GRASS_ATLAS.cell,
    h: GRASS_ATLAS.cell,
  });
  paintBlades(ctx, cell('grass'), rand, { count: 70, height: 0.8, spread: 1.5, hue: [78, 104] });
  paintBlades(ctx, cell('tall'), rand, {
    count: 46,
    height: 0.98,
    spread: 0.95,
    hue: [70, 96],
    seeds: true,
  });
  paintFlowers(ctx, cell('daisy'), rand, {
    petals: '#f6f4ee',
    centre: '#e8b923',
    heads: 6,
    petalCount: 10,
    headR: 13,
  });
  paintFlowers(ctx, cell('buttercup'), rand, {
    petals: '#f2c81c',
    centre: '#c98d0c',
    heads: 7,
    petalCount: 6,
    headR: 11,
  });
  paintFlowers(ctx, cell('violet'), rand, {
    petals: '#8d5fc4',
    centre: '#f1e6a0',
    heads: 6,
    petalCount: 5,
    headR: 12,
  });
  return toTexture(
    canvas,
    (Object.keys(GRASS_CELLS) as (keyof typeof GRASS_CELLS)[]).map((k) => cell(k)),
  );
}
