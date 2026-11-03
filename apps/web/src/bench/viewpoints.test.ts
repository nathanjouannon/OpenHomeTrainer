import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BENCH_VIEWPOINTS, BENCH_WORLD_ID } from './viewpoints';

const manifest = JSON.parse(
  readFileSync(
    new URL(`../../../../content/worlds/${BENCH_WORLD_ID}/world.json`, import.meta.url),
    'utf8',
  ),
) as { loops: { id: string }[] };

describe('bench viewpoints', () => {
  it('have unique, file-safe ids', () => {
    const ids = BENCH_VIEWPOINTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('cover every loop and every kind of scene', () => {
    const loops = manifest.loops.map((l) => l.id);
    for (const v of BENCH_VIEWPOINTS) expect(loops).toContain(v.routeId);
    expect(new Set(BENCH_VIEWPOINTS.map((v) => v.routeId))).toEqual(new Set(loops));
    expect(new Set(BENCH_VIEWPOINTS.map((v) => v.kind))).toEqual(
      new Set(['open-road', 'forest', 'village', 'climb', 'summit', 'lake']),
    );
    for (const v of BENCH_VIEWPOINTS) expect(v.atM).toBeGreaterThanOrEqual(0);
  });
});
