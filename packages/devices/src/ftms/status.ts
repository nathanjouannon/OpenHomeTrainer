import { ByteReader } from '../bytes';

const STATUS_NAMES: Record<number, string> = {
  1: 'reset',
  2: 'stopped or paused by user',
  3: 'stopped by safety key',
  4: 'started or resumed by user',
  5: 'target speed changed',
  6: 'target incline changed',
  7: 'target resistance level changed',
  8: 'target power changed',
  18: 'indoor bike simulation parameters changed',
  19: 'wheel circumference changed',
  20: 'spin down status',
  21: 'targeted cadence changed',
  255: 'control permission lost',
};

/** Fitness Machine Status (0x2ADA), decoded to a human-readable line. */
export function describeFitnessMachineStatus(view: DataView): string {
  const r = new ByteReader(view);
  const op = r.uint8();
  const name = STATUS_NAMES[op] ?? `status 0x${op.toString(16)}`;
  try {
    switch (op) {
      case 0x08:
        return `${name}: ${r.sint16()} W`;
      case 0x12: {
        const wind = r.sint16() / 1000;
        const grade = r.sint16() / 100;
        return `${name}: grade ${grade} %, wind ${wind} m/s`;
      }
      case 0x07:
        return `${name}: ${r.uint8() / 10}`;
      default:
        return name;
    }
  } catch {
    return name;
  }
}

export const isControlPermissionLost = (view: DataView) =>
  view.byteLength > 0 && view.getUint8(0) === 0xff;
