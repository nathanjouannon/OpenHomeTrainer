import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulatedHeartRateMonitor } from './simulated-heart-rate';
import { SimulatedTrainer } from './simulated-trainer';
import type { SensorReading } from './types';

describe('SimulatedTrainer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits readings at the configured rate once connected', async () => {
    vi.useFakeTimers();
    const t = new SimulatedTrainer({ readingIntervalMs: 250, now: () => 0 });
    const readings: SensorReading[] = [];
    t.onReading((r) => readings.push(r));
    await t.connect();
    expect(t.status).toBe('connected');
    vi.advanceTimersByTime(1000);
    expect(readings).toHaveLength(4);
    await t.disconnect();
    vi.advanceTimersByTime(1000);
    expect(readings).toHaveLength(4);
  });

  it('adjusts power by 10 W steps, never below 0', () => {
    const t = new SimulatedTrainer({ initialPowerW: 20, now: () => 0 });
    t.adjustRiderPower(+1);
    expect(t.tick().powerW).toBe(30);
    t.adjustRiderPower(-5);
    expect(t.tick().powerW).toBe(0);
    expect(t.tick().cadenceRpm).toBe(0);
  });

  it('lowers cadence when the felt grade increases (SIM)', async () => {
    const t = new SimulatedTrainer({ now: () => 0 });
    await t.setSimulation({ gradePercent: 0 });
    const flat = t.tick().cadenceRpm ?? 0;
    await t.setSimulation({ gradePercent: 10 });
    expect(t.tick().cadenceRpm).toBeLessThan(flat);
  });

  it('ramps towards the ERG target and logs commands as FTMS frames', async () => {
    const t = new SimulatedTrainer({ initialPowerW: 100, now: () => 0 });
    await t.setTargetPower(300);
    const first = t.tick().powerW ?? 0;
    expect(first).toBeGreaterThan(100);
    expect(first).toBeLessThan(300);
    for (let i = 0; i < 30; i++) t.tick();
    expect(t.tick().powerW).toBe(300);
    expect(t.log.all().at(-1)).toMatchObject({ dir: 'out', hex: '05 2c 01' });
  });
});

describe('SimulatedHeartRateMonitor', () => {
  it('drifts towards a heart rate that follows power', () => {
    let power = 0;
    const hrm = new SimulatedHeartRateMonitor(() => power, { restBpm: 60, maxBpm: 185, ftpW: 250 });
    let r = hrm.tick(1);
    for (let i = 0; i < 300; i++) r = hrm.tick(1);
    const atRest = r.heartRateBpm ?? 0;
    power = 250;
    for (let i = 0; i < 300; i++) r = hrm.tick(1);
    expect(atRest).toBeLessThan(85);
    expect(r.heartRateBpm).toBeGreaterThan(170);
  });
});
