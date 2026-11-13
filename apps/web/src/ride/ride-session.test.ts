import { roadDrivetrain } from '@hrt/drivetrain';
import { DEFAULT_RIDER_PARAMS } from '@hrt/physics';
import { encodeRideFit } from '@hrt/recorder';
import { buildLoopRoute } from '@hrt/route-engine';
import { describe, expect, it } from 'vitest';
import { Ghost } from './ghost';
import { type RideEvent, RideSession, type RideSessionConfig } from './ride-session';

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
  const ergCommands: number[] = [];
  /** Advances `seconds` of riding at a constant power fed at 4 Hz by the trainer. */
  const ride = (seconds: number, powerW: number | null, hr = 140) => {
    const commands: number[] = [];
    ergCommands.length = 0;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      clockMs += DT * 1000;
      wallMs += DT * 1000;
      if (powerW !== null && i % 5 === 0) {
        session.onReading('trainer', { timestamp: clockMs, powerW, cadenceRpm: 90 });
        session.onReading('heartrate', { timestamp: clockMs, heartRateBpm: hr });
      }
      const { command } = session.step(DT);
      if (command?.kind === 'sim') commands.push(command.gradePercent);
      else if (command?.kind === 'erg') ergCommands.push(command.powerW);
    }
    return commands;
  };
  return { session, ride, ergCommands };
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
    expect(command?.kind === 'sim' ? command.gradePercent : null).toBeGreaterThan(before);
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

describe('ERG mode', () => {
  it('sends target power commands and keeps the physics on measured power', () => {
    const { session, ride, ergCommands } = makeSession();
    session.setErg(210);
    ride(5, 200);
    expect(ergCommands[0]).toBe(210);
    expect(session.state.ergTargetW).toBe(210);
    expect(session.state.distanceM).toBeGreaterThan(0);
  });

  it('turns the gear buttons into ±5 W and back to SIM', () => {
    const { session, ride } = makeSession();
    ride(1, 200);
    session.setErg(200);
    session.shift(1);
    session.shift(1);
    session.shift(-1);
    expect(session.state.ergTargetW).toBe(205);
    session.setErg(null);
    expect(ride(2, 200).length).toBeGreaterThan(0);
    expect(session.state.ergTargetW).toBeNull();
  });
});

describe('workout', () => {
  const workout = {
    id: 'w',
    name: 'Test',
    source: 'custom' as const,
    steps: [
      { type: 'steady' as const, durationS: 10, power: { unit: 'ftp' as const, value: 0.5 } },
      { type: 'steady' as const, durationS: 10, power: { unit: 'ftp' as const, value: 1 } },
    ],
  };

  it('drives the ERG target interval by interval, with ±5 W on top, then returns to SIM', () => {
    const { session, ride } = makeSession({ workout });
    const events: string[] = [];
    session.on((e) => events.push(e.type));
    expect(session.state.ergTargetW).toBe(125); // FTP 250
    ride(5, 200);
    session.shift(1);
    expect(session.state.ergTargetW).toBe(130);
    expect(session.state.workout?.offsetW).toBe(5);
    ride(7, 200); // 12 s in: second interval
    expect(session.state.workout?.index).toBe(1);
    expect(session.state.ergTargetW).toBe(255);
    expect(events).toContain('interval');
    session.skipInterval(-1); // 2 s in: back to the first one
    expect(session.state.workout?.index).toBe(0);
    ride(25, 200);
    expect(events).toContain('workoutDone');
    expect(session.ergActive).toBe(false);
    expect(session.state.workout?.finished).toBe(true);
  });

  it('does not let the ERG key switch a workout off', () => {
    const { session } = makeSession({ workout });
    session.toggleErg();
    expect(session.ergActive).toBe(true);
  });

  it('holds the workout clock while paused', () => {
    const { session, ride } = makeSession({ workout });
    ride(3, 200);
    session.pause();
    ride(10, 200);
    expect(session.state.workout?.elapsedS).toBeCloseTo(3, 0);
  });
});

