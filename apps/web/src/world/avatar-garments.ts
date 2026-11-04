// Which garment covers each part of the body of the rigged avatar (lot 2.10).
// The Quaternius body is a single skinned mesh with a skin texture and grey
// briefs: the cycling kit is made by giving the triangles of each region their
// own material (same vertices, same skeleton). No Three.js here.

export type Garment = 'skin' | 'jersey' | 'shorts' | 'socks' | 'gloves' | 'shoes';

/** Rest height (m) of the jersey hem and of the neckline, on the 1.81 m model. */
export const WAIST_Y = 1.0;
export const NECK_Y = 1.49;
/** Share of the upper arm covered by the sleeve, of the thigh by the shorts, of the calf bare below the sock. */
export const SLEEVE_T = 0.5;
export const SHORTS_T = 0.62;
export const SOCK_T = 0.55;
/** Share of the forearm where the glove cuff starts. */
export const CUFF_T = 0.9;

const FINGERS = /^(thumb|index|middle|ring|pinky)_/;

/**
 * Garment at a point of the body.
 * @param bone name of the bone with the largest weight (e.g. `thigh_l`)
 * @param t position along that bone, 0 at its joint and 1 at the next one
 * @param y rest height of the point
 */
export function garmentOf(bone: string, t: number, y: number): Garment {
  const part = bone.replace(/_[lr]$/, '');
  if (part === 'pelvis') return 'shorts';
  if (part.startsWith('spine') || part === 'clavicle') {
    if (y < WAIST_Y) return 'shorts';
    return y < NECK_Y ? 'jersey' : 'skin';
  }
  if (part === 'upperarm') return t < SLEEVE_T ? 'jersey' : 'skin';
  if (part === 'lowerarm') return t > CUFF_T ? 'gloves' : 'skin';
  if (part === 'hand' || FINGERS.test(part)) return 'gloves';
  if (part === 'thigh') return t < SHORTS_T ? 'shorts' : 'skin';
  if (part === 'calf') return t > SOCK_T ? 'socks' : 'skin';
  if (part === 'foot' || part === 'ball') return 'shoes';
  return 'skin';
}

/**
 * Channel of the garment mask texture (RGBA) holding each garment, `null` for
 * the bare skin. Socks and shoes are both white and share a channel.
 */
export const MASK_CHANNEL: Record<Garment, number | null> = {
  skin: null,
  jersey: 0,
  shorts: 1,
  socks: 2,
  shoes: 2,
  gloves: 3,
};

/**
 * Garment mask in UV space, RGBA bytes, `size × size`. Each vertex has 1 in
 * the channel of its garment, interpolated across the triangles: the garment
 * edge is where the mask crosses 0.5, a straight line half-way between two
 * rings of vertices instead of the jagged edge of whole triangles. The islands
 * are grown by a few pixels so that filtering never reaches an empty texel.
 */
export function rasterizeGarmentMask(
  uv: ArrayLike<number>,
  index: ArrayLike<number>,
  vertexGarment: readonly Garment[],
  size: number,
): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const covered = new Uint8Array(size * size);
  const channel = (v: number, c: number) =>
    MASK_CHANNEL[vertexGarment[v] as Garment] === c ? 255 : 0;
  for (let t = 0; t + 2 < index.length; t += 3) {
    const v = [index[t] as number, index[t + 1] as number, index[t + 2] as number] as const;
    const x = v.map((i) => (uv[i * 2] as number) * size);
    const y = v.map((i) => (uv[i * 2 + 1] as number) * size);
    const [x0, x1, x2] = x as [number, number, number];
    const [y0, y1, y2] = y as [number, number, number];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2) - 1));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2) + 1));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2) - 1));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2) + 1));
    // A pixel is covered a little outside the triangle too, so that no gap stays between two.
    const slack = -0.02;
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        const w1 = ((cx - x0) * (y2 - y0) - (x2 - x0) * (cy - y0)) / area;
        const w2 = ((x1 - x0) * (cy - y0) - (cx - x0) * (y1 - y0)) / area;
        const w0 = 1 - w1 - w2;
        if (w0 < slack || w1 < slack || w2 < slack) continue;
        const o = (py * size + px) * 4;
        for (let c = 0; c < 4; c++) {
          data[o + c] = Math.round(
            w0 * channel(v[0], c) + w1 * channel(v[1], c) + w2 * channel(v[2], c),
          );
        }
        covered[py * size + px] = 1;
      }
    }
  }
  grow(data, covered, size, 4);
  return data;
}

/** Copies the neighbouring texels into the empty ones, `passes` times. */
function grow(data: Uint8Array, covered: Uint8Array, size: number, passes: number) {
  for (let pass = 0; pass < passes; pass++) {
    const fresh: number[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (covered[i]) continue;
        const from = [
          x > 0 ? i - 1 : -1,
          x < size - 1 ? i + 1 : -1,
          y > 0 ? i - size : -1,
          y < size - 1 ? i + size : -1,
        ].find((n) => n >= 0 && covered[n]);
        if (from === undefined) continue;
        for (let c = 0; c < 4; c++) data[i * 4 + c] = data[from * 4 + c] as number;
        fresh.push(i);
      }
    }
    for (const i of fresh) covered[i] = 1;
  }
}
