/** Frame time statistics for the FPS budget (average and 1 % low). */
export class FrameStats {
  private frameTimesMs: number[] = [];
  private sinceMs = performance.now();
  drawCalls = 0;
  triangles = 0;

  record(deltaS: number, info: { calls: number; triangles: number }): void {
    const ms = deltaS * 1000;
    // Ignore huge gaps (tab hidden, debugger pause): they are not rendering frames.
    if (ms > 0 && ms < 1000) this.frameTimesMs.push(ms);
    if (this.frameTimesMs.length > 40_000) this.frameTimesMs.splice(0, 20_000);
    this.drawCalls = info.calls;
    this.triangles = info.triangles;
  }

  reset(): void {
    this.frameTimesMs = [];
    this.sinceMs = performance.now();
  }

  snapshot() {
    const all = this.frameTimesMs;
    const recent = all.slice(-60);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const recentMs = avg(recent);
    const meanMs = avg(all);
    const sorted = [...all].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    return {
      fps: recentMs ? 1000 / recentMs : 0,
      avgFps: meanMs ? 1000 / meanMs : 0,
      low1Fps: p99 ? 1000 / p99 : 0,
      frames: all.length,
      durationS: (performance.now() - this.sinceMs) / 1000,
      drawCalls: this.drawCalls,
      triangles: this.triangles,
    };
  }
}

export type FrameStatsSnapshot = ReturnType<FrameStats['snapshot']>;
