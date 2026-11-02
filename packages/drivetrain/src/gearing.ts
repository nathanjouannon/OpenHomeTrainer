// Virtual drivetrain (docs/15-vitesses-virtuelles-et-commandes.md §3).

export interface Gear {
  /** Virtual ratio chainring / cog. */
  ratio: number;
  chainring?: number;
  cog?: number;
}

export type DrivetrainConfig =
  | {
      mode: 'double';
      chainrings: number[];
      cassette: number[];
      wheelCircumferenceM: number;
    }
  | {
      /** Sorted list of ratios: each click gives a regular step. */
      mode: 'sequential';
      chainrings: number[];
      cassette: number[];
      /** Number of gears; ratios are spread geometrically over the range of chainrings × cassette. */
      gearCount: number;
      wheelCircumferenceM: number;
    };

export interface DrivetrainPreset {
  id: 'sequential-24' | 'road-2x12' | 'compact' | 'gravel-1x12';
  name: { fr: string; en: string };
  config: DrivetrainConfig;
}

const ROAD_CASSETTE = [11, 12, 13, 14, 15, 17, 19, 21, 24, 27, 30, 34];
const WHEEL_700x25_M = 2.105;

export const DRIVETRAIN_PRESETS: readonly DrivetrainPreset[] = [
  {
    id: 'sequential-24',
    name: { fr: 'Séquentiel 24', en: 'Sequential 24' },
    config: {
      mode: 'sequential',
      chainrings: [50, 34],
      cassette: ROAD_CASSETTE,
      gearCount: 24,
      wheelCircumferenceM: WHEEL_700x25_M,
    },
  },
  {
    id: 'road-2x12',
    name: { fr: 'Route 2×12 (50/34 × 11–34)', en: 'Road 2×12 (50/34 × 11–34)' },
    config: {
      mode: 'double',
      chainrings: [34, 50],
      cassette: ROAD_CASSETTE,
      wheelCircumferenceM: WHEEL_700x25_M,
    },
  },
  {
    id: 'compact',
    name: { fr: 'Compacte (50/34 × 11–28)', en: 'Compact (50/34 × 11–28)' },
    config: {
      mode: 'double',
      chainrings: [34, 50],
      cassette: [11, 12, 13, 14, 15, 17, 19, 21, 23, 25, 28],
      wheelCircumferenceM: WHEEL_700x25_M,
    },
  },
  {
    id: 'gravel-1x12',
    name: { fr: 'Gravel 1×12 (40 × 10–44)', en: 'Gravel 1×12 (40 × 10–44)' },
    config: {
      mode: 'double',
      chainrings: [40],
      cassette: [10, 11, 13, 15, 17, 19, 21, 24, 28, 32, 38, 44],
      wheelCircumferenceM: WHEEL_700x25_M,
    },
  },
];

export const DEFAULT_PRESET_ID: DrivetrainPreset['id'] = 'sequential-24';

export function presetById(id: string): DrivetrainPreset {
  const found = DRIVETRAIN_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown drivetrain preset: ${id}`);
  return found;
}

/** Gears ordered from the easiest (smallest ratio) to the hardest. */
export function buildGears(config: DrivetrainConfig): Gear[] {
  if (config.chainrings.length === 0 || config.cassette.length === 0) {
    throw new Error('A drivetrain needs at least one chainring and one cog');
  }
  const ratios = config.chainrings.flatMap((c) => config.cassette.map((k) => c / k));
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  if (config.mode === 'sequential') {
    const n = Math.max(2, Math.round(config.gearCount));
    const step = (max / min) ** (1 / (n - 1));
    return Array.from({ length: n }, (_, i) => ({ ratio: min * step ** i }));
  }
  // Double: every combination, sorted, and nearly identical ratios (< 1.5 %) merged.
  const gears = config.chainrings
    .flatMap((chainring) =>
      config.cassette.map((cog) => ({ ratio: chainring / cog, chainring, cog })),
    )
    .sort((a, b) => a.ratio - b.ratio);
  const out: Gear[] = [];
  for (const g of gears) {
    const last = out.at(-1);
    if (last && g.ratio / last.ratio < 1.015) continue;
    out.push(g);
  }
  return out;
}

/** Speed imposed by a ratio at a cadence, in m/s (informative: the game speed comes from power). */
export const gearSpeedMs = (cadenceRpm: number, ratio: number, wheelCircumferenceM: number) =>
  (cadenceRpm / 60) * ratio * wheelCircumferenceM;

/** Index of the gear whose ratio is closest to `ratio` (log scale). */
export function closestGearIndex(gears: readonly Gear[], ratio: number): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  gears.forEach((g, i) => {
    const dist = Math.abs(Math.log(g.ratio / ratio));
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

/** Current gear of the virtual drivetrain. */
export class Gearbox {
  readonly gears: readonly Gear[];
  private _index: number;
  readonly neutralIndex: number;

  constructor(
    readonly config: DrivetrainConfig,
    startIndex?: number,
  ) {
    this.gears = buildGears(config);
    // Neutral gear = geometric middle of the range.
    const first = this.gears[0] as Gear;
    const last = this.gears.at(-1) as Gear;
    this.neutralIndex = closestGearIndex(this.gears, Math.sqrt(first.ratio * last.ratio));
    this._index = this.clampIndex(startIndex ?? this.neutralIndex);
  }

  get index() {
    return this._index;
  }

  get count() {
    return this.gears.length;
  }

  get gear(): Gear {
    return this.gears[this._index] as Gear;
  }

  get neutralRatio(): number {
    return (this.gears[this.neutralIndex] as Gear).ratio;
  }

  private clampIndex(i: number) {
    return Math.min(this.gears.length - 1, Math.max(0, Math.round(i)));
  }

  /** Returns true if the gear changed. */
  setIndex(i: number): boolean {
    const next = this.clampIndex(i);
    const changed = next !== this._index;
    this._index = next;
    return changed;
  }

  /** Harder gear. */
  shiftUp(): boolean {
    return this.setIndex(this._index + 1);
  }

  /** Easier gear. */
  shiftDown(): boolean {
    return this.setIndex(this._index - 1);
  }

  reset(): boolean {
    return this.setIndex(this.neutralIndex);
  }

  /** "14/24", or "50×17" when the gear has a chainring and a cog. */
  label(): string {
    const g = this.gear;
    if (g.chainring !== undefined && g.cog !== undefined) return `${g.chainring}×${g.cog}`;
    return `${this._index + 1}/${this.gears.length}`;
  }
}
