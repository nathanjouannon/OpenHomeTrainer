import { DEFAULT_RIDER_PARAMS, resistiveForceN } from '@hrt/physics';
import { describe, expect, it } from 'vitest';
import { GearPowerController, type GearPowerInput, gearTargetPowerW } from './gear-power';
import { customDrivetrain, Gearbox, parseTeeth, physicalRatio } from './gearing';

const forceN = (v: number, gradePercent: number) =>
  resistiveForceN(
    v,
    { powerW: 0, gradePercent, airDensity: 1.2, draftFactor: 0 },
    DEFAULT_RIDER_PARAMS,
  );

const base: GearPowerInput = {
  cadenceRpm: 90,
  paused: false,
  ratio: 50 / 17,
  wheelCircumferenceM: 2.105,
  gradePercent: 0,
  resistiveForceN: forceN,
  efficiency: 0.97,
};

describe('gearTargetPowerW', () => {
  it('flat, 90 rpm in 50×17 (≈ 33 km/h): about 190 W', () => {
    const w = gearTargetPowerW(base);
    expect(w).toBeGreaterThan(150);
    expect(w).toBeLessThan(250);
  });

  it('a harder gear or a higher cadence asks for more power', () => {
    const w = (ratio: number, cadenceRpm = 90) => gearTargetPowerW({ ...base, ratio, cadenceRpm });
    expect(w(50 / 15)).toBeGreaterThan(w(50 / 17));
    expect(w(50 / 17, 100)).toBeGreaterThan(w(50 / 17, 90));
  });

  it('climbing asks for more than the flat, and zero when coasting down', () => {
    expect(gearTargetPowerW({ ...base, gradePercent: 5 })).toBeGreaterThan(gearTargetPowerW(base));
    expect(gearTargetPowerW({ ...base, gradePercent: -8, ratio: 34 / 28 })).toBe(0);
  });

  it('no cadence, no power', () => {
    expect(gearTargetPowerW({ ...base, cadenceRpm: 0 })).toBe(0);
  });
});

describe('GearPowerController', () => {
  const run = (c: GearPowerController, seconds: number, input: GearPowerInput) => {
    let last: number | null = null;
    for (let i = 0; i < seconds * 20; i++) {
      const u = c.update(0.05, input);
      if (u.powerW !== null) last = u.powerW;
    }
    return last;
  };

  it('converges to the theoretical power within 5 s at constant cadence', () => {
    const c = new GearPowerController();
    const goal = gearTargetPowerW(base);
    run(c, 1, { ...base, cadenceRpm: 70 }); // starts from another effort
    const w = run(c, 5, base) as number;
    expect(Math.abs(w - goal) / goal).toBeLessThan(0.05);
  });

  it('a gear change moves the command smoothly, without a jump', () => {
    const c = new GearPowerController();
    run(c, 5, base);
    const before = c.commandW as number;
    const first = c.update(0.05, { ...base, ratio: 50 / 13 }).powerW ?? before;
    expect(first - before).toBeLessThan(50);
    expect(run(c, 6, { ...base, ratio: 50 / 13 }) as number).toBeGreaterThan(before + 100);
  });

  it('stopping pedalling decays the command instead of dropping it', () => {
    const c = new GearPowerController();
    run(c, 5, base);
    const high = c.commandW as number;
    c.update(0.05, { ...base, cadenceRpm: 0 });
    expect(c.commandW as number).toBeGreaterThan(high - 10);
    run(c, 15, { ...base, cadenceRpm: 0 });
    expect(c.commandW as number).toBeLessThanOrEqual(50);
  });

  it('slow cadence is not a spiral of death', () => {
    const c = new GearPowerController();
    const events: (string | null)[] = [];
    for (let i = 0; i < 20 * 20; i++)
      events.push(c.update(0.05, { ...base, cadenceRpm: 40 }).event);
    expect(events.every((e) => e === null)).toBe(true);
  });
});

describe('custom drivetrain', () => {
  it('parses teeth lists', () => {
    expect(parseTeeth('50, 34', 3)).toEqual([34, 50]);
    expect(parseTeeth('11 12 12 13', 16)).toEqual([11, 12, 13]);
    expect(parseTeeth('', 3)).toBeNull();
    expect(parseTeeth('50, abc', 3)).toBeNull();
    expect(parseTeeth('50, 3', 3)).toBeNull();
    expect(parseTeeth('53, 39, 30, 22', 3)).toBeNull();
    expect(parseTeeth('11.5', 3)).toBeNull();
  });

  it('builds a working gearbox, single chainring included', () => {
    const box = new Gearbox(
      customDrivetrain({
        chainrings: [42],
        cassette: [10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 51],
      }),
    );
    expect(box.cogCount).toBe(12);
    expect(box.shiftUp()).toBe(true);
    for (let i = 0; i < 20; i++) box.shiftUp();
    expect(box.shiftUp()).toBe(false);
  });

  it('physical ratio is chainring over cog, null when unknown', () => {
    expect(physicalRatio(50, 14)).toBeCloseTo(50 / 14, 9);
    expect(physicalRatio(null, 14)).toBeNull();
    expect(physicalRatio(50, 0)).toBeNull();
  });
});
