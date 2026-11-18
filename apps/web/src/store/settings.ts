// Rider profile and app settings, persisted in localStorage (docs/07 §2.1).

import {
  type CassetteSpeeds,
  type CustomDrivetrain,
  DEFAULT_CASSETTE_SPEEDS,
  isCassetteSpeeds,
  MAX_CHAINRINGS,
  MAX_COGS,
  parseTeeth,
} from '@hrt/drivetrain';
import { useSyncExternalStore } from 'react';
import { type ColorMode, isColorMode } from '../hud/colors';
import { DEFAULT_HUD_TILES, type HudTileId, parseHudTiles } from '../hud/tiles';
import type { PowerSource, ShiftingStrategy } from '../ride/ride-session';
import { isRendererPreference, type RendererPreference } from '../world/renderer-options';

export type Language = 'fr' | 'en';
export type Units = 'metric' | 'imperial';
export type Quality = 'low' | 'medium' | 'high';
/** `auto` renders at medium and lowers resolution and grass when the FPS drops (lot 2.9). */
export type QualitySetting = Quality | 'auto';
export const QUALITY_SETTINGS: readonly QualitySetting[] = ['auto', 'low', 'medium', 'high'];

/** The preset the world is built and drawn with for a setting. */
export const resolveQuality = (q: QualitySetting): Quality => (q === 'auto' ? 'medium' : q);
export type BikeType = 'road' | 'aero' | 'gravel' | 'mtb';

export interface Settings {
  profile: {
    weightKg: number;
    heightCm: number;
    ftpW: number | null;
    maxHeartRateBpm: number | null;
    bikeType: BikeType;
    bikeMassKg: number;
  };
  language: Language;
  units: Units;
  /** Share of the real grade felt on the trainer, 0..1. */
  difficulty: number;
  quality: QualitySetting;
  /** 3D backend: WebGPU when available (auto) or always WebGL2. */
  renderer: RendererPreference;
  virtualShifting: boolean;
  /** `ladder`: speeds 1 to 24 with no chainring (like Zwift); `chainrings`: chainrings and cassette. */
  gearMode: GearMode;
  /** Number of cogs of the virtual cassette (50/34 chainrings). */
  cassetteSpeeds: CassetteSpeeds;
  /** The rider's own chainrings and cassette; null: the 50/34 preset above. */
  customDrivetrain: CustomDrivetrain | null;
  /** Chainring and cog really on the trainer (a Zwift Cog is one fixed cog), teeth; null: unknown. */
  physicalChainring: number | null;
  physicalCog: number | null;
  /** `grade` (S1, default) or `realistic` (S3, experimental ERG driven by the gear). */
  shiftingStrategy: ShiftingStrategy;
  powerSource: PowerSource;
  camera: CameraMode;
  hudSize: 'S' | 'M' | 'L' | 'XL';
  /** Shown HUD tiles, in display order (lot 3.12). */
  hudTiles: HudTileId[];
  /** Colour-blind palette of grade bands and power zones. */
  colorMode: ColorMode;
  reduceMotion: boolean;
}

export type CameraMode = 'pov' | 'chase' | 'side' | 'drone';
export const CAMERA_MODES: CameraMode[] = ['pov', 'chase', 'side', 'drone'];

/** Drag area by bike type and riding position (docs/04 §2). */
export const CDA_BY_BIKE: Record<BikeType, number> = {
  road: 0.32,
  aero: 0.27,
  gravel: 0.35,
  mtb: 0.4,
};

const browserLanguage = (): Language =>
  typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr')
    ? 'fr'
    : 'en';

export const defaultSettings = (): Settings => ({
  profile: {
    weightKg: 75,
    heightCm: 178,
    ftpW: 200,
    maxHeartRateBpm: null,
    bikeType: 'road',
    bikeMassKg: 8,
  },
  language: browserLanguage(),
  units: 'metric',
  difficulty: 0.5,
  quality: 'auto',
  renderer: 'auto',
  virtualShifting: true,
  gearMode: 'chainrings',
  cassetteSpeeds: DEFAULT_CASSETTE_SPEEDS,
  customDrivetrain: null,
  physicalChainring: null,
  physicalCog: null,
  shiftingStrategy: 'grade',
  powerSource: 'trainer',
  camera: 'pov',
  hudSize: 'M',
  hudTiles: [...DEFAULT_HUD_TILES],
  colorMode: 'default',
  reduceMotion: false,
});

export type GearMode = 'chainrings' | 'ladder';

const KEY = 'hrt.settings.v1';

/** A saved custom drivetrain that still passes the same checks as the settings form. */
function isCustomDrivetrain(v: unknown): v is CustomDrivetrain | null {
  if (v === null) return true;
  const c = v as Partial<CustomDrivetrain> | undefined;
  return (
    !!c &&
    Array.isArray(c.chainrings) &&
    Array.isArray(c.cassette) &&
    parseTeeth(c.chainrings.join(' '), MAX_CHAINRINGS) !== null &&
    parseTeeth(c.cassette.join(' '), MAX_COGS) !== null
  );
}

function load(): Settings {
  const defaults = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<Settings>;
    // Older settings: the first-person camera became the POV camera.
    if (!CAMERA_MODES.includes(saved.camera as CameraMode)) delete saved.camera;
    // Older settings: drivetrain presets became a cassette size.
    delete (saved as Record<string, unknown>).drivetrainPreset;
    if (saved.gearMode !== 'chainrings' && saved.gearMode !== 'ladder') delete saved.gearMode;
    if (!isCassetteSpeeds(saved.cassetteSpeeds)) delete saved.cassetteSpeeds;
    if (!isCustomDrivetrain(saved.customDrivetrain)) delete saved.customDrivetrain;
    if (saved.shiftingStrategy !== 'grade' && saved.shiftingStrategy !== 'realistic') {
      delete saved.shiftingStrategy;
    }
    for (const key of ['physicalChainring', 'physicalCog'] as const) {
      const v = saved[key];
      if (v !== null && !(Number.isInteger(v) && (v as number) > 0)) delete saved[key];
    }
    if (!QUALITY_SETTINGS.includes(saved.quality as QualitySetting)) delete saved.quality;
    if (!isRendererPreference(saved.renderer)) delete saved.renderer;
    const tiles = parseHudTiles(saved.hudTiles);
    if (tiles) saved.hudTiles = tiles;
    else delete saved.hudTiles;
    if (!isColorMode(saved.colorMode)) delete saved.colorMode;
    return { ...defaults, ...saved, profile: { ...defaults.profile, ...saved.profile } };
  } catch {
    return defaults;
  }
}

let current: Settings = typeof localStorage === 'undefined' ? defaultSettings() : load();
const listeners = new Set<() => void>();

export const getSettings = () => current;

export function updateSettings(
  patch: Partial<Settings> | ((s: Settings) => Partial<Settings>),
): void {
  const p = typeof patch === 'function' ? patch(current) : patch;
  current = { ...current, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage full or blocked: settings stay in memory for this session.
  }
  for (const l of listeners) l();
}

export function updateProfile(patch: Partial<Settings['profile']>): void {
  updateSettings((s) => ({ profile: { ...s.profile, ...patch } }));
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
