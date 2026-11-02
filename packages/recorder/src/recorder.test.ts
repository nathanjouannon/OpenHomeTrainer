import 'fake-indexeddb/auto';
import { Decoder, Stream } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';
import { encodeRideFit, fitFileName } from './fit/activity';
import { fitCrc } from './fit/writer';
import { finalizeRide, type NewRide, RideRecorder } from './ride-recorder';
import { computeStats, normalizedPower } from './stats';
import { IdbRideStore, MemoryRideStore, RideSaver } from './store';
import type { RideSample } from './types';

const NEW_RIDE: NewRide = {
  id: 'ride-1',
  route: { id: 'boucle-test', name: { fr: 'Test', en: 'Test' }, lengthM: 2000, loop: true },
  worldId: 'world-1',
  rider: { weightKg: 75, ftpW: 250 },
  appVersion: 'test',
  goal: null,
};

/**
 * Rides `durationS` at 20 Hz on a 2 km loop, with an alternating power so
 * that NP > average power. Returns the recorder after `finish()`.
 */
function simulateRide(durationS: number, startMs = Date.UTC(2026, 10, 2, 17, 0, 0)) {
  let clock = startMs;
  const rec = new RideRecorder(NEW_RIDE, () => clock);
  const dt = 0.05;
  let distance = 0;
  let prevLapCount = 0;
  for (let i = 0; i < durationS / dt; i++) {
    const t = (i + 1) * dt;
    const powerW = Math.floor(i / 1200) % 2 === 0 ? 300 : 100; // alternate every minute
    const speedMs = 9;
    distance += speedMs * dt;
    clock = startMs + t * 1000;
    const lap = Math.floor(distance / 2000) + 1;
    rec.step(dt, {
      powerW,
      cadenceRpm: 90,
      heartRateBpm: 140,
      speedMs,
      distanceM: distance,
      lap,
      lapDistanceM: distance % 2000,
      altitudeM: 500 + 20 * Math.sin(distance / 300),
      gradePercent: 2,
      gear: 11,
    });
    if (lap - 1 > prevLapCount) {
      prevLapCount = lap - 1;
      rec.markLap(t - (distance % 2000) / speedMs, 'loop');
    }
  }
  rec.finish();
  return rec;
}

describe('stats', () => {
  it('NP of a constant power is that power; NP ≥ average otherwise', () => {
    expect(normalizedPower(Array(600).fill(200))).toBeCloseTo(200, 9);
    const alternating = Array.from({ length: 1200 }, (_, i) =>
      Math.floor(i / 60) % 2 ? 100 : 300,
    );
    expect(normalizedPower(alternating)).toBeGreaterThan(200);
  });

  it('TSS of one hour at FTP is 100', () => {
    const samples: RideSample[] = Array.from({ length: 3600 }, (_, i) => ({
      t: i + 1,
      ts: (i + 1) * 1000,
      powerW: 250,
      cadenceRpm: 90,
      heartRateBpm: null,
      speedMs: 10,
      distanceM: (i + 1) * 10,
      lap: 1,
      lapDistanceM: 0,
      altitudeM: 0,
      gradePercent: 0,
      gear: null,
    }));
    const s = computeStats(samples, { ftpW: 250, startDistanceM: 0 });
    expect(s.tss).toBeCloseTo(100, 6);
    expect(s.intensityFactor).toBeCloseTo(1, 9);
    expect(s.distanceM).toBe(36_000);
    expect(s.workKj).toBeCloseTo(900, 9);
    expect(s.avgHeartRateBpm).toBeNull();
  });
});

describe('RideRecorder', () => {
  const rec = simulateRide(25 * 60);
  const h = rec.header;

  it('records one sample per second with averaged power', () => {
    expect(rec.samples).toHaveLength(1500);
    expect(rec.samples[0]?.t).toBe(1);
    expect(rec.samples[59]?.powerW).toBe(300);
    expect(rec.samples[60]?.powerW).toBe(100);
    expect(h.stats?.avgPowerW).toBeCloseTo(204, 9); // 13 min at 300 W, 12 min at 100 W;
  });

  it('keeps one lap per loop plus the final partial lap', () => {
    // 1500 s × 9 m/s = 13.5 km → 6 full laps of 2 km + 1.5 km.
    expect(h.laps.filter((l) => l.trigger === 'loop')).toHaveLength(6);
    expect(h.laps.at(-1)?.trigger).toBe('end');
    for (const lap of h.laps.slice(0, 6)) {
      expect(lap.endS - lap.startS).toBeCloseTo(2000 / 9, 6);
      expect(lap.stats.distanceM).toBeGreaterThan(1990);
      expect(lap.stats.distanceM).toBeLessThan(2010);
    }
    expect(h.bestLapS).toBeCloseTo(2000 / 9, 6);
    const lapDistance = h.laps.reduce((s, l) => s + l.stats.distanceM, 0);
    expect(lapDistance).toBeCloseTo(h.distanceM, 6);
  });

  it('finalizes a ride recovered after a crash', () => {
    const recovered = finalizeRide(
      { ...h, status: 'recording', stats: null, laps: h.laps.slice(0, 3) },
      rec.samples,
      Date.now(),
    );
    expect(recovered.status).toBe('finished');
    expect(recovered.laps).toHaveLength(4);
    expect(recovered.stats?.durationS).toBe(1500);
  });
});

