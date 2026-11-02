// FIT Activity export (docs/07-donnees-et-api.md §4): one record per second,
// one lap per loop lap, sport cycling / virtual_activity, no GPS position in mode A.

import type { RideHeader, RideLap, RideSample, RideStats } from '../types';
import { type FitField, FitWriter, toFitTime } from './writer';

const MESG = {
  fileId: 0,
  session: 18,
  lap: 19,
  record: 20,
  event: 21,
  deviceInfo: 23,
  activity: 34,
};
const SPORT_CYCLING = 2;
const SUB_SPORT_VIRTUAL_ACTIVITY = 58;
const MANUFACTURER_DEVELOPMENT = 255;
const EVENT = { timer: 0, session: 8, lap: 9, activity: 26 };
const EVENT_TYPE = { start: 0, stop: 1, stopAll: 4 };
const LAP_TRIGGER = { manual: 0, sessionEnd: 7, positionLap: 4 };

const LOCAL = { fileId: 0, deviceInfo: 1, event: 2, record: 3, lap: 4, session: 5, activity: 6 };

const SUMMARY_FIELDS: FitField[] = [
  { num: 253, type: 'uint32' }, // timestamp
  { num: 2, type: 'uint32' }, // start_time
  { num: 7, type: 'uint32' }, // total_elapsed_time (ms)
  { num: 8, type: 'uint32' }, // total_timer_time (ms)
  { num: 9, type: 'uint32' }, // total_distance (cm)
  { num: 0, type: 'enum' }, // event
  { num: 1, type: 'enum' }, // event_type
];

/** Field numbers that differ between lap (19) and session (18). */
const LAP_STAT_NUMS = {
  avgSpeed: 13,
  maxSpeed: 14,
  avgHr: 15,
  maxHr: 16,
  avgCadence: 17,
  maxCadence: 18,
  avgPower: 19,
  maxPower: 20,
  ascent: 21,
  descent: 22,
  np: 33,
  totalWork: 41,
};
const SESSION_STAT_NUMS = {
  avgSpeed: 14,
  maxSpeed: 15,
  avgHr: 16,
  maxHr: 17,
  avgCadence: 18,
  maxCadence: 19,
  avgPower: 20,
  maxPower: 21,
  ascent: 22,
  descent: 23,
  np: 34,
  totalWork: 48,
};

const statFields = (nums: typeof LAP_STAT_NUMS): FitField[] => [
  { num: nums.avgSpeed, type: 'uint16' },
  { num: nums.maxSpeed, type: 'uint16' },
  { num: nums.avgHr, type: 'uint8' },
  { num: nums.maxHr, type: 'uint8' },
  { num: nums.avgCadence, type: 'uint8' },
  { num: nums.maxCadence, type: 'uint8' },
  { num: nums.avgPower, type: 'uint16' },
  { num: nums.maxPower, type: 'uint16' },
  { num: nums.ascent, type: 'uint16' },
  { num: nums.descent, type: 'uint16' },
  { num: nums.np, type: 'uint16' },
  { num: nums.totalWork, type: 'uint32' },
];

const statValues = (s: RideStats) => [
  s.avgSpeedMs * 1000,
  s.maxSpeedMs * 1000,
  s.avgHeartRateBpm,
  s.maxHeartRateBpm,
  s.avgCadenceRpm,
  s.maxCadenceRpm,
  s.avgPowerW,
  s.maxPowerW,
  s.ascentM,
  s.descentM,
  s.npW,
  s.workKj * 1000,
];

export interface FitExportOptions {
  productName?: string;
  /** Serial number written in file_id (must be non-zero). */
  serialNumber?: number;
}

/** Wall-clock time of a riding time `t`, interpolated from the samples. */
function wallTimeAt(samples: readonly RideSample[], startedAt: number, t: number): number {
  if (t <= 0) return startedAt;
  const i = Math.min(samples.length - 1, Math.max(0, Math.ceil(t) - 1));
  const s = samples[i];
  if (!s) return startedAt + t * 1000;
  return s.ts - (s.t - t) * 1000;
}

