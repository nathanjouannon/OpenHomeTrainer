// One ride: devices in, physics + route + laps + virtual gears, trainer
// commands and 1 Hz samples out (docs/01-architecture.md §3).
// Plain TypeScript without DOM, driven by a fixed 20 Hz step.

import type { SensorReading } from '@hrt/devices';
import {
  type DrivetrainConfig,
  ErgController,
  type ErgState,
  Gearbox,
  type TrainerCommand,
  TrainerController,
} from '@hrt/drivetrain';
import { airDensityAtAltitude, type RiderParams, simulateStep } from '@hrt/physics';
import { type NewRide, type RideHeader, RideRecorder, type RideSample } from '@hrt/recorder';
import { emptyRoutePoint, type LapCrossing, LapTracker, type Route } from '@hrt/route-engine';

/** Power older than this is considered gone: the rider freewheels (docs/04 §8). */
export const STALE_POWER_MS = 3000;
const MAX_POWER_W = 2500;
/** ERG: power change per press of a gear button, in W. */
export const ERG_STEP_W = 5;
const MAX_POWER_W_PER_KG = 25;
const CRR_BY_SURFACE = { asphalt: 0.004, gravel: 0.008, dirt: 0.012 } as const;

export type PowerSource = 'trainer' | 'powermeter';
export type ReadingSource = 'trainer' | 'powermeter' | 'heartrate';

export interface RideSessionConfig {
  route: Route;
  rider: Omit<RiderParams, 'crr'> & { ftpW: number | null };
  /** null: virtual shifting disabled. */
  drivetrain: DrivetrainConfig | null;
  difficulty: number;
  powerSource: PowerSource;
  ride: NewRide;
  /** Wall clock (epoch ms). */
  now?: () => number;
  /** Monotonic clock (ms), same base as SensorReading.timestamp. */
  clock?: () => number;
}

export interface LiveState {
  /** Riding time, s. */
  timeS: number;
  distanceM: number;
  /** Distance at the previous step, for render interpolation. */
  prevDistanceM: number;
  speedMs: number;
  powerW: number;
  /** 3 s average power. */
  power3sW: number;
  cadenceRpm: number;
  heartRateBpm: number | null;
  gradePercent: number;
  altitudeM: number;
  ascentM: number;
  lap: number;
  lapDistanceM: number;
  lapTimeS: number;
  lastLapS: number | null;
  bestLapS: number | null;
  /** Cog position on the cassette, 0 = largest (easiest); null without virtual shifting. */
  gearIndex: number | null;
  /** Number of cogs of the cassette. */
  gearCount: number;
  /** "50×17". */
  gearLabel: string | null;
  /** Grade last sent to the trainer. */
  trainerGradePercent: number | null;
  /** ERG target in W, or null in SIM mode. */
  ergTargetW: number | null;
  /** Power actually commanded to the trainer in ERG mode (after ramp), W. */
  ergCommandW: number | null;
  ergState: ErgState | null;
  paused: boolean;
  powerStale: boolean;
  goalReached: boolean;
}

export type RideEvent =
  | { type: 'lap'; crossing: LapCrossing }
  | { type: 'gear'; label: string; index: number }
  | { type: 'goal' }
  | { type: 'erg'; on: boolean; targetW: number | null }
  | { type: 'ergTarget'; targetW: number }
  | { type: 'ergSpiral' }
  | { type: 'ergRecovered' }
  | { type: 'pause' }
  | { type: 'resume' };

interface Latest {
  value: number;
  at: number;
}

export class RideSession {
  readonly state: LiveState;
  readonly gearbox: Gearbox | null;
  readonly trainer: TrainerController;
  readonly recorder: RideRecorder;
  private readonly laps: LapTracker;
  private readonly route: Route;
  private readonly params: RiderParams;
  private readonly clock: () => number;
  private readonly point = emptyRoutePoint();
  private readonly listeners = new Set<(e: RideEvent) => void>();
  private readonly latest: Partial<
    Record<
      | 'trainerPower'
      | 'meterPower'
      | 'trainerCadence'
      | 'meterCadence'
      | 'heartRate'
      | 'trainerHeartRate',
      Latest
    >
  > = {};
  private readonly powerWindow: number[] = [];
  private lastSample: RideSample | null = null;
  private erg: ErgController | null = null;

  constructor(private readonly config: RideSessionConfig) {
    this.route = config.route;
    this.clock = config.clock ?? (() => performance.now());
    this.params = { ...config.rider, crr: CRR_BY_SURFACE.asphalt };
    this.gearbox = config.drivetrain ? new Gearbox(config.drivetrain) : null;
    this.trainer = new TrainerController({ difficulty: config.difficulty });
    this.recorder = new RideRecorder(config.ride, config.now);
    this.laps = new LapTracker(this.route.lengthM);
    const start = this.route.sampleAt(0, this.point);
    this.state = {
      timeS: 0,
      distanceM: 0,
      prevDistanceM: 0,
      speedMs: 0,
      powerW: 0,
      power3sW: 0,
      cadenceRpm: 0,
      heartRateBpm: null,
      gradePercent: start.gradePercent,
      altitudeM: start.z,
      ascentM: 0,
      lap: 1,
      lapDistanceM: 0,
      lapTimeS: 0,
      lastLapS: null,
      bestLapS: null,
      gearIndex: this.gearbox?.rearIndex ?? null,
      gearCount: this.gearbox?.cogCount ?? 0,
      gearLabel: this.gearbox?.label() ?? null,
      trainerGradePercent: null,
      ergTargetW: null,
      ergCommandW: null,
      ergState: null,
      paused: false,
      powerStale: true,
      goalReached: false,
    };
  }

