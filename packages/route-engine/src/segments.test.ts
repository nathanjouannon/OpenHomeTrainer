import { describe, expect, it } from 'vitest';
import { buildLoopRoute } from './build-loop';
import { Route, type RouteSegment } from './route';
import { detectSegments, SegmentTracker, withSegments } from './segments';

/** Open straight road whose altitude follows `zAt(d)`, points every 10 m. */
function straight(lengthM: number, zAt: (d: number) => number, loop = false): Route {
  const n = Math.round(lengthM / 10);
  const d = Array.from({ length: n }, (_, i) => i * 10);
  return new Route(
    {
      id: 'straight',
      version: 1,
      name: { fr: 's', en: 's' },
      mode: 'real',
      worldId: null,
      loop,
      lengthM,
      ascentM: 0,
      descentM: 0,
      sampleStepM: 10,
      segments: [],
      surface: [],
      attribution: [],
    },
    {
      d,
      x: d,
      y: d.map(() => 0),
      z: d.map(zAt),
      grade: d.map(() => 0),
      heading: d.map(() => 0),
    },
  );
}

describe('detectSegments', () => {
  it('finds a sustained climb and a flat sprint, not the small bumps', () => {
    // 0-2000 flat with a 3 m bump, 2000-4000 climb 6 % (+120 m), 4000-7000 flat.
    const z = (d: number) =>
      d < 2000
        ? 3 * Math.sin(d / 100)
        : d < 4000
          ? (d - 2000) * 0.06
          : 120 + 0.5 * Math.sin(d / 300);
    const segs = detectSegments(straight(7000, z));
    const climb = segs.find((s) => s.type === 'climb');
    expect(segs.filter((s) => s.type === 'climb')).toHaveLength(1);
    expect(climb?.id).toBe('climb-1');
    expect(climb?.startM).toBeGreaterThan(900);
    expect(climb?.startM).toBeLessThan(2300);
    expect(climb?.endM).toBeGreaterThan(3800);
    const sprint = segs.find((s) => s.type === 'sprint');
    expect(sprint).toBeDefined();
    expect((sprint?.endM ?? 0) - (sprint?.startM ?? 0)).toBe(1000);
    // The sprint does not overlap the climb.
    expect(sprint && climb && (sprint.endM <= climb.startM || sprint.startM >= climb.endM)).toBe(
      true,
    );
  });

  it('finds nothing on a short flat road, and is deterministic', () => {
    const flat = straight(2000, () => 100);
    expect(detectSegments(flat)).toEqual([]);
    const hilly = straight(7000, (d) => Math.max(0, d - 3000) * 0.05);
    expect(detectSegments(hilly)).toEqual(detectSegments(hilly));
  });

  it('withSegments keeps existing segments and adds detected ones otherwise', () => {
    const r = straight(7000, (d) => Math.max(0, d - 3000) * 0.05);
    const w = withSegments(r);
    expect(w.meta.segments.length).toBeGreaterThan(0);
    expect(withSegments(w)).toBe(w);
    expect(w.sampleAt(3500).z).toBeCloseTo(r.sampleAt(3500).z, 9);
  });
});

describe('SegmentTracker', () => {
  const seg: RouteSegment = {
    id: 'climb-1',
    name: { fr: 'M', en: 'C' },
    type: 'climb',
    startM: 1000,
    endM: 2000,
  };

  it('times a segment with interpolated start and end', () => {
    const t = new SegmentTracker([seg], 5000, false);
    // 10 m/s: start at t=100, end at t=200, sampled every 7 s.
    const events = [];
    for (let time = 7; time <= 280; time += 7) events.push(...t.update(time, time * 10));
    expect(events.map((e) => e.kind)).toEqual(['start', 'end']);
    const end = events[1];
    expect(end?.kind === 'end' && end.durationS).toBeCloseTo(100, 6);
    expect(end?.kind === 'end' && end.startS).toBeCloseTo(100, 6);
    expect(t.active).toBeNull();
  });

  it('reports the active segment while inside it', () => {
    const t = new SegmentTracker([seg], 5000, false);
    t.update(50, 500);
    expect(t.active).toBeNull();
    t.update(120, 1200);
    expect(t.active?.segment.id).toBe('climb-1');
    expect(t.active?.endDistanceM).toBe(2000);
  });

  it('handles a segment that starts at distance 0', () => {
    const t = new SegmentTracker([{ ...seg, startM: 0, endM: 500 }], 5000, false);
    const ev = t.update(10, 100);
    expect(ev.map((e) => e.kind)).toEqual(['start']);
  });

  it('repeats on every lap of a loop and ignores laps of an open route', () => {
    const loop = new SegmentTracker([seg], 5000, true);
    const kinds: string[] = [];
    const laps: number[] = [];
    for (let time = 5; time <= 1090; time += 5) {
      for (const e of loop.update(time, time * 10)) {
        kinds.push(e.kind);
        if (e.kind === 'end') laps.push(e.lap);
      }
    }
    expect(kinds).toEqual(['start', 'end', 'start', 'end']);
    expect(laps).toEqual([1, 2]);

    const open = new SegmentTracker([seg], 5000, false);
    const k2: string[] = [];
    for (let time = 5; time <= 1090; time += 5)
      k2.push(...open.update(time, time * 10).map((e) => e.kind));
    expect(k2).toEqual(['start', 'end']);
  });

  it('a long step across a whole segment yields start then end', () => {
    const t = new SegmentTracker([seg], 5000, false);
    const ev = t.update(300, 3000);
    expect(ev.map((e) => e.kind)).toEqual(['start', 'end']);
  });
});

describe('segments on a built loop', () => {
  it('detects the climb of a hilly loop', () => {
    const controls: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      controls.push([Math.sin(a) * 2000, Math.cos(a) * 1200]);
    }
    const route = buildLoopRoute({
      id: 'l',
      name: { fr: 'l', en: 'l' },
      worldId: 't',
      controls,
      elevationAt: (x, y) => 500 + 150 * Math.exp(-((x - 1500) ** 2 + y ** 2) / 1e6),
    });
    const segs = detectSegments(route);
    expect(segs.some((s) => s.type === 'climb')).toBe(true);
  });
});
