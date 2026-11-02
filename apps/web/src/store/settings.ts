// Rider profile and app settings, persisted in localStorage (docs/07 §2.1).

import { DEFAULT_PRESET_ID, type DrivetrainPreset } from '@hrt/drivetrain';
import { useSyncExternalStore } from 'react';
import type { PowerSource } from '../ride/ride-session';

export type Language = 'fr' | 'en';
export type Units = 'metric' | 'imperial';
export type Quality = 'low' | 'medium' | 'high';
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
  quality: Quality;
  virtualShifting: boolean;
  drivetrainPreset: DrivetrainPreset['id'];
  powerSource: PowerSource;
  camera: CameraMode;
  hudSize: 'S' | 'M' | 'L' | 'XL';
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
  quality: 'medium',
  virtualShifting: true,
  drivetrainPreset: DEFAULT_PRESET_ID,
  powerSource: 'trainer',
  camera: 'pov',
  hudSize: 'M',
  reduceMotion: false,
});

const KEY = 'hrt.settings.v1';

function load(): Settings {
  const defaults = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<Settings>;
    // Older settings: the first-person camera became the POV camera.
    if (!CAMERA_MODES.includes(saved.camera as CameraMode)) delete saved.camera;
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
