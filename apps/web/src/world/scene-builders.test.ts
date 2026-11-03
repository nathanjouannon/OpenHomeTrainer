import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  collectNearTrees,
  shadowTreeGeometries,
  type TreeBatch,
  treeGeometries,
} from './scene-builders';

/** A batch of trees at the given (x, z) scene positions. */
function batch(kind: TreeBatch['kind'], center: [number, number], at: [number, number][]) {
  const matrices = new Float32Array(at.length * 16);
  at.forEach(([x, z], i) => {
    matrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 5, z, 1], i * 16);
  });
  return {
    kind,
    chunk: 0,
    center: new Vector3(center[0], 0, center[1]),
    matrices,
    colors: new Float32Array(at.length * 3),
    count: at.length,
  } satisfies TreeBatch;
}

describe('collectNearTrees', () => {
  const batches = [
    batch(
      'conifer',
      [0, 0],
      [
        [10, 0],
        [0, 150],
        [300, 0],
      ],
    ),
    batch('broadleaf', [0, 0], [[5, 5]]),
    // Too far for any of its trees to be in reach.
    batch('conifer', [5000, 0], [[4990, 0]]),
  ];

  it('keeps the trees of one kind within the radius', () => {
    const out = new Float32Array(16 * 10);
    expect(collectNearTrees(batches, 'conifer', 0, 0, 200, 1250, out)).toBe(2);
    expect([out[12], out[14]]).toEqual([10, 0]);
    expect([out[16 + 12], out[16 + 14]]).toEqual([0, 150]);
    expect(collectNearTrees(batches, 'broadleaf', 0, 0, 200, 1250, out)).toBe(1);
  });

  it('never writes more than the buffer holds', () => {
    const out = new Float32Array(16);
    expect(collectNearTrees(batches, 'conifer', 0, 0, 1000, 1250, out)).toBe(1);
  });
});

describe('shadowTreeGeometries', () => {
  it('builds light silhouettes of both kinds of tree', () => {
    const shadow = shadowTreeGeometries();
    const full = treeGeometries();
    for (const kind of ['conifer', 'broadleaf'] as const) {
      const n = shadow[kind].getAttribute('position').count;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(full[kind].getAttribute('position').count / 2);
    }
  });
});
