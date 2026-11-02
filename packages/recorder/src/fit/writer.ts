// Minimal FIT file writer (Flexible and Interoperable Data Transfer protocol 2.0).
// Little-endian, normal headers, one definition per local message type.

export type FitBaseType =
  | 'enum'
  | 'uint8'
  | 'sint8'
  | 'uint16'
  | 'sint16'
  | 'uint32'
  | 'sint32'
  | 'uint32z'
  | 'string';

interface BaseTypeInfo {
  id: number;
  size: number;
  invalid: number;
}

const BASE_TYPES: Record<Exclude<FitBaseType, 'string'>, BaseTypeInfo> = {
  enum: { id: 0x00, size: 1, invalid: 0xff },
  sint8: { id: 0x01, size: 1, invalid: 0x7f },
  uint8: { id: 0x02, size: 1, invalid: 0xff },
  sint16: { id: 0x83, size: 2, invalid: 0x7fff },
  uint16: { id: 0x84, size: 2, invalid: 0xffff },
  sint32: { id: 0x85, size: 4, invalid: 0x7fffffff },
  uint32: { id: 0x86, size: 4, invalid: 0xffffffff },
  uint32z: { id: 0x8c, size: 4, invalid: 0x00000000 },
};
const STRING_TYPE_ID = 0x07;

export interface FitField {
  num: number;
  type: FitBaseType;
  /** Byte size for strings (including the terminating zero). */
  size?: number;
}

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401,
  0x5000, 0x9c01, 0x8801, 0x4400,
];

export function fitCrc(bytes: Uint8Array, start = 0, end = bytes.length, initial = 0): number {
  let crc = initial;
  for (let i = start; i < end; i++) {
    const byte = bytes[i] as number;
    let tmp = CRC_TABLE[crc & 0xf] as number;
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ (CRC_TABLE[byte & 0xf] as number);
    tmp = CRC_TABLE[crc & 0xf] as number;
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ (CRC_TABLE[(byte >> 4) & 0xf] as number);
  }
  return crc;
}

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z). */
export const FIT_EPOCH_OFFSET_S = 631065600;
export const toFitTime = (epochMs: number) => Math.round(epochMs / 1000) - FIT_EPOCH_OFFSET_S;

const HEADER_SIZE = 14;
const PROTOCOL_VERSION = 0x20; // 2.0
const PROFILE_VERSION = 2140; // 21.40

export class FitWriter {
  private buf: Uint8Array<ArrayBuffer> = new Uint8Array(64 * 1024);
  private view = new DataView(this.buf.buffer);
  private pos = HEADER_SIZE;
  private readonly defs = new Map<number, FitField[]>();

  private ensure(extra: number) {
    if (this.pos + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  /** Writes a definition message for a local message type (0–15). */
  define(local: number, globalNum: number, fields: FitField[]): void {
    if (local < 0 || local > 15) throw new Error('Local message type must be 0–15');
    this.ensure(5 + fields.length * 3);
    this.view.setUint8(this.pos++, 0x40 | local);
    this.view.setUint8(this.pos++, 0); // reserved
    this.view.setUint8(this.pos++, 0); // little-endian
    this.view.setUint16(this.pos, globalNum, true);
    this.pos += 2;
    this.view.setUint8(this.pos++, fields.length);
    for (const f of fields) {
      const isString = f.type === 'string';
      const size = isString
        ? (f.size ?? 16)
        : BASE_TYPES[f.type as Exclude<FitBaseType, 'string'>].size;
      this.view.setUint8(this.pos++, f.num);
      this.view.setUint8(this.pos++, size);
      this.view.setUint8(
        this.pos++,
        isString ? STRING_TYPE_ID : BASE_TYPES[f.type as Exclude<FitBaseType, 'string'>].id,
      );
    }
    this.defs.set(local, fields);
  }

  /** Writes a data message; values are raw (already scaled) and null means "invalid". */
  write(local: number, values: (number | string | null | undefined)[]): void {
    const fields = this.defs.get(local);
    if (!fields) throw new Error(`Local message ${local} is not defined`);
    if (values.length !== fields.length) throw new Error(`Expected ${fields.length} values`);
    this.ensure(1 + fields.reduce((s, f) => s + (f.type === 'string' ? (f.size ?? 16) : 4), 0));
    this.view.setUint8(this.pos++, local);
    fields.forEach((f, i) => {
      const v = values[i];
      if (f.type === 'string') {
        const size = f.size ?? 16;
        const bytes = new TextEncoder().encode(typeof v === 'string' ? v : '');
        // Truncate on a byte boundary, keep the terminating zero.
        const len = Math.min(bytes.length, size - 1);
        this.buf.set(bytes.subarray(0, len), this.pos);
        this.buf.fill(0, this.pos + len, this.pos + size);
        this.pos += size;
        return;
      }
      const info = BASE_TYPES[f.type];
      const raw = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : info.invalid;
      switch (f.type) {
        case 'enum':
        case 'uint8':
          this.view.setUint8(this.pos, clampRaw(raw, 0, 0xfe, info.invalid));
          break;
        case 'sint8':
          this.view.setInt8(this.pos, clampRaw(raw, -0x7f, 0x7e, info.invalid));
          break;
        case 'uint16':
          this.view.setUint16(this.pos, clampRaw(raw, 0, 0xfffe, info.invalid), true);
          break;
        case 'sint16':
          this.view.setInt16(this.pos, clampRaw(raw, -0x7fff, 0x7ffe, info.invalid), true);
          break;
        case 'uint32':
          this.view.setUint32(this.pos, clampRaw(raw, 0, 0xfffffffe, info.invalid), true);
          break;
        case 'uint32z':
          this.view.setUint32(this.pos, clampRaw(raw, 1, 0xffffffff, info.invalid), true);
          break;
        case 'sint32':
          this.view.setInt32(this.pos, clampRaw(raw, -0x7fffffff, 0x7ffffffe, info.invalid), true);
          break;
      }
      this.pos += info.size;
    });
  }

  /** Header + records + file CRC. */
  finish(): Uint8Array<ArrayBuffer> {
    const dataSize = this.pos - HEADER_SIZE;
    this.ensure(2);
    const v = this.view;
    v.setUint8(0, HEADER_SIZE);
    v.setUint8(1, PROTOCOL_VERSION);
    v.setUint16(2, PROFILE_VERSION, true);
    v.setUint32(4, dataSize, true);
    this.buf.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
    v.setUint16(12, fitCrc(this.buf, 0, 12), true);
    v.setUint16(this.pos, fitCrc(this.buf, 0, this.pos), true);
    return this.buf.slice(0, this.pos + 2);
  }
}

/** Values out of range become "invalid" rather than wrapping around. */
function clampRaw(raw: number, min: number, max: number, invalid: number): number {
  if (raw === invalid) return invalid;
  if (raw < min || raw > max) return invalid;
  return raw;
}
