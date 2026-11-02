import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  airDensityAtAltitude,
  DEFAULT_DT_S,
  MAX_SPEED_MS,
  type PhysicsInput,
  type RiderParams,
  SEA_LEVEL_AIR_DENSITY,
  simulateStep,
  steadyStateSpeed,
  step,
} from './model';

// Reference setup from docs/04-moteur-physique.md §4.
const REF_PARAMS: RiderParams = {
  massKg: 75,
  bikeMassKg: 8,
  cda: 0.32,
  crr: 0.004,
  drivetrainEfficiency: 0.97,
  wheelInertiaKg: 1.5,
};

const input = (powerW: number, gradePercent: number): PhysicsInput => ({
  powerW,
  gradePercent,
  airDensity: SEA_LEVEL_AIR_DENSITY,
  draftFactor: 0,
});

/** Integrates until speed settles (or a max duration is reached). */
function integrate(inp: PhysicsInput, params: RiderParams, startSpeedMs = 0, durationS = 600) {
  let v = startSpeedMs;
  const steps = Math.round(durationS / DEFAULT_DT_S);
  for (let i = 0; i < steps; i++) v = step(v, inp, params);
  return v;
}

const REFERENCE_CASES = [
  { powerW: 250, gradePercent: 0, expectedMs: 10.2 },
  { powerW: 250, gradePercent: 7, expectedMs: 3.85 },
  { powerW: 150, gradePercent: 0, expectedMs: 8.45 },
  { powerW: 0, gradePercent: -6, expectedMs: 15.2 },
];

describe('steadyStateSpeed (reference solver)', () => {
  it.each(REFERENCE_CASES)(
    '$powerW W at $gradePercent % ≈ $expectedMs m/s',
    ({ powerW, gradePercent, expectedMs }) => {
      const v = steadyStateSpeed(input(powerW, gradePercent), REF_PARAMS);
      expect(Math.abs(v - expectedMs) / expectedMs).toBeLessThan(0.01);
    },
  );

  it('returns 0 when the power cannot overcome the slope', () => {
    expect(steadyStateSpeed(input(0, 5), REF_PARAMS)).toBe(0);
  });
});

describe('step (integrator)', () => {
  it.each(REFERENCE_CASES)(
    'converges to the reference speed within 1 % ($powerW W, $gradePercent %)',
    ({ powerW, gradePercent }) => {
      const reference = steadyStateSpeed(input(powerW, gradePercent), REF_PARAMS);
      const v = integrate(input(powerW, gradePercent), REF_PARAMS);
      expect(Math.abs(v - reference) / reference).toBeLessThan(0.01);
    },
  );

  it('slows down to a stop without power on a climb, never going backwards', () => {
    expect(integrate(input(0, 8), REF_PARAMS, 10, 120)).toBe(0);
  });

  it('accelerates from standstill', () => {
    expect(step(0, input(200, 0), REF_PARAMS)).toBeGreaterThan(0);
  });

  it('is faster at altitude for the same power (thinner air)', () => {
    const sea = steadyStateSpeed(input(250, 0), REF_PARAMS);
    const high = steadyStateSpeed(
      { ...input(250, 0), airDensity: airDensityAtAltitude(2500) },
      REF_PARAMS,
    );
    expect(high).toBeGreaterThan(sea);
  });

  it('is faster when drafting', () => {
    const alone = steadyStateSpeed(input(200, 0), REF_PARAMS);
    const drafting = steadyStateSpeed({ ...input(200, 0), draftFactor: 0.3 }, REF_PARAMS);
    expect(drafting).toBeGreaterThan(alone);
  });

  it('respects the step budget (< 0.05 ms per step)', () => {
    const inp = input(250, 3);
    const n = 100_000;
    let v = 0;
    const t0 = Date.now();
    for (let i = 0; i < n; i++) v = step(v, inp, REF_PARAMS);
    const perStepMs = (Date.now() - t0) / n;
    expect(v).toBeGreaterThan(0);
    expect(perStepMs).toBeLessThan(0.05);
  });
});

describe('properties', () => {
  const arbInput = fc.record({
    powerW: fc.double({ min: -100, max: 2500, noNaN: true }),
    gradePercent: fc.double({ min: -25, max: 25, noNaN: true }),
    airDensity: fc.double({ min: 0.7, max: 1.3, noNaN: true }),
    draftFactor: fc.double({ min: 0, max: 0.4, noNaN: true }),
  });
  const arbSpeed = fc.double({ min: 0, max: MAX_SPEED_MS, noNaN: true });

  it('speed stays finite, non-negative and capped', () => {
    fc.assert(
      fc.property(arbSpeed, arbInput, (v, inp) => {
        const next = step(v, inp, REF_PARAMS);
        return Number.isFinite(next) && next >= 0 && next <= MAX_SPEED_MS;
      }),
    );
  });

  it('distance is monotonic', () => {
    fc.assert(
      fc.property(arbSpeed, fc.double({ min: 0, max: 1e6, noNaN: true }), arbInput, (v, d, inp) => {
        const next = simulateStep({ speedMs: v, distanceM: d }, inp, REF_PARAMS);
        return next.distanceM >= d;
      }),
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(arbSpeed, arbInput, (v, inp) => {
        const first = step(v, inp, REF_PARAMS);
        const second = step(v, inp, REF_PARAMS);
        return Object.is(first, second);
      }),
    );
  });
});
