import { describe, expect, it } from 'vitest';
import {
  BUILTIN_WORKOUTS,
  flatten,
  ftp,
  needsFtp,
  parseErgMrc,
  parseWorkoutFile,
  parseZwo,
  WorkoutParseError,
  WorkoutRunner,
  watts,
  workoutDurationS,
  workoutStats,
} from './index';

const ZWO = `<?xml version="1.0"?>
<workout_file>
  <author>Someone &amp; co</author>
  <name>Test &amp; go</name>
  <description>Hard stuff</description>
  <workout>
    <Warmup Duration="300" PowerLow="0.40" PowerHigh="0.75"/>
    <SteadyState Duration="600" Power="0.9"><textevent timeoffset="0" message="go"/></SteadyState>
    <IntervalsT Repeat="3" OnDuration="60" OffDuration="120" OnPower="1.2" OffPower="0.5"/>
    <FreeRide Duration="60"/>
    <Cooldown Duration="300" PowerLow="0.7" PowerHigh="0.4"/>
  </workout>
</workout_file>`;

describe('flatten', () => {
  it('resolves FTP shares and unrolls repeats', () => {
    const w = parseZwo(ZWO);
    const iv = flatten(w, 200);
    // warmup, steady, 3×(on, off), free ride, cooldown
    expect(iv).toHaveLength(1 + 1 + 6 + 1 + 1);
    expect(iv[1]).toMatchObject({ startS: 300, durationS: 600, fromW: 180, toW: 180 });
    expect(iv[2]).toMatchObject({ fromW: 240 });
    expect(iv[3]).toMatchObject({ fromW: 100 });
    expect(iv.at(-1)?.startS).toBe(workoutDurationS(w) - 300);
    expect(iv.map((i) => i.index)).toEqual(iv.map((_, k) => k));
  });

  it('uses absolute watts as they are', () => {
    const iv = flatten({ steps: [{ type: 'steady', durationS: 60, power: watts(250) }] }, 123);
    expect(iv[0]?.fromW).toBe(250);
    expect(needsFtp([{ type: 'steady', durationS: 60, power: watts(250) }])).toBe(false);
    expect(needsFtp([{ type: 'steady', durationS: 60, power: ftp(1) }])).toBe(true);
  });
});

describe('parseZwo', () => {
  it('reads name, description and steps', () => {
    const w = parseZwo(ZWO);
    expect(w.name).toBe('Test & go');
    expect(w.description).toBe('Hard stuff');
    expect(w.source).toBe('zwo');
    expect(workoutDurationS(w)).toBe(300 + 600 + 3 * 180 + 60 + 300);
  });

  it('accepts percent-style powers and rejects other files', () => {
    const w = parseZwo(
      '<workout_file><workout><SteadyState Duration="60" Power="85"/></workout></workout_file>',
    );
    expect(flatten(w, 200)[0]?.fromW).toBe(170);
    expect(() => parseZwo('<html></html>')).toThrow(WorkoutParseError);
    expect(() => parseZwo('<workout_file><workout></workout></workout_file>')).toThrow(
      WorkoutParseError,
    );
    expect(() =>
      parseZwo(
        '<workout_file><workout><SteadyState Duration="x" Power="1"/></workout></workout_file>',
      ),
    ).toThrow(WorkoutParseError);
  });
});

const MRC = `[COURSE HEADER]
VERSION = 2
UNITS = ENGLISH
DESCRIPTION = Short one
FILE NAME = Short
MINUTES PERCENT
[END COURSE HEADER]
[COURSE DATA]
0.00 50
5.00 50
5.00 100
10.00 100
10.00 100
12.00 60
[END COURSE DATA]
`;

