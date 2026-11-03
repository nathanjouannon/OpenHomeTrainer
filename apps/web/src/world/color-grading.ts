// Colour grading of the world (lot 2.3): a 3D lookup table computed here
// rather than downloaded, applied after tone mapping (display-referred sRGB).
// The look: a gentle S-curve for contrast, a little more saturation (AgX
// tone mapping is rather flat), warm highlights and slightly cool shadows.
// No Three.js here, so that it can be tested.

export interface GradingLook {
  /** Slope of the S-curve at mid grey (1 = no change). */
  contrast: number;
  /** Saturation multiplier (1 = no change). */
  saturation: number;
  /** Shift of the highlights towards orange and of the shadows towards blue (0 = none). */
  warmth: number;
}

export const WORLD_LOOK: GradingLook = { contrast: 1.12, saturation: 1.18, warmth: 0.025 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Contrast S-curve through (0, 0), (0.5, 0.5) and (1, 1), monotonic for contrast < 2. */
function sCurve(x: number, contrast: number): number {
  // Blend between identity and smoothstep: slope at 0.5 is 1 + 0.5·k.
  const k = Math.min(1, Math.max(-1, (contrast - 1) * 2));
  const smooth = x * x * (3 - 2 * x);
  return x + (smooth - x) * k;
}

/** Graded colour of an sRGB colour (all components in [0, 1]). */
export function gradeColor(
  r: number,
  g: number,
  b: number,
  look: GradingLook,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  let cr = sCurve(r, look.contrast);
  let cg = sCurve(g, look.contrast);
  let cb = sCurve(b, look.contrast);
  const luma = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
  cr = luma + (cr - luma) * look.saturation;
  cg = luma + (cg - luma) * look.saturation;
  cb = luma + (cb - luma) * look.saturation;
  // Split toning: + warm above mid grey, + cool below, none at mid grey.
  const t = (luma - 0.5) * 2 * look.warmth;
  cr += t;
  cg += t * 0.35;
  cb -= t;
  out[0] = clamp01(cr);
  out[1] = clamp01(cg);
  out[2] = clamp01(cb);
  return out;
}

/** RGBA8 data of a size³ lookup table (red fastest, then green, then blue). */
export function buildGradingLut(size: number, look: GradingLook): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  const c: [number, number, number] = [0, 0, 0];
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        gradeColor(ri / (size - 1), gi / (size - 1), bi / (size - 1), look, c);
        const o = ((bi * size + gi) * size + ri) * 4;
        data[o] = Math.round(c[0] * 255);
        data[o + 1] = Math.round(c[1] * 255);
        data[o + 2] = Math.round(c[2] * 255);
        data[o + 3] = 255;
      }
    }
  }
  return data;
}
