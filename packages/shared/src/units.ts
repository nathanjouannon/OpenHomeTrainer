// SI units everywhere internally; conversions happen only at display time.

export const msToKmh = (speedMs: number): number => speedMs * 3.6;
export const kmhToMs = (speedKmh: number): number => speedKmh / 3.6;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
