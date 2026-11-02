import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildGears, DRIVETRAIN_PRESETS, Gearbox, gearSpeedMs, presetById } from './gearing';
import {
  DEFAULT_TRAINER_CONTROLLER_OPTIONS,
  feltGrade,
  gearGradeOffset,
  TrainerController,
} from './trainer-controller';

describe('buildGears', () => {
  it('sequential 24: regular steps of 6–10 % from 50/34 × 11–34', () => {
    const gears = buildGears(presetById('sequential-24').config);
    expect(gears).toHaveLength(24);
    expect(gears[0]?.ratio).toBeCloseTo(34 / 34, 9);
    expect(gears[23]?.ratio).toBeCloseTo(50 / 11, 9);
    for (let i = 1; i < gears.length; i++) {
      const step = (gears[i]?.ratio ?? 0) / (gears[i - 1]?.ratio ?? 1);
      expect(step).toBeGreaterThan(1.06);
      expect(step).toBeLessThan(1.1);
    }
  });

  it('double: sorted, deduplicated, with chainring and cog', () => {
    const gears = buildGears(presetById('road-2x12').config);
    for (let i = 1; i < gears.length; i++) {
      expect((gears[i]?.ratio ?? 0) / (gears[i - 1]?.ratio ?? 1)).toBeGreaterThanOrEqual(1.015);
    }
    expect(gears[0]).toEqual({ ratio: 1, chainring: 34, cog: 34 });
    expect(gears.at(-1)).toEqual({ ratio: 50 / 11, chainring: 50, cog: 11 });
  });

  it('every preset builds', () => {
    for (const p of DRIVETRAIN_PRESETS) expect(buildGears(p.config).length).toBeGreaterThan(8);
  });

  it('gear speed: 90 rpm in 50×17 ≈ 33 km/h', () => {
    expect(gearSpeedMs(90, 50 / 17, 2.105) * 3.6).toBeCloseTo(33.4, 0);
  });
});

describe('Gearbox', () => {
  it('starts in the neutral gear and stays within bounds', () => {
    const box = new Gearbox(presetById('sequential-24').config);
    expect(box.index).toBe(box.neutralIndex);
    expect(box.label()).toBe(`${box.neutralIndex + 1}/24`);
    for (let i = 0; i < 40; i++) box.shiftUp();
    expect(box.index).toBe(23);
    expect(box.shiftUp()).toBe(false);
    for (let i = 0; i < 40; i++) box.shiftDown();
    expect(box.index).toBe(0);
    expect(box.reset()).toBe(true);
    expect(box.index).toBe(box.neutralIndex);
  });

  it('labels double drivetrains with chainring × cog', () => {
    const box = new Gearbox(presetById('road-2x12').config, 0);
    expect(box.label()).toBe('34×34');
  });
});

describe('trainer command layers', () => {
  const o = { ...DEFAULT_TRAINER_CONTROLLER_OPTIONS };

  it('applies difficulty and softens descents', () => {
    expect(feltGrade(8, o)).toBeCloseTo(4, 9);
    expect(feltGrade(-8, o)).toBeCloseTo(-2, 9);
    expect(feltGrade(8, { ...o, difficulty: 1 })).toBeCloseTo(8, 9);
  });

  it('S1: harder gear → higher grade, monotonic, neutral = 0', () => {
    const box = new Gearbox(presetById('sequential-24').config);
    expect(gearGradeOffset(box.neutralRatio, box.neutralRatio, 10)).toBe(0);
    let previous = Number.NEGATIVE_INFINITY;
    for (const g of box.gears) {
      const off = gearGradeOffset(g.ratio, box.neutralRatio, 10);
      expect(off).toBeGreaterThan(previous);
      previous = off;
    }
    // One click ≈ 0.5–1 % of grade (docs/15 §3.3).
    const oneClick = gearGradeOffset(
      box.gears[box.neutralIndex + 1]?.ratio ?? 0,
      box.neutralRatio,
      10,
    );
    expect(oneClick).toBeGreaterThan(0.5);
    expect(oneClick).toBeLessThan(1);
  });
});

describe('TrainerController', () => {
  const neutral = 2;

  it('sends at least once per second on a constant grade', () => {
    const c = new TrainerController();
    let sent = 0;
    for (let i = 0; i < 200; i++) {
      if (c.update(0.05, { gradePercent: 4, gearRatio: neutral, neutralRatio: neutral })) sent++;
    }
    // 10 s at 20 Hz → about 10 keep-alive commands.
    expect(sent).toBeGreaterThanOrEqual(10);
    expect(sent).toBeLessThanOrEqual(12);
    expect(c.targetGradePercent).toBeCloseTo(2, 2);
  });

  it('sends a gear change immediately', () => {
    const c = new TrainerController();
    c.update(0.05, { gradePercent: 0, gearRatio: neutral, neutralRatio: neutral });
    const cmd = c.update(0.05, {
      gradePercent: 0,
      gearRatio: neutral * 1.07,
      neutralRatio: neutral,
    });
    expect(cmd?.gradePercent).toBeCloseTo(10 * Math.log(1.07), 2);
  });

  it('smooths a grade step (no jolt) and stays within the trainer range', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -30, max: 30, noNaN: true }), { minLength: 5, maxLength: 100 }),
        (grades) => {
          const c = new TrainerController({ difficulty: 1, descentFactor: 1 });
          let last: number | null = null;
          for (const g of grades) {
            for (let k = 0; k < 4; k++) {
              const cmd = c.update(0.05, { gradePercent: g, gearRatio: null, neutralRatio: 1 });
              if (!cmd) continue;
              expect(cmd.gradePercent).toBeGreaterThanOrEqual(-10);
              expect(cmd.gradePercent).toBeLessThanOrEqual(20);
              // τ = 1 s: in ≤ 1 s between commands, the grade moves by < 63 % of a 60 % jump + rounding.
              if (last !== null) expect(Math.abs(cmd.gradePercent - last)).toBeLessThan(38);
              last = cmd.gradePercent;
            }
          }
        },
      ),
    );
  });
});