describe('timed segments (lot 3.5)', () => {
  const segRoute = buildLoopRoute({
    id: 'seg-loop',
    name: { fr: 'Seg', en: 'Seg' },
    worldId: 'test',
    controls: [
      [0, 0],
      [1000, 0],
      [1000, 1000],
      [0, 1000],
    ],
    elevationAt: () => 100,
    segments: [
      {
        id: 'sprint-1',
        name: { fr: 'Sprint 1', en: 'Sprint 1' },
        type: 'sprint',
        startM: 500,
        endM: 1500,
      },
    ],
  });
  const make = (extra: Partial<RideSessionConfig> = {}) =>
    makeSession({
      route: segRoute,
      ride: {
        id: 'seg',
        route: { id: segRoute.id, name: segRoute.meta.name, lengthM: segRoute.lengthM, loop: true },
        worldId: 'test',
        rider: { weightKg: 75, ftpW: 250 },
        appVersion: 'test',
        goal: null,
      },
      ...extra,
    });

  it('times the segment on each lap and records the efforts in the ride', () => {
    const { session, ride } = make();
    const events: RideEvent[] = [];
    session.on((e) => events.push(e));
    ride(15 * 60, 220);
    const ends = events.filter((e) => e.type === 'segmentEnd');
    expect(events.filter((e) => e.type === 'segmentStart').length).toBeGreaterThanOrEqual(2);
    expect(ends.length).toBeGreaterThanOrEqual(2);
    const [first, second] = ends.map((e) => (e.type === 'segmentEnd' ? e.effort : null));
    expect(first?.previousBestS).toBeNull();
    expect(first?.isPb).toBe(true);
    // Steady power on a flat road: the second lap is within a second of the first.
    expect(Math.abs((second?.durationS ?? 0) - (first?.durationS ?? 0))).toBeLessThan(1);
    expect(second?.previousBestS).toBeCloseTo(first?.durationS ?? 0, 6);
    expect(first?.avgPowerW).toBeCloseTo(220, 0);
    const header = session.finish();
    expect(header.segments?.length).toBe(ends.length);
    expect(header.segments?.[0]?.lap).toBe(1);
  });

  it('compares with the stored personal best while riding', () => {
    const { session, ride } = make({ segmentBest: () => 30 });
    const events: RideEvent[] = [];
    session.on((e) => events.push(e));
    // Ride until inside the segment (500 m at ≈ 9 m/s).
    ride(80, 220);
    const live = session.state.segment;
    expect(live?.id).toBe('sprint-1');
    expect(live?.pbS).toBe(30);
    expect(live?.deltaS).toBeGreaterThan(0); // 30 s for 1 km is far too fast
    expect(live?.remainingM).toBeGreaterThan(0);
    ride(5 * 60, 220);
    const end = events.find((e) => e.type === 'segmentEnd');
    expect(end?.type === 'segmentEnd' && end.effort.isPb).toBe(false);
    expect(session.state.segment).toBeNull();
  });
});

describe('ghost (lot 3.6)', () => {
  // A ghost riding 2 m/s for 10 minutes.
  const slow = new Ghost('ride', 'old', [0, 600], [0, 1200], false);

  it('reports the gap to the ghost in metres and seconds', () => {
    const { session, ride } = makeSession({ ghost: slow });
    ride(60, 250); // a rider on 250 W is faster than 2 m/s
    const g = session.state.ghost;
    expect(g?.distanceM).toBeCloseTo(120, 0);
    expect(g?.gapM).toBeGreaterThan(0);
    expect(g?.gapS).toBeLessThan(0); // ahead of the ghost
    expect(g?.finished).toBe(false);
    expect(g?.prevDistanceM).toBeLessThan(g?.distanceM ?? 0);
  });

  it('is absent without a ghost', () => {
    const { session, ride } = makeSession();
    ride(5, 200);
    expect(session.state.ghost).toBeNull();
  });
});

describe('realistic shifting, strategy S3 (lot 3.8)', () => {
  const realistic = () => makeSession({ route: flatRoute, strategy: 'realistic' });

  it('puts the trainer in ERG at the power of the gear and cadence, no grade command', () => {
    const { session, ride, ergCommands } = realistic();
    const grades = ride(20, 200);
    expect(grades).toHaveLength(0);
    expect(ergCommands.length).toBeGreaterThan(0);
    expect(session.gearPowerW).toBeGreaterThan(50);
    // The physics keeps using the measured power.
    expect(session.state.speedMs).toBeGreaterThan(5);
  });

  it('a harder gear asks for more power after a few seconds', () => {
    const { session, ride } = realistic();
    ride(15, 200);
    const before = session.gearPowerW as number;
    for (let i = 0; i < 3; i++) session.shift(1);
    ride(8, 200);
    expect(session.gearPowerW as number).toBeGreaterThan(before * 1.2);
  });

  it('falls back to grade commands without a cadence sensor', () => {
    const { session } = realistic();
    let sim = 0;
    for (let i = 0; i < 100; i++) {
      session.onReading('trainer', { timestamp: i * 50, powerW: 200 });
      if (session.step(DT).command?.kind === 'sim') sim++;
    }
    expect(sim).toBeGreaterThan(0);
    expect(session.gearPowerW).toBeNull();
  });

  it('the default strategy still sends grades', () => {
    const { ride, ergCommands } = makeSession({ route: flatRoute });
    expect(ride(5, 200).length).toBeGreaterThan(0);
    expect(ergCommands).toHaveLength(0);
  });
});
