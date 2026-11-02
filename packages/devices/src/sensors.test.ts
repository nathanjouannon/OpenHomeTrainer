import { describe, expect, it } from 'vitest';
import { fromHex } from './bytes';
import { CrankCadenceCalculator } from './cadence';
import { parseCyclingPowerMeasurement } from './cps';
import { GattQueue } from './gatt-queue';
import { parseHeartRateMeasurement } from './hrs';

describe('parseCyclingPowerMeasurement', () => {
  it('reads power only', () => {
    expect(parseCyclingPowerMeasurement(fromHex('00 00 fa 00'))).toEqual({ powerW: 250 });
  });

  it('skips balance and wheel data to reach crank data', () => {
    // flags: balance (bit0) + wheel (bit4) + crank (bit5) = 0x0031
    const frame = fromHex('31 00 c8 00 64 10 00 00 00 00 08 2a 00 00 04');
    expect(parseCyclingPowerMeasurement(frame)).toEqual({
      powerW: 200,
      crankRevolutions: 42,
      lastCrankEventTime: 1024,
    });
  });
});

describe('parseHeartRateMeasurement', () => {
  it('reads uint8 and uint16 formats', () => {
    expect(parseHeartRateMeasurement(fromHex('00 8c'))).toBe(140);
    expect(parseHeartRateMeasurement(fromHex('01 2c 01'))).toBe(300);
  });
});

describe('CrankCadenceCalculator', () => {
  it('computes rpm from revolution deltas', () => {
    const c = new CrankCadenceCalculator();
    c.update(100, 0, 0);
    // 3 revs in 2 s (2048/1024) = 90 rpm
    expect(c.update(103, 2048, 2000)).toBeCloseTo(90);
  });

  it('handles 16-bit rollover', () => {
    const c = new CrankCadenceCalculator();
    c.update(65535, 64512, 0);
    // +2 revs, +1024 ticks across the wrap = 120 rpm
    expect(c.update(1, 0, 1000)).toBeCloseTo(120);
  });

  it('drops to 0 when counters stop moving', () => {
    const c = new CrankCadenceCalculator(2500);
    c.update(10, 0, 0);
    c.update(11, 683, 700);
    expect(c.update(11, 683, 1500)).toBeGreaterThan(0);
    expect(c.update(11, 683, 4000)).toBe(0);
  });
});

describe('GattQueue', () => {
  it('never runs two operations at once, even after a failure', async () => {
    const q = new GattQueue();
    let running = 0;
    let maxRunning = 0;
    const op = (fail: boolean) => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (fail) throw new Error('boom');
      return 'ok';
    };
    const results = await Promise.allSettled([q.run(op(false)), q.run(op(true)), q.run(op(false))]);
    expect(maxRunning).toBe(1);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });
});
