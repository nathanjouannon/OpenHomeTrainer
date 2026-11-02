// Elevation profile processing (docs/04-moteur-physique.md §6).
// Every function has a `circular` flag: on a loop, windows wrap around the line.

const idx = (i: number, n: number) => ((i % n) + n) % n;

/**
 * Limits the slope to `maxGradePercent` while staying as close as possible to
 * the input: average of the lower (cut) and upper (fill) envelopes, both of
 * which respect the limit, so the average does too.
 */
export function limitGrade(
  z: Float64Array,
  stepM: number,
  maxGradePercent: number,
  circular: boolean,
): Float64Array {
  const n = z.length;
  const maxDz = (maxGradePercent / 100) * stepM;
  const cut = Float64Array.from(z);
  const fill = Float64Array.from(z);
  // Two laps of forward and backward passes give the exact envelopes on a cycle.
  const laps = circular ? 2 : 1;
  for (let lap = 0; lap < laps; lap++) {
    for (let i = circular ? 0 : 1; i < n; i++) {
      const p = idx(i - 1, n);
      cut[i] = Math.min(cut[i] as number, (cut[p] as number) + maxDz);
      fill[i] = Math.max(fill[i] as number, (fill[p] as number) - maxDz);
    }
    for (let i = circular ? n - 1 : n - 2; i >= 0; i--) {
      const q = idx(i + 1, n);
      cut[i] = Math.min(cut[i] as number, (cut[q] as number) + maxDz);
      fill[i] = Math.max(fill[i] as number, (fill[q] as number) - maxDz);
    }
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = ((cut[i] as number) + (fill[i] as number)) / 2;
  return out;
}

/** Moving average over ±halfWindow samples, repeated `passes` times (≈ Gaussian). */
export function smooth(
  values: Float64Array,
  halfWindow: number,
  passes: number,
  circular: boolean,
): Float64Array {
  const n = values.length;
  let src = values;
  for (let p = 0; p < passes; p++) {
    const dst = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let count = 0;
      for (let k = -halfWindow; k <= halfWindow; k++) {
        const j = i + k;
        if (!circular && (j < 0 || j >= n)) continue;
        sum += src[idx(j, n)] as number;
        count++;
      }
      dst[i] = sum / count;
    }
    src = dst;
  }
  return src;
}

/** Grade (%) from a centered difference over ±halfWindow samples, clamped. */
export function computeGrades(
  z: Float64Array,
  stepM: number,
  halfWindow: number,
  circular: boolean,
  maxAbsGradePercent = 25,
): Float64Array {
  const n = z.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = circular ? idx(i - halfWindow, n) : Math.max(0, i - halfWindow);
    const b = circular ? idx(i + halfWindow, n) : Math.min(n - 1, i + halfWindow);
    const span = circular ? 2 * halfWindow : b - a;
    const g = span > 0 ? (((z[b] as number) - (z[a] as number)) / (span * stepM)) * 100 : 0;
    out[i] = Math.max(-maxAbsGradePercent, Math.min(maxAbsGradePercent, g));
  }
  return out;
}

/** Total ascent and descent (m), including the closing segment of a loop. */
export function ascentDescent(
  z: Float64Array,
  circular: boolean,
): { ascentM: number; descentM: number } {
  let ascentM = 0;
  let descentM = 0;
  const n = z.length;
  const last = circular ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const dz = (z[idx(i + 1, n)] as number) - (z[i] as number);
    if (dz > 0) ascentM += dz;
    else descentM -= dz;
  }
  return { ascentM, descentM };
}
