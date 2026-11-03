// Result files of a bench run: bench-results/<label>/results.json + captures.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  BenchEnvironment,
  BenchMetrics,
  BenchQuality,
  BenchViewpoint,
} from '../../../apps/web/src/bench/protocol';

export type { BenchEnvironment, BenchMetrics, BenchQuality, BenchViewpoint };

export const RESULTS_DIR = resolve(import.meta.dirname, '../../../bench-results');

export interface BenchRun {
  label: string;
  createdAt: string;
  git: { commit: string; branch: string; dirty: boolean };
  options: { durationS: number; vsync: boolean; headless: boolean };
  environment: BenchEnvironment;
  viewpoints: BenchViewpoint[];
  metrics: BenchMetrics[];
}

export const runDir = (label: string) => join(RESULTS_DIR, label);
export const captureName = (viewpoint: string, quality: BenchQuality) =>
  `${viewpoint}@${quality}.jpg`;

export function readRun(label: string): BenchRun {
  const file = join(runDir(label), 'results.json');
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as BenchRun;
  } catch {
    throw new Error(`No bench run "${label}" (${file} not found). Run \`pnpm bench\` first.`);
  }
}

/**
 * Budgets of docs/05 §4 (reference config, 1080p). The resource budgets are
 * set for the medium quality (low must fit too); high only has to keep 30 FPS.
 */
export const BUDGETS = {
  drawCalls: 300,
  triangles: 2_000_000,
  gpuMemoryMB: 1536,
  /** Minimum average FPS per quality (vsync off, so it measures the headroom). */
  minFps: { low: 60, medium: 60, high: 30 } as Record<BenchQuality, number>,
  resourceQualities: ['low', 'medium'] as readonly BenchQuality[],
};

export type BudgetKey = 'fps' | 'drawCalls' | 'triangles' | 'gpuMemory';

/** Budgets that a measurement exceeds. */
export function overBudget(m: BenchMetrics): BudgetKey[] {
  const out: BudgetKey[] = [];
  if (m.avgFps < BUDGETS.minFps[m.quality]) out.push('fps');
  if (!BUDGETS.resourceQualities.includes(m.quality)) return out;
  if (m.drawCalls >= BUDGETS.drawCalls) out.push('drawCalls');
  if (m.triangles >= BUDGETS.triangles) out.push('triangles');
  if (m.gpuMemoryMB.total >= BUDGETS.gpuMemoryMB) out.push('gpuMemory');
  return out;
}

/** Label usable as a folder name. */
export function sanitizeLabel(label: string): string {
  const clean = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!clean || clean === '.' || clean === '..') throw new Error(`Invalid label "${label}"`);
  return clean;
}
