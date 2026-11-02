import type { RideSample, RideStats } from './types';

/** Normalized power: 30 s rolling average, raised to the 4th power, averaged, 4th root. */
export function normalizedPower(powers: readonly number[]): number {
  if (powers.length === 0) return 0;
  if (powers.length < 30) return powers.reduce((a, b) => a + b, 0) / powers.length;
  let windowSum = 0;
  let sum4 = 0;
  let count = 0;
  for (let i = 0; i < powers.length; i++) {
    windowSum += powers[i] as number;
    if (i >= 30) windowSum -= powers[i - 30] as number;
    if (i >= 29) {
      sum4 += (windowSum / 30) ** 4;
      count++;
    }
  }
  return (sum4 / count) ** 0.25;
}

/**
 * Statistics over consecutive samples. `startDistanceM` / `startAltitudeM`
 * are the values just before the first sample (lap starts, ride start).
 */
export function computeStats(
  samples: readonly RideSample[],
  options: {
    ftpW?: number | null;
    startDistanceM?: number;
    startAltitudeM?: number;
    startTs?: number;
  } = {},
): RideStats {
  const n = samples.length;
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) {
    return {
      durationS: 0,
      elapsedS: 0,
      distanceM: 0,
      ascentM: 0,
      descentM: 0,
      avgSpeedMs: 0,
      maxSpeedMs: 0,
      avgPowerW: 0,
      maxPowerW: 0,
      npW: 0,
      avgCadenceRpm: 0,
      maxCadenceRpm: 0,
      avgHeartRateBpm: null,
      maxHeartRateBpm: null,
      workKj: 0,
      intensityFactor: null,
      tss: null,
    };
  }
  let power = 0;
  let maxPower = 0;
  let cadence = 0;
  let cadenceCount = 0;
  let maxCadence = 0;
  let hr = 0;
  let hrCount = 0;
  let maxHr = 0;
  let maxSpeed = 0;
  let ascent = 0;
  let descent = 0;
  let prevAlt = options.startAltitudeM ?? first.altitudeM;
  const powers: number[] = [];
  for (const s of samples) {
    power += s.powerW;
    maxPower = Math.max(maxPower, s.powerW);
    powers.push(s.powerW);
    // Average cadence ignores freewheeling, like most head units.
    if (s.cadenceRpm > 0) {
      cadence += s.cadenceRpm;
      cadenceCount++;
    }
    maxCadence = Math.max(maxCadence, s.cadenceRpm);
    if (s.heartRateBpm !== null && s.heartRateBpm > 0) {
      hr += s.heartRateBpm;
      hrCount++;
      maxHr = Math.max(maxHr, s.heartRateBpm);
    }
    maxSpeed = Math.max(maxSpeed, s.speedMs);
    const dz = s.altitudeM - prevAlt;
    if (dz > 0) ascent += dz;
    else descent -= dz;
    prevAlt = s.altitudeM;
  }
  // Each sample stands for one second of riding.
  const durationS = n;
  const distanceM = last.distanceM - (options.startDistanceM ?? first.distanceM - first.speedMs);
  const startTs = options.startTs ?? first.ts - 1000;
  const np = normalizedPower(powers);
  const ftp = options.ftpW ?? null;
  const intensityFactor = ftp ? np / ftp : null;
  const tss =
    ftp && intensityFactor !== null
      ? ((durationS * np * intensityFactor) / (ftp * 3600)) * 100
      : null;
  return {
    durationS,
    elapsedS: Math.max(durationS, Math.round((last.ts - startTs) / 1000)),
    distanceM,
    ascentM: ascent,
    descentM: descent,
    avgSpeedMs: distanceM / durationS,
    maxSpeedMs: maxSpeed,
    avgPowerW: power / n,
    maxPowerW: maxPower,
    npW: np,
    avgCadenceRpm: cadenceCount ? cadence / cadenceCount : 0,
    maxCadenceRpm: maxCadence,
    avgHeartRateBpm: hrCount ? hr / hrCount : null,
    maxHeartRateBpm: hrCount ? maxHr : null,
    workKj: power / 1000,
    intensityFactor,
    tss,
  };
}
