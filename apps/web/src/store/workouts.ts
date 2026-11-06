// Workout library: built-in sessions plus the ones the rider created or
// imported, kept in localStorage (the data stays local, ADR 0005).

import { BUILTIN_WORKOUTS, type Workout } from '@hrt/workouts';
import { useSyncExternalStore } from 'react';

const KEY = 'hrt.workouts.v1';

function isWorkout(w: unknown): w is Workout {
  if (!w || typeof w !== 'object') return false;
  const o = w as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.name === 'string' && Array.isArray(o.steps);
}

function load(): Workout[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isWorkout) : [];
  } catch {
    return [];
  }
}

let custom: Workout[] = typeof localStorage === 'undefined' ? [] : load();
let all: readonly Workout[] = [...BUILTIN_WORKOUTS, ...custom];
const listeners = new Set<() => void>();

function commit(next: Workout[]) {
  custom = next;
  all = [...BUILTIN_WORKOUTS, ...custom];
  try {
    localStorage.setItem(KEY, JSON.stringify(custom));
  } catch {
    // Storage full or blocked: the library stays in memory for this session.
  }
  for (const l of listeners) l();
}

export const getWorkouts = (): readonly Workout[] => all;
export const findWorkout = (id: string | null | undefined): Workout | null =>
  (id && all.find((w) => w.id === id)) || null;
export const isBuiltin = (id: string) => BUILTIN_WORKOUTS.some((w) => w.id === id);

export function saveWorkout(w: Workout): void {
  if (isBuiltin(w.id)) return;
  const i = custom.findIndex((c) => c.id === w.id);
  commit(i < 0 ? [...custom, w] : custom.map((c) => (c.id === w.id ? w : c)));
}

export function deleteWorkout(id: string): void {
  commit(custom.filter((c) => c.id !== id));
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useWorkouts(): readonly Workout[] {
  return useSyncExternalStore(subscribe, getWorkouts, getWorkouts);
}
