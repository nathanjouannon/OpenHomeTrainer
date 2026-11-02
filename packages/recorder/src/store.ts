import type { RideHeader, RideSample } from './types';

/** Samples are stored by chunks of 60 (one row per minute). */
export const SAMPLES_PER_CHUNK = 60;
export const chunkOf = (t: number) => Math.floor((t - 1) / SAMPLES_PER_CHUNK);

export interface RideStore {
  putHeader(header: RideHeader): Promise<void>;
  /** Replaces a chunk (a partial chunk is rewritten until it is full). */
  putChunk(rideId: string, chunk: number, samples: readonly RideSample[]): Promise<void>;
  getHeader(id: string): Promise<RideHeader | null>;
  /** Most recent first. */
  listHeaders(): Promise<RideHeader[]>;
  getSamples(id: string): Promise<RideSample[]>;
  deleteRide(id: string): Promise<void>;
}

/**
 * Incremental saving: call `flush` regularly (e.g. every 10 s) and at the end;
 * only the chunks touched since the last flush are written.
 */
export class RideSaver {
  private dirtyFrom = 1;

  constructor(
    private readonly store: RideStore,
    private readonly rideId: string,
  ) {}

  async flush(header: RideHeader, samples: readonly RideSample[]): Promise<void> {
    const last = samples.at(-1);
    if (last && last.t >= this.dirtyFrom) {
      for (let c = chunkOf(this.dirtyFrom); c <= chunkOf(last.t); c++) {
        const from = c * SAMPLES_PER_CHUNK;
        await this.store.putChunk(this.rideId, c, samples.slice(from, from + SAMPLES_PER_CHUNK));
      }
      // The last chunk may be partial: it will be rewritten next time.
      this.dirtyFrom = chunkOf(last.t) * SAMPLES_PER_CHUNK + 1;
    }
    await this.store.putHeader(header);
  }
}

export class MemoryRideStore implements RideStore {
  private readonly headers = new Map<string, RideHeader>();
  private readonly chunks = new Map<string, Map<number, RideSample[]>>();

  async putHeader(header: RideHeader) {
    this.headers.set(header.id, structuredClone(header));
  }

  async putChunk(rideId: string, chunk: number, samples: readonly RideSample[]) {
    const map = this.chunks.get(rideId) ?? new Map<number, RideSample[]>();
    map.set(chunk, structuredClone([...samples]));
    this.chunks.set(rideId, map);
  }

  async getHeader(id: string) {
    const h = this.headers.get(id);
    return h ? structuredClone(h) : null;
  }

  async listHeaders() {
    return [...this.headers.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((h) => structuredClone(h));
  }

  async getSamples(id: string) {
    const map = this.chunks.get(id);
    if (!map) return [];
    return [...map.entries()].sort(([a], [b]) => a - b).flatMap(([, s]) => structuredClone(s));
  }

  async deleteRide(id: string) {
    this.headers.delete(id);
    this.chunks.delete(id);
  }
}

const DB_NAME = 'hrt';
const DB_VERSION = 1;
const RIDES = 'rides';
const SAMPLES = 'ride_samples';

const promisify = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

interface ChunkRow {
  rideId: string;
  chunk: number;
  samples: RideSample[];
}

/** IndexedDB store (local-first, docs/07 §2.1). */
export class IdbRideStore implements RideStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = this.factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(RIDES)) {
          db.createObjectStore(RIDES, { keyPath: 'id' }).createIndex('startedAt', 'startedAt');
        }
        if (!db.objectStoreNames.contains(SAMPLES)) {
          db.createObjectStore(SAMPLES, { keyPath: ['rideId', 'chunk'] });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async putHeader(header: RideHeader) {
    const tx = (await this.db()).transaction(RIDES, 'readwrite');
    tx.objectStore(RIDES).put(header);
    await done(tx);
  }

  async putChunk(rideId: string, chunk: number, samples: readonly RideSample[]) {
    const tx = (await this.db()).transaction(SAMPLES, 'readwrite');
    const row: ChunkRow = { rideId, chunk, samples: [...samples] };
    tx.objectStore(SAMPLES).put(row);
    await done(tx);
  }

  async getHeader(id: string) {
    const tx = (await this.db()).transaction(RIDES, 'readonly');
    return ((await promisify(tx.objectStore(RIDES).get(id))) as RideHeader | undefined) ?? null;
  }

  async listHeaders() {
    const tx = (await this.db()).transaction(RIDES, 'readonly');
    const all = (await promisify(tx.objectStore(RIDES).getAll())) as RideHeader[];
    return all.sort((a, b) => b.startedAt - a.startedAt);
  }

  async getSamples(id: string) {
    const tx = (await this.db()).transaction(SAMPLES, 'readonly');
    const range = IDBKeyRange.bound([id, -1], [id, Number.MAX_SAFE_INTEGER]);
    const rows = (await promisify(tx.objectStore(SAMPLES).getAll(range))) as ChunkRow[];
    return rows.sort((a, b) => a.chunk - b.chunk).flatMap((r) => r.samples);
  }

  async deleteRide(id: string) {
    const tx = (await this.db()).transaction([RIDES, SAMPLES], 'readwrite');
    tx.objectStore(RIDES).delete(id);
    tx.objectStore(SAMPLES).delete(IDBKeyRange.bound([id, -1], [id, Number.MAX_SAFE_INTEGER]));
    await done(tx);
  }
}
