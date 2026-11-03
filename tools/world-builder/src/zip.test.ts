import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { listZip, readZipEntry } from './zip';

/** A ZIP archive built by hand: one stored and one deflated entry. */
function makeZip(files: { name: string; data: Uint8Array; deflate: boolean }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const body = f.deflate ? new Uint8Array(deflateRawSync(f.data)) : f.data;
    const local = new Uint8Array(30 + name.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, f.deflate ? 8 : 0, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, f.deflate ? 8 : 0, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const dirSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, eocd];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

describe('zip', () => {
  it('lists and reads stored and deflated entries', () => {
    const text = new TextEncoder().encode('grass grass grass grass grass');
    const raw = Uint8Array.from([1, 2, 3, 4, 5]);
    const zip = makeZip([
      { name: 'Grass004_1K-JPG_Color.jpg', data: text, deflate: true },
      { name: 'readme.txt', data: raw, deflate: false },
    ]);
    const entries = listZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['Grass004_1K-JPG_Color.jpg', 'readme.txt']);
    expect(readZipEntry(zip, entries[0] as (typeof entries)[0])).toEqual(text);
    expect(readZipEntry(zip, entries[1] as (typeof entries)[0])).toEqual(raw);
  });

  it('rejects what is not a ZIP archive', () => {
    expect(() => listZip(new Uint8Array(100))).toThrow('Not a ZIP');
  });
});
