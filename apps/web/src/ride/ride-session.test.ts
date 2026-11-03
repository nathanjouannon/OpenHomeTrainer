import { roadDrivetrain } from '@hrt/drivetrain';
import { DEFAULT_RIDER_PARAMS } from '@hrt/physics';
import { encodeRideFit } from '@hrt/recorder';
import { buildLoopRoute } from '@hrt/route-engine';
import { describe, expect, it } from 'vitest';
import { RideSession, type RideSessionConfig } from './ride-session';

const DT = 0.05;

/** 3 km loop with a 30 m hill. */
const route = buildLoopRoute({
  id: 'test-loop',
  name: { fr: 'Test', en: 'Test' },
  worldId: 'test',
  controls: Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return [Math.sin(a) * 480, Math.cos(a) * 480] as [number, number];
  }),
  elevationAt: (x) => 500 + 30 * Math.exp(-((x - 400) ** 2) / 40_000),
});

const flatRoute = buildLoopRoute({
  id: 'flat-loop',
  name: { fr: 'Plat', en: 'Flat' },
  worldId: 'test',
  controls: [
    [0, 0],
    [1000, 0],
    [1000, 1000],
    [0, 1000],
  ],
  elevationAt: () => 100,
});

function makeSession(overrides: Partial<RideSessionConfig> = {}) {
  let clockMs = 0;
  let wallMs = Date.UTC(2026, 10, 2, 18);
  const session = new RideSession({
    route,
    rider: { ...DEFAULT_RIDER_PARAMS, ftpW: 250 },
    drivetrain: roadDrivetrain(12),
    difficulty: 0.5,
    powerSource: 'trainer',
    ride: {
      id: 'r1',
      route: { id: route.id, name: route.meta.name, lengthM: route.lengthM, loop: true },
      worldId: 'test',
      rider: { weightKg: 75, ftpW: 250 },
      appVersion: 'test',
      goal: { kind: 'laps', value: 2 },
    },
    clock: () => clockMs,
    now: () => wallMs,
    ...overrides,
  });
  /** Advances `seconds` of riding at a constant power fed at 4 Hz by the trainer. */
  const ride = (seconds: number, powerW: number | null, hr = 140) => {
    const commands: number[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      clockMs += DT * 1000;
      wallMs += DT * 1000;
      if (powerW !== null && i % 5 === 0) {
        session.onReading('trainer', { timestamp: clockMs, powerW, cadenceRpm: 90 });
        session.onReading('heartrate', { timestamp: clockMs, heartRateBpm: hr });
      }
      const { command } = session.step(DT);
      if (command) commands.push(command.gradePercent);
    }
    return commands;
  };
  return { session, ride };
}

describe('RideSession', () => {
  it('rides laps, records them and exports a FIT file', () => {
    const { session, ride } = makeSession();
    const events: string[] = [];
    session.on((e) => events.push(e.type));
    ride(20 * 60, 220);
    const s = session.state;
    expect(s.distanceM / s.timeS).toBeGreaterThan(7); // ≈ 28 km/h at 220 W, one hill per lap
    expect(s.lap).toBeGreaterThanOrEqual(3);
    expect(s.bestLapS).not.toBeNull();
    expect(events.filter((e) => e === 'lap').length).toBe(s.lap - 1);
    expect(events).toContain('goal');
    const header = session.finish();
    expect(header.laps.filter((l) => l.trigger === 'loop')).toHaveLength(s.lap - 1);
    expect(header.stats?.avgPowerW).toBeCloseTo(220, 0);
    expect(header.stats?.avgHeartRateBpm).toBeCloseTo(140, 0);
    const fit = encodeRideFit(header, session.recorder.samples);
    expect(fit.length).toBeGreaterThan(20_000);
  });

  it('sends the grade to the trainer at least once per second', () => {
    const { ride } = makeSession();
    expect(ride(10, 200).length).toBeGreaterThanOrEqual(10);
  });

  it('freewheels when the power stops for more than 3 s', () => {
    const { session, ride } = makeSession({ route: flatRoute });
    ride(120, 250);
    const cruising = session.state.speedMs;
    ride(2, null);
    expect(session.state.powerStale).toBe(false);
    ride(20, null);
    expect(session.state.powerStale).toBe(true);
    expect(session.state.powerW).toBe(0);
    expect(session.state.speedMs).toBeLessThan(cruising * 0.8);
  });

  it('ignores implausible power spikes', () => {
    const { session } = makeSession();
    session.onReading('trainer', { timestamp: 0, powerW: 4000 });
    session.step(DT);
    expect(session.state.powerW).toBe(0);
  });

  it('a gear change reaches the trainer on the next step', () => {
    const { session, ride } = makeSession();
    ride(5, 200);
    const before = session.state.trainerGradePercent ?? 0;
    session.shift(1);
    const { command } = session.step(DT);
    expect(command?.gradePercent).toBeGreaterThan(before);
    expect(session.state.gearLabel).toBe('50×21');
  });

  it('the front shift changes chainring and keeps the cog position', () => {
    const { session } = makeSession();
    const cog = session.state.gearIndex;
    session.shift(-1, 'front');
    expect(session.state.gearLabel).toBe('34×24');
    expect(session.state.gearIndex).toBe(cog);
    expect(session.state.gearCount).toBe(12);
  });

  it('does not move nor record while paused', () => {
    const { session, ride } = makeSession();
    ride(30, 200);
    session.pause();
    const distance = session.state.distanceM;
    const samples = session.recorder.samples.length;
    ride(30, 200);
    expect(session.state.distanceM).toBe(distance);
    expect(session.recorder.samples.length).toBe(samples);
    session.resume();
    ride(5, 200);
    expect(session.state.distanceM).toBeGreaterThan(distance);
  });

  it('prefers the power meter when asked, and falls back to the trainer', () => {
    const { session } = makeSession({ powerSource: 'powermeter' });
    session.onReading('trainer', { timestamp: 0, powerW: 200 });
    session.onReading('powermeter', { timestamp: 0, powerW: 210 });
    session.step(DT);
    expect(session.state.powerW).toBe(210);
    const { session: s2 } = makeSession({ powerSource: 'powermeter' });
    s2.onReading('trainer', { timestamp: 0, powerW: 200 });
    s2.step(DT);
    expect(s2.state.powerW).toBe(200);
  });

  it('endurance: 6 h on the smallest loop, every lap counted, no drift at the line', () => {
    const { session, ride } = makeSession({ route: flatRoute });
    ride(6 * 3600, 200);
    const s = session.state;
    const expectedLaps = Math.floor(s.distanceM / flatRoute.lengthM);
    const header = session.finish();
    expect(header.laps.filter((l) => l.trigger === 'loop')).toHaveLength(expectedLaps);
    expect(expectedLaps).toBeGreaterThan(40);
    expect(session.recorder.samples).toHaveLength(6 * 3600);
    // Lap times of a constant effort on a flat loop stay the same (no drift).
    const times = header.laps.slice(1, -1).map((l) => l.endS - l.startS);
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(0.1);
  }, 30_000);
});
