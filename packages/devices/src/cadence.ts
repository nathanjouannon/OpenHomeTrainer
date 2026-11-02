const UINT16 = 0x10000;

/**
 * Cadence from cumulative crank revolution data (CPS or CSCS).
 * Handles 16-bit rollover and drops to 0 when the counters stop moving.
 */
export class CrankCadenceCalculator {
  private last: { revs: number; eventTime: number; receivedAtMs: number } | null = null;
  private cadence = 0;

  constructor(private readonly staleAfterMs = 2500) {}

  /** Feeds one measurement; returns the current cadence in rpm. */
  update(revs: number, eventTime1024: number, nowMs: number): number {
    const prev = this.last;
    if (!prev) {
      this.last = { revs, eventTime: eventTime1024, receivedAtMs: nowMs };
      return this.cadence;
    }
    const dRevs = (revs - prev.revs + UINT16) % UINT16;
    const dTime = (eventTime1024 - prev.eventTime + UINT16) % UINT16;
    if (dRevs > 0 && dTime > 0) {
      this.cadence = (dRevs / (dTime / 1024)) * 60;
      this.last = { revs, eventTime: eventTime1024, receivedAtMs: nowMs };
    } else if (nowMs - prev.receivedAtMs > this.staleAfterMs) {
      this.cadence = 0;
    }
    return this.cadence;
  }
}