export function encodeRideFit(
  header: RideHeader,
  samples: readonly RideSample[],
  options: FitExportOptions = {},
): Uint8Array<ArrayBuffer> {
  if (header.status !== 'finished' || !header.stats) {
    throw new Error('Only finished rides can be exported');
  }
  const w = new FitWriter();
  const start = toFitTime(header.startedAt);
  const endMs = samples.at(-1)?.ts ?? header.startedAt;
  const end = toFitTime(endMs);

  w.define(LOCAL.fileId, MESG.fileId, [
    { num: 0, type: 'enum' }, // type
    { num: 1, type: 'uint16' }, // manufacturer
    { num: 2, type: 'uint16' }, // product
    { num: 3, type: 'uint32z' }, // serial_number
    { num: 4, type: 'uint32' }, // time_created
    { num: 8, type: 'string', size: 20 }, // product_name
  ]);
  w.write(LOCAL.fileId, [
    4, // activity
    MANUFACTURER_DEVELOPMENT,
    1,
    options.serialNumber ?? 1,
    start,
    options.productName ?? 'HomeRealTrainer',
  ]);

  w.define(LOCAL.deviceInfo, MESG.deviceInfo, [
    { num: 253, type: 'uint32' }, // timestamp
    { num: 0, type: 'uint8' }, // device_index (0 = creator)
    { num: 2, type: 'uint16' }, // manufacturer
    { num: 4, type: 'uint16' }, // product
    { num: 27, type: 'string', size: 20 }, // product_name
  ]);
  w.write(LOCAL.deviceInfo, [
    start,
    0,
    MANUFACTURER_DEVELOPMENT,
    1,
    options.productName ?? 'HomeRealTrainer',
  ]);

  w.define(LOCAL.event, MESG.event, [
    { num: 253, type: 'uint32' },
    { num: 0, type: 'enum' },
    { num: 1, type: 'enum' },
  ]);
  w.write(LOCAL.event, [start, EVENT.timer, EVENT_TYPE.start]);

  w.define(LOCAL.record, MESG.record, [
    { num: 253, type: 'uint32' }, // timestamp
    { num: 5, type: 'uint32' }, // distance (cm)
    { num: 6, type: 'uint16' }, // speed (mm/s)
    { num: 7, type: 'uint16' }, // power
    { num: 4, type: 'uint8' }, // cadence
    { num: 3, type: 'uint8' }, // heart_rate
    { num: 2, type: 'uint16' }, // altitude (scale 5, offset 500)
    { num: 9, type: 'sint16' }, // grade (scale 100)
  ]);
  let previousTs = -1;
  for (const s of samples) {
    const ts = toFitTime(s.ts);
    // Pauses can make the wall clock jump, but it must never go backwards.
    const stamp = Math.max(ts, previousTs + 1);
    previousTs = stamp;
    w.write(LOCAL.record, [
      stamp,
      s.distanceM * 100,
      s.speedMs * 1000,
      s.powerW,
      s.cadenceRpm,
      s.heartRateBpm,
      (s.altitudeM + 500) * 5,
      s.gradePercent * 100,
    ]);
  }

  w.define(LOCAL.lap, MESG.lap, [
    ...SUMMARY_FIELDS,
    { num: 254, type: 'uint16' }, // message_index
    { num: 24, type: 'enum' }, // lap_trigger
    { num: 25, type: 'enum' }, // sport
    { num: 39, type: 'enum' }, // sub_sport
    ...statFields(LAP_STAT_NUMS),
  ]);
  header.laps.forEach((lap: RideLap, i) => {
    const lapStart = wallTimeAt(samples, header.startedAt, lap.startS);
    const lapEnd = wallTimeAt(samples, header.startedAt, lap.endS);
    const trigger =
      lap.trigger === 'loop'
        ? LAP_TRIGGER.positionLap
        : lap.trigger === 'manual'
          ? LAP_TRIGGER.manual
          : LAP_TRIGGER.sessionEnd;
    w.write(LOCAL.lap, [
      Math.max(toFitTime(lapEnd), toFitTime(lapStart)),
      toFitTime(lapStart),
      lapEnd - lapStart,
      (lap.endS - lap.startS) * 1000,
      lap.stats.distanceM * 100,
      EVENT.lap,
      EVENT_TYPE.stop,
      i,
      trigger,
      SPORT_CYCLING,
      SUB_SPORT_VIRTUAL_ACTIVITY,
      ...statValues(lap.stats),
    ]);
  });

  const s = header.stats;
  w.define(LOCAL.session, MESG.session, [
    ...SUMMARY_FIELDS,
    { num: 254, type: 'uint16' }, // message_index
    { num: 5, type: 'enum' }, // sport
    { num: 6, type: 'enum' }, // sub_sport
    { num: 25, type: 'uint16' }, // first_lap_index
    { num: 26, type: 'uint16' }, // num_laps
    { num: 28, type: 'enum' }, // trigger (activity_end)
    { num: 35, type: 'uint16' }, // training_stress_score (scale 10)
    { num: 36, type: 'uint16' }, // intensity_factor (scale 1000)
    { num: 45, type: 'uint16' }, // threshold_power
    ...statFields(SESSION_STAT_NUMS),
  ]);
  w.write(LOCAL.event, [end, EVENT.timer, EVENT_TYPE.stopAll]);
  w.write(LOCAL.session, [
    end,
    start,
    endMs - header.startedAt,
    s.durationS * 1000,
    s.distanceM * 100,
    EVENT.session,
    EVENT_TYPE.stop,
    0,
    SPORT_CYCLING,
    SUB_SPORT_VIRTUAL_ACTIVITY,
    0,
    header.laps.length,
    0,
    s.tss === null ? null : s.tss * 10,
    s.intensityFactor === null ? null : s.intensityFactor * 1000,
    header.rider.ftpW,
    ...statValues(s),
  ]);

  w.define(LOCAL.activity, MESG.activity, [
    { num: 253, type: 'uint32' }, // timestamp
    { num: 0, type: 'uint32' }, // total_timer_time (ms)
    { num: 1, type: 'uint16' }, // num_sessions
    { num: 2, type: 'enum' }, // type (manual)
    { num: 3, type: 'enum' }, // event
    { num: 4, type: 'enum' }, // event_type
    { num: 5, type: 'uint32' }, // local_timestamp
  ]);
  const tzOffsetS = -new Date(endMs).getTimezoneOffset() * 60;
  w.write(LOCAL.activity, [
    end,
    s.durationS * 1000,
    1,
    0,
    EVENT.activity,
    EVENT_TYPE.stop,
    end + tzOffsetS,
  ]);
  return w.finish();
}

/** File name like "2026-11-02_18-30_boucle-du-lac.fit". */
export function fitFileName(header: RideHeader): string {
  const d = new Date(header.startedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${date}_${header.route?.id ?? 'sortie'}.fit`;
}
