import { ByteReader } from '../bytes';

/** Decoded Indoor Bike Data (0x2AD2). Only fields flagged as present are set. */
export interface IndoorBikeData {
  speedKmh?: number;
  averageSpeedKmh?: number;
  cadenceRpm?: number;
  averageCadenceRpm?: number;
  totalDistanceM?: number;
  resistanceLevel?: number;
  powerW?: number;
  averagePowerW?: number;
  totalEnergyKcal?: number;
  energyPerHourKcal?: number;
  energyPerMinuteKcal?: number;
  heartRateBpm?: number;
  metabolicEquivalent?: number;
  elapsedTimeS?: number;
  remainingTimeS?: number;
}

const bit = (flags: number, n: number) => (flags & (1 << n)) !== 0;

/**
 * Flag-driven parser. Beware: bit 0 is "More Data" with inverted logic,
 * the instantaneous speed is present when it is 0.
 */
export function parseIndoorBikeData(view: DataView): IndoorBikeData {
  const r = new ByteReader(view);
  const flags = r.uint16();
  const out: IndoorBikeData = {};
  if (!bit(flags, 0)) out.speedKmh = r.uint16() / 100;
  if (bit(flags, 1)) out.averageSpeedKmh = r.uint16() / 100;
  if (bit(flags, 2)) out.cadenceRpm = r.uint16() / 2;
  if (bit(flags, 3)) out.averageCadenceRpm = r.uint16() / 2;
  if (bit(flags, 4)) out.totalDistanceM = r.uint24();
  if (bit(flags, 5)) out.resistanceLevel = r.sint16();
  if (bit(flags, 6)) out.powerW = r.sint16();
  if (bit(flags, 7)) out.averagePowerW = r.sint16();
  if (bit(flags, 8)) {
    out.totalEnergyKcal = r.uint16();
    out.energyPerHourKcal = r.uint16();
    out.energyPerMinuteKcal = r.uint8();
  }
  if (bit(flags, 9)) out.heartRateBpm = r.uint8();
  if (bit(flags, 10)) out.metabolicEquivalent = r.uint8() / 10;
  if (bit(flags, 11)) out.elapsedTimeS = r.uint16();
  if (bit(flags, 12)) out.remainingTimeS = r.uint16();
  return out;
}
