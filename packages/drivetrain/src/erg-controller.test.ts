import { describe, expect, it } from 'vitest';
import { ErgController, type ErgInput, type ErgUpdate } from './erg-controller';

const DT = 0.05;
const riding: ErgInput = { cadenceRpm: 90, paused: false };

/** Runs the controller for `seconds`, returning the last sent power and the events seen. */
function run(c: ErgController, seconds: number, input: ErgInput = riding) {
  let last: number | null = null;
  const events: string[] = [];
  const sent: number[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const u: ErgUpdate = c.update(DT, input);
    if (u.powerW !== null) {
      last = u.powerW;
      sent.push(u.powerW);
    }
    if (u.event) events.push(u.event);
  }
  return { last, events, sent };
}

describe('ErgController', () => {
  it('sends the first command at once', () => {
    const c = new ErgController(200);
    expect(c.update(DT, riding).powerW).toBe(200);
  });

  it('ramps a new target instead of jumping', () => {
    const c = new ErgController(150);
    run(c, 2);
    c.setTarget(300);
    const { sent } = run(c, 1);
    expect(sent[0]).toBeGreaterThan(150);
    expect(sent[0]).toBeLessThan(220);
    expect(Math.max(...sent)).toBeLessThan(300);
    expect(run(c, 3).last).toBe(300);
  });

  it('never moves faster than the ramp', () => {
    const c = new ErgController(100);
    run(c, 2);
    c.setTarget(350);
    const { sent } = run(c, 5);
    for (let i = 1; i < sent.length; i++) {
      // 250 W over 2.5 s = 100 W/s, sent at least every 0.25 s.
      expect(Math.abs((sent[i] ?? 0) - (sent[i - 1] ?? 0))).toBeLessThanOrEqual(30);
    }
  });

  it('clamps the target', () => {
    const c = new ErgController(5000);
    expect(c.targetW).toBe(2000);
    c.adjustTarget(-5000);
    expect(c.targetW).toBe(0);
  });

  it('decays gradually when the rider stops, then ramps back', () => {
    const c = new ErgController(250);
    run(c, 2);
    const stop = run(c, 3, { cadenceRpm: 0, paused: false });
    expect(c.state).toBe('stopped');
    // 30 W/s decay: nothing drops brutally.
    for (let i = 1; i < stop.sent.length; i++) {
      expect((stop.sent[i - 1] ?? 0) - (stop.sent[i] ?? 0)).toBeLessThan(10);
    }
    expect(stop.last).toBeLessThan(250);
    expect(stop.last).toBeGreaterThan(50);
    run(c, 20, { cadenceRpm: 0, paused: false });
    expect(c.commandW).toBe(50);
    run(c, 0.1);
    expect(c.state).toBe('active');
    expect(run(c, 10).last).toBe(250);
  });

  it('treats a pause like a stop at once', () => {
    const c = new ErgController(250);
    run(c, 2);
    run(c, 0.1, { cadenceRpm: 90, paused: true });
    expect(c.state).toBe('stopped');
  });

  it('ignores a one-off zero cadence glitch', () => {
    const c = new ErgController(250);
    run(c, 2);
    run(c, 0.3, { cadenceRpm: 0, paused: false });
    expect(c.state).toBe('active');
  });

  it('detects the spiral of death, then recovers when pedalling again', () => {
    const c = new ErgController(300);
    run(c, 2);
    const low: ErgInput = { cadenceRpm: 40, paused: false };
    expect(run(c, 4, low).events).toEqual([]);
    expect(run(c, 2, low).events).toEqual(['spiral']);
    expect(c.state).toBe('spiral');
    run(c, 20, low);
    expect(c.commandW).toBe(50);
    // Still slow: stays in recovery.
    run(c, 5, { cadenceRpm: 60, paused: false });
    expect(c.state).toBe('spiral');
    expect(run(c, 4, riding).events).toEqual(['recovered']);
    expect(run(c, 10).last).toBe(300);
  });

  it('does not call a spiral on a low target', () => {
    const c = new ErgController(80);
    expect(run(c, 30, { cadenceRpm: 40, paused: false }).events).toEqual([]);
  });

  it('lets the rider resume by hand', () => {
    const c = new ErgController(300);
    run(c, 12, { cadenceRpm: 40, paused: false });
    expect(c.state).toBe('spiral');
    c.resume();
    expect(c.state).toBe('active');
  });

  it('is off without a cadence sensor', () => {
    const c = new ErgController(300);
    expect(run(c, 30, { cadenceRpm: null, paused: false }).events).toEqual([]);
    expect(c.state).toBe('active');
  });

  it('keeps sending the command as a keep-alive', () => {
    const c = new ErgController(200);
    const { sent } = run(c, 10);
    expect(sent.length).toBeGreaterThanOrEqual(10);
    expect(new Set(sent)).toEqual(new Set([200]));
  });
});
