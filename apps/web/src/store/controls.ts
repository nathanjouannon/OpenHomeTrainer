// Control profiles: the built-in default plus the ones the rider made, and
// which one is active. Kept in localStorage (the data stays local, ADR 0005).

import { DEFAULT_PROFILE_ID, defaultProfile, type Profile, parseProfile } from '@hrt/controls';
import { useSyncExternalStore } from 'react';

const KEY = 'hrt.controls.v1';

interface Stored {
  profiles: Profile[];
  activeId: string;
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    const o: unknown = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      const profiles = Array.isArray(r.profiles)
        ? r.profiles
            .map(parseProfile)
            .filter((p): p is Profile => p !== null && p.id !== DEFAULT_PROFILE_ID)
        : [];
      const activeId = typeof r.activeId === 'string' ? r.activeId : DEFAULT_PROFILE_ID;
      return { profiles, activeId };
    }
  } catch {
    // Unreadable storage: start from the default profile.
  }
  return { profiles: [], activeId: DEFAULT_PROFILE_ID };
}

let state: Stored =
  typeof localStorage === 'undefined' ? { profiles: [], activeId: DEFAULT_PROFILE_ID } : load();
const listeners = new Set<() => void>();

export interface ControlsState {
  /** Built-in default first, then the rider's profiles. */
  profiles: readonly Profile[];
  active: Profile;
}

function snapshotOf(s: Stored): ControlsState {
  const profiles = [defaultProfile(), ...s.profiles];
  return {
    profiles,
    active: profiles.find((p) => p.id === s.activeId) ?? (profiles[0] as Profile),
  };
}

let snapshot = snapshotOf(state);

function commit(next: Stored) {
  state = next;
  snapshot = snapshotOf(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: profiles stay in memory for this session.
  }
  for (const l of listeners) l();
}

export const getControls = (): ControlsState => snapshot;
export const isDefaultProfile = (id: string) => id === DEFAULT_PROFILE_ID;

export function setActiveProfile(id: string): void {
  if (snapshot.profiles.some((p) => p.id === id)) commit({ ...state, activeId: id });
}

/** Copies a profile into a new editable one and makes it active. */
export function createProfile(name: string, from: Profile = snapshot.active): Profile {
  const profile: Profile = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Profile',
    bindings: from.bindings.map((b) => ({ ...b })),
  };
  commit({ profiles: [...state.profiles, profile], activeId: profile.id });
  return profile;
}

export function saveProfile(profile: Profile): void {
  if (isDefaultProfile(profile.id)) return;
  commit({
    ...state,
    profiles: state.profiles.map((p) => (p.id === profile.id ? profile : p)),
  });
}

export function deleteProfile(id: string): void {
  if (isDefaultProfile(id)) return;
  commit({
    profiles: state.profiles.filter((p) => p.id !== id),
    activeId: state.activeId === id ? DEFAULT_PROFILE_ID : state.activeId,
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useControls(): ControlsState {
  return useSyncExternalStore(subscribe, getControls, getControls);
}

export const onControlsChange = subscribe;
