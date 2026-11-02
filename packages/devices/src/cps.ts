import { ByteReader } from './bytes';

export interface CyclingPowerMeasurement {
  powerW: number;
  /** Cumulative crank revolutions (uint16, wraps around). */
  crankRevolutions?: number;
  /** Last crank event time, in 1/1024 s (uint16, wraps around). */
  lastCrankEventTime?: number;
}

const bit = (flags: number, n: number) => (flags & (1 << n)) !== 0;

/** Cycling Power Measurement (0x2A63). Optional fields are skipped in spec order. */
export function parseCyclingPowerMeasurement(view: DataView): CyclingPowerMeasurement {
  const r = new ByteReader(view);
  const flags = r.uint16();
  const out: CyclingPowerMeasurement = { powerW: r.sint16() };
  if (bit(flags, 0)) r.skip(1); // pedal power balance
  if (bit(flags, 2)) r.skip(2); // accumulated torque
  if (bit(flags, 4)) r.skip(6); // wheel revolution data
  if (bit(flags, 5)) {
    out.crankRevolutions = r.uint16();
    out.lastCrankEventTime = r.uint16();
  }
  return out;
}
