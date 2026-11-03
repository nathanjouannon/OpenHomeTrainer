// Radiance .hdr (RGBE) reading and writing, enough to prepare an environment
// map: find the sun in it, then clip it so that only the directional light of
// the scene (which casts the shadows) lights the world directly.

export interface HdrImage {
  width: number;
  height: number;
  /** Linear RGB, row 0 = top of the image. */
  data: Float32Array;
}

export function parseHdr(buf: Uint8Array): HdrImage {
  let pos = 0;
  const line = () => {
    let s = '';
    while (pos < buf.length && buf[pos] !== 0x0a) s += String.fromCharCode(buf[pos++] as number);
    pos++;
    return s;
  };
  const magic = line();
  if (!magic.startsWith('#?')) throw new Error('Not a Radiance HDR file');
  for (let l = line(); l !== ''; l = line()) {
    if (l.startsWith('FORMAT=') && l !== 'FORMAT=32-bit_rle_rgbe') {
      throw new Error(`Unsupported HDR format ${l}`);
    }
  }
  const size = /^-Y (\d+) \+X (\d+)$/.exec(line());
  if (!size) throw new Error('Unsupported HDR orientation');
  const height = Number(size[1]);
  const width = Number(size[2]);
  const data = new Float32Array(width * height * 3);
  const scan = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    const rle =
      width >= 8 &&
      width < 0x8000 &&
      buf[pos] === 2 &&
      buf[pos + 1] === 2 &&
      !((buf[pos + 2] as number) & 0x80);
    if (rle) {
      if (((buf[pos + 2] as number) << 8) + (buf[pos + 3] as number) !== width) {
        throw new Error('Bad HDR scanline width');
      }
      pos += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < width) {
          let count = buf[pos++] as number;
          if (count > 128) {
            count -= 128;
            const v = buf[pos++] as number;
            for (let k = 0; k < count; k++) scan[x++ * 4 + c] = v;
          } else {
            for (let k = 0; k < count; k++) scan[x++ * 4 + c] = buf[pos++] as number;
          }
        }
      }
    } else {
      scan.set(buf.subarray(pos, pos + width * 4));
      pos += width * 4;
    }
    for (let x = 0; x < width; x++) {
      const e = scan[x * 4 + 3] as number;
      const f = e === 0 ? 0 : 2 ** (e - 136);
      const o = (y * width + x) * 3;
      data[o] = (scan[x * 4] as number) * f;
      data[o + 1] = (scan[x * 4 + 1] as number) * f;
      data[o + 2] = (scan[x * 4 + 2] as number) * f;
    }
  }
  return { width, height, data };
}

/** RGBE pixel of a linear colour. */
function toRgbe(r: number, g: number, b: number, out: Uint8Array, o: number) {
  const m = Math.max(r, g, b);
  if (m < 1e-32) {
    out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
    return;
  }
  const e = Math.ceil(Math.log2(m) + 1e-9);
  const f = 256 / 2 ** e;
  out[o] = Math.min(255, Math.floor(r * f));
  out[o + 1] = Math.min(255, Math.floor(g * f));
  out[o + 2] = Math.min(255, Math.floor(b * f));
  out[o + 3] = e + 128;
}

/** Writes RLE scanlines (literal runs only, always valid for readers). */
export function writeHdr(img: HdrImage): Uint8Array {
  const { width, height, data } = img;
  const header = new TextEncoder().encode(
    `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`,
  );
  const chunks: Uint8Array[] = [header];
  const scan = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      toRgbe(data[o] as number, data[o + 1] as number, data[o + 2] as number, scan, x * 4);
    }
    const out: number[] = [2, 2, width >> 8, width & 0xff];
    for (let c = 0; c < 4; c++) {
      for (let x = 0; x < width; x += 128) {
        const n = Math.min(128, width - x);
        out.push(n);
        for (let k = 0; k < n; k++) out.push(scan[(x + k) * 4 + c] as number);
      }
    }
    chunks.push(Uint8Array.from(out));
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const file = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    file.set(c, p);
    p += c.length;
  }
  return file;
}

const luminance = (d: Float32Array, o: number) =>
  0.2126 * (d[o] as number) + 0.7152 * (d[o + 1] as number) + 0.0722 * (d[o + 2] as number);

export interface SunInfo {
  /**
   * Direction of the sun in the equirectangular convention of Three.js:
   * azimuth = atan2(z, x), elevation = asin(y).
   */
  azimuthRad: number;
  elevationRad: number;
  /** Peak luminance before clipping. */
  peak: number;
}

/** The brightest pixel of an equirectangular image. */
export function findSun(img: HdrImage): SunInfo {
  let best = -1;
  let peak = -1;
  for (let i = 0; i < img.width * img.height; i++) {
    const l = luminance(img.data, i * 3);
    if (l > peak) {
      peak = l;
      best = i;
    }
  }
  const x = best % img.width;
  const y = Math.floor(best / img.width);
  const u = (x + 0.5) / img.width;
  const v = 1 - (y + 0.5) / img.height;
  return { azimuthRad: (u - 0.5) * 2 * Math.PI, elevationRad: (v - 0.5) * Math.PI, peak };
}

/** Scales down every pixel brighter than `maxLuminance` (keeps its hue). Returns the count. */
export function clipHighlights(img: HdrImage, maxLuminance: number): number {
  let clipped = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const o = i * 3;
    const l = luminance(img.data, o);
    if (l <= maxLuminance) continue;
    const k = maxLuminance / l;
    img.data[o] = (img.data[o] as number) * k;
    img.data[o + 1] = (img.data[o + 1] as number) * k;
    img.data[o + 2] = (img.data[o + 2] as number) * k;
    clipped++;
  }
  return clipped;
}

/** Luminance below which `share` of the pixels lie (to pick a clipping level). */
export function luminancePercentile(img: HdrImage, share: number): number {
  const n = img.width * img.height;
  const l = new Float32Array(n);
  for (let i = 0; i < n; i++) l[i] = luminance(img.data, i * 3);
  l.sort();
  return l[Math.min(n - 1, Math.floor(share * n))] as number;
}
