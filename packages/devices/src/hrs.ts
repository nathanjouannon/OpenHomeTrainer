import { ByteReader } from './bytes';

/** Heart Rate Measurement (0x2A37): bit 0 of the flags selects uint8 or uint16. */
export function parseHeartRateMeasurement(view: DataView): number {
  const r = new ByteReader(view);
  const flags = r.uint8();
  return flags & 0x01 ? r.uint16() : r.uint8();
}
