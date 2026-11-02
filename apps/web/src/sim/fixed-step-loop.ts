/**
 * Fixed-step simulation clock, decoupled from rendering (docs/01-architecture.md §3).
 * dt comes from performance.now(), so a throttled timer is caught up with
 * sub-steps (capped, to avoid a spiral after a long pause).
 */
export class FixedStepLoop {
  private accumulatorS = 0;
  private lastMs: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly stepFn: (dtS: number) => void,
    readonly dtS = 0.05,
    private readonly maxStepsPerTick = 40,
    private readonly now: () => number = () => performance.now(),
  ) {}

  start(tickIntervalMs = 20): void {
    if (this.timer) return;
    this.lastMs = this.now();
    this.timer = setInterval(() => this.tick(), tickIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lastMs = null;
    this.accumulatorS = 0;
  }

  /** Runs the steps that are due. Returns how many were run. */
  tick(): number {
    const nowMs = this.now();
    if (this.lastMs === null) this.lastMs = nowMs;
    this.accumulatorS += (nowMs - this.lastMs) / 1000;
    this.lastMs = nowMs;
    let steps = 0;
    // Small epsilon so float rounding never swallows a due step.
    while (this.accumulatorS + 1e-9 >= this.dtS && steps < this.maxStepsPerTick) {
      this.stepFn(this.dtS);
      this.accumulatorS -= this.dtS;
      steps++;
    }
    // Too far behind: drop the backlog instead of freezing the page.
    if (steps === this.maxStepsPerTick) this.accumulatorS = 0;
    return steps;
  }

  /** Fraction of the next step already elapsed, used to interpolate rendering (0..1). */
  alpha(): number {
    if (this.lastMs === null) return 0;
    const pendingS = this.accumulatorS + (this.now() - this.lastMs) / 1000;
    return Math.min(1, pendingS / this.dtS);
  }
}
