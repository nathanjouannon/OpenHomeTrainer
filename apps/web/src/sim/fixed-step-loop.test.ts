import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from './fixed-step-loop';

const setup = () => {
  let t = 0;
  const steps: number[] = [];
  const loop = new FixedStepLoop(
    (dt) => steps.push(dt),
    0.05,
    40,
    () => t,
  );
  return { loop, steps, advance: (ms: number) => (t += ms) };
};

describe('FixedStepLoop', () => {
  it('runs one step per 50 ms whatever the tick rhythm', () => {
    const { loop, steps, advance } = setup();
    loop.tick();
    for (let i = 0; i < 101; i++) {
      advance(17); // ~60 Hz ticks
      loop.tick();
    }
    expect(steps).toHaveLength(Math.floor(1717 / 50));
  });

  it('catches up with sub-steps after a throttled tick', () => {
    const { loop, steps, advance } = setup();
    loop.tick();
    advance(1000);
    expect(loop.tick()).toBe(20);
    expect(steps.every((dt) => dt === 0.05)).toBe(true);
  });

  it('caps catch-up and drops the backlog', () => {
    const { loop, advance } = setup();
    loop.tick();
    advance(60_000);
    expect(loop.tick()).toBe(40);
    advance(50);
    expect(loop.tick()).toBe(1);
  });

  it('exposes the interpolation factor', () => {
    const { loop, advance } = setup();
    loop.tick();
    advance(75);
    loop.tick();
    expect(loop.alpha()).toBeCloseTo(0.5);
  });
});
