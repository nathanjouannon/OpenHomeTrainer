// Structured workout model (docs/01 §workouts). Power is either a share of
// the rider's FTP or an absolute value; absolute only exists for `.erg` files.

export type Power = { unit: 'ftp'; value: number } | { unit: 'watts'; value: number };

export const ftp = (fraction: number): Power => ({ unit: 'ftp', value: fraction });
export const watts = (w: number): Power => ({ unit: 'watts', value: w });

export type Step =
  | { type: 'steady'; durationS: number; power: Power; label?: string }
  | { type: 'ramp'; durationS: number; from: Power; to: Power; label?: string }
  | { type: 'repeat'; times: number; steps: Step[] };

export interface Workout {
  id: string;
  name: string;
  description?: string;
  steps: Step[];
  source: 'builtin' | 'custom' | 'zwo' | 'erg' | 'mrc';
}

/** One flat piece of a workout, in watts for a given FTP. */
export interface Interval {
  startS: number;
  durationS: number;
  fromW: number;
  toW: number;
  label: string;
  /** Position in the workout, to let the UI group repeats. */
  index: number;
}

export const resolvePower = (p: Power, ftpW: number): number =>
  Math.round(p.unit === 'ftp' ? p.value * ftpW : p.value);

/** True when the workout can only be played with a known FTP. */
export function needsFtp(steps: readonly Step[]): boolean {
  return steps.some((s) =>
    s.type === 'repeat'
      ? needsFtp(s.steps)
      : s.type === 'steady'
        ? s.power.unit === 'ftp'
        : s.from.unit === 'ftp' || s.to.unit === 'ftp',
  );
}

export function stepDurationS(step: Step): number {
  return step.type === 'repeat'
    ? step.times * step.steps.reduce((a, s) => a + stepDurationS(s), 0)
    : step.durationS;
}

export const workoutDurationS = (w: Pick<Workout, 'steps'>): number =>
  w.steps.reduce((a, s) => a + stepDurationS(s), 0);

/** Default label of a piece, from its intensity (share of FTP). */
export function zoneLabel(fraction: number): string {
  if (fraction < 0.56) return 'Z1';
  if (fraction < 0.76) return 'Z2';
  if (fraction < 0.91) return 'Z3';
  if (fraction < 1.06) return 'Z4';
  if (fraction < 1.21) return 'Z5';
  return 'Z6';
}

export function flatten(workout: Pick<Workout, 'steps'>, ftpW: number): Interval[] {
  const out: Interval[] = [];
  let t = 0;
  const walk = (steps: readonly Step[]) => {
    for (const s of steps) {
      if (s.type === 'repeat') {
        for (let i = 0; i < s.times; i++) walk(s.steps);
        continue;
      }
      if (!(s.durationS > 0)) continue;
      const fromW = resolvePower(s.type === 'steady' ? s.power : s.from, ftpW);
      const toW = resolvePower(s.type === 'steady' ? s.power : s.to, ftpW);
      out.push({
        startS: t,
        durationS: s.durationS,
        fromW,
        toW,
        label: s.label ?? zoneLabel((fromW + toW) / 2 / Math.max(1, ftpW)),
        index: out.length,
      });
      t += s.durationS;
    }
  };
  walk(workout.steps);
  return out;
}

/** Normalized power-ish figures for the library card. */
export function workoutStats(intervals: readonly Interval[], ftpW: number) {
  const total = intervals.reduce((a, i) => a + i.durationS, 0);
  if (total === 0) return { durationS: 0, avgW: 0, intensityFactor: 0, tss: 0 };
  let energy = 0;
  let fourth = 0;
  for (const i of intervals) {
    const avg = (i.fromW + i.toW) / 2;
    energy += avg * i.durationS;
    fourth += avg ** 4 * i.durationS;
  }
  const np = (fourth / total) ** 0.25;
  const intensityFactor = np / Math.max(1, ftpW);
  return {
    durationS: total,
    avgW: Math.round(energy / total),
    intensityFactor,
    tss: Math.round(((total * np * intensityFactor) / (Math.max(1, ftpW) * 3600)) * 100),
  };
}
