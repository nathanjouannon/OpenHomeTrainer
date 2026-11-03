/** One recorded sample, every second of riding (pauses excluded). */
export interface RideSample {
  /** Riding time since the start, in s (1, 2, 3…). */
  t: number;
  /** Wall-clock time (Unix epoch, ms). */
  ts: number;
  /** Average power over the last second, in W. */
  powerW: number;
  /** Average cadence over the last second, in rpm. */
  cadenceRpm: number;
  heartRateBpm: number | null;
  speedMs: number;
  /** Total distance, in m. */
  distanceM: number;
  /** 1-based lap number. */
  lap: number;
  lapDistanceM: number;
  altitudeM: number;
  gradePercent: number;
  /** Virtual gear (chainring index × cog count + cog index, 0 = easiest), or null without virtual shifting. */
  gear: number | null;
}

export interface RideStats {
  durationS: number;
  elapsedS: number;
  distanceM: number;
  ascentM: number;
  descentM: number;
  avgSpeedMs: number;
  maxSpeedMs: number;
  avgPowerW: number;
  maxPowerW: number;
  /** Normalized power (30 s rolling average, 4th power mean). */
  npW: number;
  avgCadenceRpm: number;
  maxCadenceRpm: number;
  avgHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  workKj: number;
  /** Intensity factor and training stress score; null without FTP. */
  intensityFactor: number | null;
  tss: number | null;
}

export type LapTrigger = 'loop' | 'manual' | 'end';

export interface RideLap {
  /** 1-based. */
  index: number;
  startS: number;
  endS: number;
  trigger: LapTrigger;
  stats: RideStats;
}

export type RideStatus = 'recording' | 'finished';

/** Ride header (stored apart from the samples). */
export interface RideHeader {
  id: string;
  /** Unix epoch, ms. */
  startedAt: number;
  updatedAt: number;
  status: RideStatus;
  route: { id: string; name: { fr: string; en: string }; lengthM: number; loop: boolean } | null;
  worldId: string | null;
  rider: { weightKg: number; ftpW: number | null };
  appVersion: string;
  /** Riding time, s. */
  durationS: number;
  distanceM: number;
  ascentM: number;
  stats: RideStats | null;
  laps: RideLap[];
  bestLapS: number | null;
  /** Optional goal set before the start. */
  goal: { kind: 'duration' | 'distance' | 'laps'; value: number } | null;
}