describe('parseErgMrc', () => {
  it('reads an .mrc as percent of FTP, with steps, plateaus and ramps', () => {
    const w = parseErgMrc(MRC, 'mrc');
    expect(w.name).toBe('Short');
    expect(w.steps).toEqual([
      { type: 'steady', durationS: 300, power: ftp(0.5) },
      { type: 'steady', durationS: 300, power: ftp(1) },
      { type: 'ramp', durationS: 120, from: ftp(1), to: ftp(0.6) },
    ]);
  });

  it('reads an .erg as watts', () => {
    const w = parseErgMrc(
      '[COURSE HEADER]\nMINUTES WATTS\n[END COURSE HEADER]\n[COURSE DATA]\n0 150\n2 150\n[END COURSE DATA]',
      'erg',
    );
    expect(w.steps[0]).toEqual({ type: 'steady', durationS: 120, power: watts(150) });
    expect(needsFtp(w.steps)).toBe(false);
  });

  it('rejects empty or backwards data', () => {
    expect(() => parseErgMrc('[COURSE DATA]\n0 50\n[END COURSE DATA]')).toThrow(WorkoutParseError);
    expect(() => parseErgMrc('[COURSE DATA]\n5 50\n0 50\n[END COURSE DATA]')).toThrow(
      WorkoutParseError,
    );
    expect(() => parseErgMrc('[COURSE DATA]\nabc\n[END COURSE DATA]')).toThrow(WorkoutParseError);
  });
});

describe('parseWorkoutFile', () => {
  it('picks the parser and names unnamed files after the file', () => {
    expect(parseWorkoutFile('x.zwo', ZWO).source).toBe('zwo');
    const w = parseWorkoutFile('Mon plan.mrc', MRC.replace('FILE NAME = Short\n', ''));
    expect(w.source).toBe('mrc');
    expect(w.name).toBe('Mon plan');
  });
});

describe('built-in library', () => {
  it('has valid, distinct workouts', () => {
    expect(new Set(BUILTIN_WORKOUTS.map((w) => w.id)).size).toBe(BUILTIN_WORKOUTS.length);
    for (const w of BUILTIN_WORKOUTS) {
      const iv = flatten(w, 250);
      expect(iv.length).toBeGreaterThan(2);
      expect(iv.every((i) => i.durationS > 0 && i.fromW > 0 && i.toW > 0)).toBe(true);
      const total = iv.reduce((a, i) => a + i.durationS, 0);
      expect(total).toBe(workoutDurationS(w));
      expect(total).toBeGreaterThan(20 * 60);
    }
  });

  it('computes plausible stats', () => {
    const w = BUILTIN_WORKOUTS.find((x) => x.id === 'threshold-3x10');
    if (!w) throw new Error('missing');
    const s = workoutStats(flatten(w, 250), 250);
    expect(s.intensityFactor).toBeGreaterThan(0.7);
    expect(s.intensityFactor).toBeLessThan(1);
    expect(s.tss).toBeGreaterThan(40);
  });
});

describe('WorkoutRunner', () => {
  const run = () =>
    new WorkoutRunner(
      flatten(
        {
          steps: [
            { type: 'steady', durationS: 10, power: watts(100) },
            { type: 'ramp', durationS: 10, from: watts(100), to: watts(200) },
            { type: 'steady', durationS: 10, power: watts(150) },
          ],
        },
        200,
      ),
    );

  it('follows the intervals, ramps linearly and finishes', () => {
    const r = run();
    expect(r.state).toMatchObject({ index: 0, targetW: 100, remainingS: 10, finished: false });
    expect(r.state.next).toMatchObject({ targetW: 100, startsInS: 10 });
    expect(r.advance(10)).toEqual([{ type: 'interval', index: 1 }]);
    r.advance(5);
    expect(r.state.targetW).toBe(150);
    expect(r.state.remainingS).toBe(5);
    expect(r.advance(5)).toEqual([{ type: 'interval', index: 2 }]);
    expect(r.advance(10)).toEqual([{ type: 'finished' }]);
    expect(r.state.finished).toBe(true);
    expect(r.advance(5)).toEqual([]);
  });

  it('crosses several intervals in one big step', () => {
    const r = run();
    expect(r.advance(25).map((e) => e.type)).toEqual(['interval', 'interval']);
    expect(r.state.index).toBe(2);
  });

  it('skips forward and back', () => {
    const r = run();
    r.advance(15);
    expect(r.skip(-1)).toEqual([{ type: 'interval', index: 1 }]); // restart (more than 3 s in)
    expect(r.state.elapsedS).toBe(10);
    r.advance(1);
    r.skip(-1); // 1 s in: previous
    expect(r.state.index).toBe(0);
    r.skip(1);
    r.skip(1);
    expect(r.skip(1)).toEqual([{ type: 'finished' }]);
  });

  it('handles an empty workout', () => {
    const r = new WorkoutRunner([]);
    expect(r.state.finished).toBe(true);
    expect(r.advance(1)).toEqual([]);
  });
});
