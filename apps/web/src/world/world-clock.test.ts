import { describe, expect, it } from 'vitest';
import { BenchClock, realClock } from './world-clock';

describe('world clocks', () => {
  it('real clock follows the frame time', () => {
    expect(realClock.step(0.033)).toBe(0.033);
  });

  it('bench clock: fixed step, frozen, then real time', () => {
    const c = new BenchClock(1, 0.02);
    expect(c.step(0.5)).toBe(0.02);
    c.mode = 'frozen';
    expect(c.step(0.5)).toBe(0);
    c.mode = 'real';
    expect(c.step(0.5)).toBe(0.5);
  });

  it('bench clock: same seed, same random sequence', () => {
    const a = new BenchClock(2026);
    const b = new BenchClock(2026);
    const seq = (c: BenchClock) => Array.from({ length: 5 }, () => c.random());
    expect(seq(a)).toEqual(seq(b));
  });
});
