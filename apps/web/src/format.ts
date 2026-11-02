// Display formatting. SI units inside, conversion only here (docs/14 §2).

import type { Language, Units } from './store/settings';

const KM_PER_MILE = 1.609344;
const M_PER_FT = 0.3048;

export interface Formatter {
  speed(ms: number): string;
  speedUnit: string;
  distance(m: number, decimals?: number): string;
  distanceUnit: string;
  elevation(m: number): string;
  elevationUnit: string;
  /** Number with the locale's decimal separator. */
  num(v: number, decimals?: number): string;
}

export function formatter(units: Units, lang: Language): Formatter {
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const num = (v: number, decimals = 0) =>
    v.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const imperial = units === 'imperial';
  return {
    speed: (ms) => num(imperial ? (ms * 3.6) / KM_PER_MILE : ms * 3.6, 1),
    speedUnit: imperial ? 'mph' : 'km/h',
    distance: (m, decimals = 1) => num(imperial ? m / 1000 / KM_PER_MILE : m / 1000, decimals),
    distanceUnit: imperial ? 'mi' : 'km',
    elevation: (m) => num(imperial ? m / M_PER_FT : m, 0),
    elevationUnit: imperial ? 'ft' : 'm',
    num,
  };
}

/** 3725 → "1:02:05"; 125 → "2:05". */
export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Signed delta, e.g. "−0:12" or "+1:03". */
export function formatDelta(deltaS: number): string {
  return `${deltaS < 0 ? '−' : '+'}${formatDuration(Math.abs(deltaS))}`;
}

/** Colour band of a grade (docs/09 §4): 0–3, 3–6, 6–9, > 9 %. */
export function gradeBand(gradePercent: number): 'down' | 'flat' | 'g1' | 'g2' | 'g3' {
  if (gradePercent < -1) return 'down';
  if (gradePercent < 3) return 'flat';
  if (gradePercent < 6) return 'g1';
  if (gradePercent < 9) return 'g2';
  return 'g3';
}