  on(cb: (e: RideEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: RideEvent) {
    for (const cb of this.listeners) cb(e);
  }

  /** Feeds a sensor reading from one of the connected devices. */
  onReading(source: ReadingSource, r: SensorReading): void {
    const at = r.timestamp;
    const massKg = this.params.massKg;
    const plausible = (w: number) => w >= 0 && w <= MAX_POWER_W && w / massKg <= MAX_POWER_W_PER_KG;
    if (source === 'heartrate') {
      if (r.heartRateBpm !== undefined && r.heartRateBpm > 0)
        this.latest.heartRate = { value: r.heartRateBpm, at };
      return;
    }
    const prefix = source === 'trainer' ? 'trainer' : 'meter';
    if (r.powerW !== undefined && plausible(r.powerW))
      this.latest[`${prefix}Power`] = { value: r.powerW, at };
    if (r.cadenceRpm !== undefined) this.latest[`${prefix}Cadence`] = { value: r.cadenceRpm, at };
    if (source === 'trainer' && r.heartRateBpm !== undefined && r.heartRateBpm > 0) {
      this.latest.trainerHeartRate = { value: r.heartRateBpm, at };
    }
  }

  private fresh(key: keyof RideSession['latest'], now: number): number | null {
    const l = this.latest[key];
    return l && now - l.at < STALE_POWER_MS ? l.value : null;
  }

  /** Power, cadence and heart rate from the preferred source, falling back to the other one. */
  private inputs(now: number) {
    const meterFirst = this.config.powerSource === 'powermeter';
    const p1 = this.fresh(meterFirst ? 'meterPower' : 'trainerPower', now);
    const p2 = this.fresh(meterFirst ? 'trainerPower' : 'meterPower', now);
    const c1 = this.fresh(meterFirst ? 'meterCadence' : 'trainerCadence', now);
    const c2 = this.fresh(meterFirst ? 'trainerCadence' : 'meterCadence', now);
    return {
      powerW: p1 ?? p2,
      cadenceRpm: c1 ?? c2 ?? 0,
      cadenceKnown: (c1 ?? c2) !== null,
      heartRateBpm: this.fresh('heartRate', now) ?? this.fresh('trainerHeartRate', now),
    };
  }

  /** Rear shift by default; `front` changes chainring. 1 = harder. */
  shift(direction: 1 | -1, derailleur: 'rear' | 'front' = 'rear'): void {
    // In ERG the gear buttons move the target instead (the gear is kept, inactive).
    if (this.erg) {
      if (derailleur === 'rear') this.adjustErg(direction * ERG_STEP_W);
      return;
    }
    const box = this.gearbox;
    if (!box) return;
    const changed =
      derailleur === 'front'
        ? direction > 0
          ? box.shiftFrontUp()
          : box.shiftFrontDown()
        : direction > 0
          ? box.shiftUp()
          : box.shiftDown();
    if (!changed) return;
    this.state.gearIndex = box.rearIndex;
    this.state.gearLabel = box.label();
    this.emit({ type: 'gear', label: this.state.gearLabel, index: box.index });
  }

  get ergActive(): boolean {
    return this.erg !== null;
  }

  /**
   * Switches to ERG at `watts` (the trainer holds that power whatever the grade),
   * or back to SIM with `null`. Workouts (lot 3.2) call this at each interval.
   */
  setErg(watts: number | null): void {
    if (watts === null) {
      if (!this.erg) return;
      this.erg = null;
      this.trainer.invalidate();
      this.state.ergTargetW = null;
      this.state.ergCommandW = null;
      this.state.ergState = null;
      this.emit({ type: 'erg', on: false, targetW: null });
      return;
    }
    if (this.erg) {
      this.erg.setTarget(watts);
      this.state.ergTargetW = this.erg.targetW;
      this.emit({ type: 'ergTarget', targetW: this.erg.targetW });
      return;
    }
    this.erg = new ErgController(watts);
    this.state.ergTargetW = this.erg.targetW;
    this.state.ergState = 'active';
    this.emit({ type: 'erg', on: true, targetW: this.erg.targetW });
  }

  /** ERG on at the current 3 s power (rounded to 5 W), or off. */
  toggleErg(): void {
    if (this.erg) this.setErg(null);
    else this.setErg(Math.max(50, Math.round(this.state.power3sW / 5) * 5));
  }

  /** ±5 W on the ERG target (docs/15 §3.4). Returns false in SIM mode. */
  adjustErg(deltaW: number): boolean {
    if (!this.erg) return false;
    // After a spiral, a button press also tells the controller the rider is back.
    this.erg.resume();
    this.setErg(this.erg.targetW + deltaW);
    return true;
  }

  setDifficulty(difficulty: number): void {
    this.trainer.setDifficulty(difficulty);
  }

  pause(): void {
    if (this.state.paused) return;
    this.state.paused = true;
    this.state.speedMs = 0;
    this.emit({ type: 'pause' });
  }

  resume(): void {
    if (!this.state.paused) return;
    this.state.paused = false;
    this.emit({ type: 'resume' });
  }

  togglePause(): void {
    if (this.state.paused) this.resume();
    else this.pause();
  }

  /** One fixed simulation step. */
  step(dtS: number): { command: TrainerCommand | null; sample: RideSample | null } {
    const s = this.state;
    const now = this.clock();
    const inp = this.inputs(now);
    s.powerStale = inp.powerW === null;
    s.powerW = inp.powerW ?? 0;
    s.cadenceRpm = inp.cadenceRpm;
    s.heartRateBpm = inp.heartRateBpm;
    s.prevDistanceM = s.distanceM;

    // The trainer keeps receiving its command even when paused (no jolt on resume).
    let command: TrainerCommand | null;
    if (this.erg) {
      const u = this.erg.update(dtS, {
        cadenceRpm: inp.cadenceKnown ? inp.cadenceRpm : null,
        paused: s.paused,
      });
      command = u.powerW === null ? null : { kind: 'erg', powerW: u.powerW };
      s.ergCommandW = this.erg.commandW;
      s.ergState = this.erg.state;
      if (u.event === 'spiral') this.emit({ type: 'ergSpiral' });
      else if (u.event === 'recovered') this.emit({ type: 'ergRecovered' });
    } else {
      command = this.trainer.update(dtS, {
        gradePercent: s.gradePercent,
        gearRatio: this.gearbox?.gear.ratio ?? null,
        neutralRatio: this.gearbox?.neutralRatio ?? 1,
      });
      if (command) s.trainerGradePercent = command.gradePercent;
    }
    if (s.paused) return { command, sample: null };

    this.powerWindow.push(s.powerW);
    if (this.powerWindow.length > Math.round(3 / dtS)) this.powerWindow.shift();
    s.power3sW = this.powerWindow.reduce((a, b) => a + b, 0) / this.powerWindow.length;

    this.params.crr = CRR_BY_SURFACE[this.route.surfaceAt(s.distanceM)];
    const next = simulateStep(
      { speedMs: s.speedMs, distanceM: s.distanceM },
      {
        powerW: s.powerW,
        gradePercent: s.gradePercent,
        airDensity: airDensityAtAltitude(s.altitudeM),
        draftFactor: 0,
      },
      this.params,
      dtS,
    );
    s.timeS += dtS;
    s.speedMs = next.speedMs;
    s.distanceM = next.distanceM;

    const p = this.route.sampleAt(s.distanceM, this.point);
    const dz = p.z - s.altitudeM;
    if (dz > 0) s.ascentM += dz;
    s.altitudeM = p.z;
    s.gradePercent = p.gradePercent;
    const lap = this.route.lapOf(s.distanceM);
    s.lap = lap.lap;
    s.lapDistanceM = lap.lapDistanceM;

    if (this.route.loop) {
      for (const crossing of this.laps.update(s.timeS, s.distanceM)) {
        this.recorder.markLap(crossing.endS, 'loop');
        s.lastLapS = crossing.durationS;
        s.bestLapS = this.laps.bestLapS;
        this.emit({ type: 'lap', crossing });
      }
      s.lapTimeS = this.laps.currentLapTimeS(s.timeS);
    } else {
      s.lapTimeS = s.timeS;
    }

    const sample = this.recorder.step(dtS, {
      powerW: s.powerW,
      cadenceRpm: s.cadenceRpm,
      heartRateBpm: s.heartRateBpm,
      speedMs: s.speedMs,
      distanceM: s.distanceM,
      lap: s.lap,
      lapDistanceM: s.lapDistanceM,
      altitudeM: s.altitudeM,
      gradePercent: s.gradePercent,
      gear: this.gearbox?.index ?? null,
    });
    if (sample) this.lastSample = sample;
    this.checkGoal();
    return { command, sample };
  }

  private checkGoal() {
    const goal = this.config.ride.goal;
    if (!goal || this.state.goalReached) return;
    const s = this.state;
    const reached =
      (goal.kind === 'duration' && s.timeS >= goal.value) ||
      (goal.kind === 'distance' && s.distanceM >= goal.value) ||
      (goal.kind === 'laps' && s.lap - 1 >= goal.value);
    if (reached) {
      s.goalReached = true;
      this.emit({ type: 'goal' });
    }
  }

  /** Closes the current lap by hand. */
  manualLap(): void {
    this.recorder.markLap(this.state.timeS, 'manual');
  }

  get lastRecordedSample(): RideSample | null {
    return this.lastSample;
  }

  finish(): RideHeader {
    return this.recorder.finish();
  }
}
