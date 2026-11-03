import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CASSETTE_SPEEDS, CASSETTES, Gearbox, gearSpeedMs, roadDrivetrain } from './gearing';
import {
  DEFAULT_TRAINER_CONTROLLER_OPTIONS,
  feltGrade,
  gearGradeOffset,
  TrainerController,
} from './trainer-controller';

describe('cassettes', () => {
  it('10 to 13 speeds, sorted, distinct', () => {
    for (const n of CASSETTE_SPEEDS) {
      const c = CASSETTES[n];
      expect(c).toHaveLength(n);
      for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1] ?? 0);
    }
  });

  it('gear speed: 90 rpm in 50×17 ≈ 33 km/h', () => {
    expect(gearSpeedMs(90, 50 / 17, 2.105) * 3.6).toBeCloseTo(33.4, 0);
  });
});

describe('Gearbox', () => {
  it('starts on the big ring, mid-cassette', () => {
    const box = new Gearbox(roadDrivetrain(12));
    expect(box.label()).toBe('50×24');
    expect(box.neutralRatio).toBeCloseTo(50 / 24, 9);
    expect(box.cogCount).toBe(12);
  });

  it('the rear shifts one real cog at a time', () => {
    const box = new Gearbox(roadDrivetrain(12));
    expect(box.shiftUp()).toBe(true);
    expect(box.label()).toBe('50×21');
    expect(box.shiftDown()).toBe(true);
    expect(box.shiftDown()).toBe(true);
    expect(box.label()).toBe('50×27');
  });

  it('the front keeps the cog', () => {
    const box = new Gearbox(roadDrivetrain(11));
    const cog = box.gear.cog;
    expect(box.shiftFrontDown()).toBe(true);
    expect(box.gear).toMatchObject({ chainring: 34, cog });
    expect(box.shiftFrontDown()).toBe(false);
    expect(box.shiftFrontUp()).toBe(true);
    expect(box.gear.chainring).toBe(50);
  });

  it('synchro shift at the end of the cassette, then stops at the extremes', () => {
    const box = new Gearbox(roadDrivetrain(12));
    for (let i = 0; i < 30; i++) box.shiftDown();
    expect(box.label()).toBe('34×34');
    expect(box.shiftDown()).toBe(false);
    for (let i = 0; i < 11; i++) box.shiftUp();
    expect(box.label()).toBe('34×11');
    // Next harder: big ring, first cog harder than 34×11.
    expect(box.shiftUp()).toBe(true);
    expect(box.label()).toBe('50×15');
    for (let i = 0; i < 30; i++) box.shiftUp();
    expect(box.label()).toBe('50×11');
    expect(box.shiftUp()).toBe(false);
    for (let i = 0; i < 11; i++) box.shiftDown();
    expect(box.label()).toBe('50×34');
    // Next easier: small ring, first cog easier than 50×34.
    expect(box.shiftDown()).toBe(true);
    expect(box.label()).toBe('34×24');
    expect(box.reset()).toBe(true);
    expect(box.label()).toBe('50×24');
  });

  it('every shift up is harder, every shift down easier, for any cassette', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CASSETTE_SPEEDS),
        fc.array(fc.constantFrom('up', 'down', 'frontUp', 'frontDown'), { maxLength: 60 }),
        (speeds, moves) => {
          const box = new Gearbox(roadDrivetrain(speeds));
          for (const m of moves) {
            const before = box.gear.ratio;
            const changed =
              m === 'up'
                ? box.shiftUp()
                : m === 'down'
                  ? box.shiftDown()
                  : m === 'frontUp'
                    ? box.shiftFrontUp()
                    : box.shiftFrontDown();
            const after = box.gear.ratio;
            if (!changed) expect(after).toBe(before);
            else if (m === 'up' || m === 'frontUp') expect(after).toBeGreaterThan(before);
            else expect(after).toBeLessThan(before);
          }
        },
      ),
    );
  });
});

describe('trainer command layers', () => {
  const o = { ...DEFAULT_TRAINER_CONTROLLER_OPTIONS };

  it('applies difficulty and softens descents', () => {
    expect(feltGrade(8, o)).toBeCloseTo(4, 9);
    expect(feltGrade(-8, o)).toBeCloseTo(-2, 9);
    expect(feltGrade(8, { ...o, difficulty: 1 })).toBeCloseTo(8, 9);
  });

  it('S1: harder gear → higher grade, neutral = 0', () => {
    const box = new Gearbox(roadDrivetrain(12));
    expect(gearGradeOffset(box.neutralRatio, box.neutralRatio, 10)).toBe(0);
    const before = gearGradeOffset(box.gear.ratio, box.neutralRatio, 10);
    box.shiftUp();
    const oneClick = gearGradeOffset(box.gear.ratio, box.neutralRatio, 10) - before;
    // One cog in the middle of the cassette (24 → 21) ≈ 1.3 % of grade.
    expect(oneClick).toBeGreaterThan(0.5);
    expect(oneClick).toBeLessThan(1.5);
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