describe('FIT export', () => {
  const rec = simulateRide(25 * 60);
  const bytes = encodeRideFit(rec.header, rec.samples);

  it('has a valid header and CRC', () => {
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('.FIT');
    expect(fitCrc(bytes)).toBe(0); // CRC over the whole file including its own CRC is 0
  });

  it('is read back by the official Garmin FIT SDK', () => {
    const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
    expect(decoder.isFIT()).toBe(true);
    expect(decoder.checkIntegrity()).toBe(true);
    const { messages: raw, errors } = decoder.read({ convertTypesToStrings: true });
    const messages = raw as Required<typeof raw>;
    expect(errors).toEqual([]);

    expect(messages.fileIdMesgs[0]?.type).toBe('activity');
    expect(messages.recordMesgs).toHaveLength(1500);
    const r = messages.recordMesgs[30];
    expect(r?.power).toBe(300);
    expect(r?.cadence).toBe(90);
    expect(r?.heartRate).toBe(140);
    expect(r?.speed).toBeCloseTo(9, 3);
    expect(r?.altitude).toBeCloseTo(rec.samples[30]?.altitudeM ?? 0, 0);
    expect(r?.distance).toBeCloseTo(rec.samples[30]?.distanceM ?? 0, 1);
    expect(r?.positionLat).toBeUndefined();

    expect(messages.lapMesgs).toHaveLength(7);
    expect(messages.lapMesgs[0]?.totalTimerTime).toBeCloseTo(2000 / 9, 2);
    expect(messages.lapMesgs[0]?.lapTrigger).toBe('positionLap');

    const session = messages.sessionMesgs[0];
    expect(session?.sport).toBe('cycling');
    expect(session?.subSport).toBe('virtualActivity');
    expect(session?.numLaps).toBe(7);
    expect(session?.totalTimerTime).toBe(1500);
    expect(session?.avgPower).toBe(Math.round(rec.header.stats?.avgPowerW ?? 0));
    expect(session?.thresholdPower).toBe(250);
    expect(session?.totalDistance).toBeCloseTo(13_500, 0);

    expect(messages.activityMesgs[0]?.numSessions).toBe(1);
  });

  it('refuses a ride that is still recording', () => {
    expect(() => encodeRideFit({ ...rec.header, status: 'recording' }, rec.samples)).toThrow();
  });

  it('names the file after the date and the route', () => {
    expect(fitFileName(rec.header)).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}_boucle-test\.fit$/);
  });
});

describe('storage', () => {
  for (const [name, make] of [
    ['memory', () => new MemoryRideStore()],
    ['IndexedDB', () => new IdbRideStore()],
  ] as const) {
    it(`${name}: incremental saves rebuild the whole ride`, async () => {
      const store = make();
      const rec = simulateRide(150);
      const saver = new RideSaver(store, rec.header.id);
      // Flush at 70 s, 130 s and at the end: partial chunks are rewritten.
      await saver.flush(rec.header, rec.samples.slice(0, 70));
      await saver.flush(rec.header, rec.samples.slice(0, 130));
      await saver.flush(rec.header, rec.samples);
      const samples = await store.getSamples(rec.header.id);
      expect(samples.map((s) => s.t)).toEqual(rec.samples.map((s) => s.t));
      expect((await store.getHeader(rec.header.id))?.status).toBe('finished');
      expect((await store.listHeaders()).map((h) => h.id)).toContain(rec.header.id);
      await store.deleteRide(rec.header.id);
      expect(await store.getHeader(rec.header.id)).toBeNull();
      expect(await store.getSamples(rec.header.id)).toEqual([]);
    });
  }
});
