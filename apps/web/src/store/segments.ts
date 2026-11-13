// Personal records of timed segments (lot 3.5), kept in localStorage: the data
// stays local (ADR 0005). Keyed by route id and segment id, so a loop and its
// reverse direction keep separate records.

const KEY = 'hrt.segments.v1';
const KEEP_TIMES = 10;

export interface SegmentRecord {
  /** Personal best, s. */
  bestS: number;
  /** Epoch ms of the best effort. */
  bestAt: number;
  /** Number of efforts. */
  count: number;
  /** The latest efforts, most recent last, s. */
  last: number[];
}

type Records = Record<string, SegmentRecord>;

const keyOf = (routeId: string, segmentId: string) => `${routeId}/${segmentId}`;

function isRecord(r: unknown): r is SegmentRecord {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  return typeof o.bestS === 'number' && typeof o.count === 'number' && Array.isArray(o.last);
}

function load(): Records {
  try {
    const raw = localStorage.getItem(KEY);
    const obj: unknown = raw ? JSON.parse(raw) : {};
    if (!obj || typeof obj !== 'object') return {};
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => isRecord(v)));
  } catch {
    return {};
  }
}

let records: Records = typeof localStorage === 'undefined' ? {} : load();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // Storage full or blocked: the records stay in memory for this session.
  }
}

export function getSegmentRecord(routeId: string, segmentId: string): SegmentRecord | null {
  return records[keyOf(routeId, segmentId)] ?? null;
}

export function getSegmentBest(routeId: string, segmentId: string): number | null {
  return getSegmentRecord(routeId, segmentId)?.bestS ?? null;
}

/** Records an effort; returns true when it is a new personal best. */
export function recordSegmentEffort(
  routeId: string,
  segmentId: string,
  durationS: number,
  at: number = Date.now(),
): boolean {
  const key = keyOf(routeId, segmentId);
  const prev = records[key];
  const isPb = !prev || durationS < prev.bestS;
  records = {
    ...records,
    [key]: {
      bestS: isPb ? durationS : (prev as SegmentRecord).bestS,
      bestAt: isPb ? at : (prev as SegmentRecord).bestAt,
      count: (prev?.count ?? 0) + 1,
      last: [...(prev?.last ?? []), durationS].slice(-KEEP_TIMES),
    },
  };
  persist();
  return isPb;
}
