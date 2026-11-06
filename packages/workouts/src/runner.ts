// Follows a workout in time: current interval, target power, time left.

import type { Interval } from './model';

export interface RunnerState {
  index: number;
  count: number;
  label: string;
  elapsedS: number;
  totalS: number;
  /** Time left in the current interval. */
  remainingS: number;
  /** Target power right now (ramps move linearly), W. */
  targetW: number;
  next: { label: string; targetW: number; startsInS: number } | null;
  finished: boolean;
}

export type RunnerEvent = { type: 'interval'; index: number } | { type: 'finished' };

/** An interval restarted instead of skipped back when it began less than this ago. */
const RESTART_AFTER_S = 3;

export class WorkoutRunner {
  readonly totalS: number;
  private elapsedS = 0;
  private index = 0;
  private done = false;

  constructor(readonly intervals: readonly Interval[]) {
    this.totalS = intervals.reduce((a, i) => a + i.durationS, 0);
    this.done = intervals.length === 0;
  }

  /** Moves time forward; returns the events crossed. */
  advance(dtS: number): RunnerEvent[] {
    const events: RunnerEvent[] = [];
    if (this.done) return events;
    this.elapsedS += dtS;
    while (!this.done) {
      const cur = this.intervals[this.index];
      if (!cur || this.elapsedS < cur.startS + cur.durationS) break;
      if (this.index + 1 >= this.intervals.length) {
        this.done = true;
        this.elapsedS = this.totalS;
        events.push({ type: 'finished' });
      } else {
        this.index++;
        events.push({ type: 'interval', index: this.index });
      }
    }
    return events;
  }

  /** Jumps to the start of the next (1) or the current/previous (-1) interval. */
  skip(direction: 1 | -1): RunnerEvent[] {
    if (this.done) return [];
    const cur = this.intervals[this.index];
    if (!cur) return [];
    if (direction === 1) {
      if (this.index + 1 >= this.intervals.length) {
        this.done = true;
        this.elapsedS = this.totalS;
        return [{ type: 'finished' }];
      }
      this.index++;
    } else if (this.elapsedS - cur.startS > RESTART_AFTER_S || this.index === 0) {
      // Restart the current one.
    } else {
      this.index--;
    }
    this.elapsedS = (this.intervals[this.index] as Interval).startS;
    return [{ type: 'interval', index: this.index }];
  }

  get state(): RunnerState {
    const last = this.intervals[this.intervals.length - 1];
    const cur = this.intervals[this.index] ?? last;
    if (!cur) {
      return {
        index: 0,
        count: 0,
        label: '',
        elapsedS: 0,
        totalS: 0,
        remainingS: 0,
        targetW: 0,
        next: null,
        finished: true,
      };
    }
    const into = Math.min(cur.durationS, Math.max(0, this.elapsedS - cur.startS));
    const nxt = this.done ? undefined : this.intervals[this.index + 1];
    return {
      index: cur.index,
      count: this.intervals.length,
      label: cur.label,
      elapsedS: this.elapsedS,
      totalS: this.totalS,
      remainingS: Math.max(0, cur.durationS - into),
      targetW: Math.round(cur.fromW + (cur.toW - cur.fromW) * (into / cur.durationS)),
      next: nxt
        ? {
            label: nxt.label,
            targetW: nxt.fromW,
            startsInS: Math.max(0, cur.startS + cur.durationS - this.elapsedS),
          }
        : null,
      finished: this.done,
    };
  }
}
