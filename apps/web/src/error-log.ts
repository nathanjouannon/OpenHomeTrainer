// Errors captured locally (docs/01 §7): console + downloadable log, no remote telemetry.

interface ErrorEntry {
  at: string;
  message: string;
  stack?: string;
}

class ErrorLog {
  private readonly entries: ErrorEntry[] = [];

  add(message: string, stack?: string) {
    this.entries.push({ at: new Date().toISOString(), message, ...(stack ? { stack } : {}) });
    if (this.entries.length > 500) this.entries.shift();
  }

  get count() {
    return this.entries.length;
  }

  toJSON(): string {
    return JSON.stringify(
      { format: 'hrt-error-log/1', userAgent: navigator.userAgent, entries: this.entries },
      null,
      2,
    );
  }

  install() {
    window.addEventListener('error', (e) =>
      this.add(e.message, (e.error as Error | undefined)?.stack),
    );
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason as unknown;
      this.add(
        r instanceof Error ? r.message : String(r),
        r instanceof Error ? r.stack : undefined,
      );
    });
  }
}

export const errorLog = new ErrorLog();
