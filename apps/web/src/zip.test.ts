import { describe, expect, it } from 'vitest';
import { crc32, makeZip } from './zip';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('writes the entries and the end record', () => {
    const zip = makeZip([
      { name: 'a.fit', data: new Uint8Array([1, 2, 3]) },
      { name: 'b.fit', data: new Uint8Array([4]) },
    ]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(zip.length - 22 + 10, true)).toBe(2);
  });
});
