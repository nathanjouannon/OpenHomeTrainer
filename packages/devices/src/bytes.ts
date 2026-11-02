export const toHex = (data: DataView | Uint8Array): string => {
  const bytes =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
};

export const fromHex = (hex: string): DataView => {
  const clean = hex.replace(/[^0-9a-f]/gi, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return new DataView(bytes.buffer);
};

/** Sequential little-endian reader that fails loudly on truncated frames. */
export class ByteReader {
  private offset = 0;

  constructor(private readonly view: DataView) {}

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  private ensure(n: number): void {
    if (this.remaining < n) {
      throw new RangeError(`Truncated frame: need ${n} byte(s) at offset ${this.offset}`);
    }
  }

  uint8(): number {
    this.ensure(1);
    return this.view.getUint8(this.offset++);
  }

  uint16(): number {
    this.ensure(2);
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  sint16(): number {
    this.ensure(2);
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  uint24(): number {
    this.ensure(3);
    const v = this.view.getUint16(this.offset, true) | (this.view.getUint8(this.offset + 2) << 16);
    this.offset += 3;
    return v;
  }

  uint32(): number {
    this.ensure(4);
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  skip(n: number): void {
    this.ensure(n);
    this.offset += n;
  }
}
