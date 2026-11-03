// Render targets owned by parts of the world (shadow cascades, post-processing
// passes), declared on the scene so that the bench can count them in its GPU
// memory estimate.

import type { Object3D, RenderTarget } from 'three';

type Source = () => readonly RenderTarget[];

const sources = new WeakMap<Object3D, Map<string, Source>>();

/** Declares the render targets of `key`; returns the function that removes them. */
export function registerRenderTargets(scene: Object3D, key: string, source: Source): () => void {
  let map = sources.get(scene);
  if (!map) {
    map = new Map();
    sources.set(scene, map);
  }
  map.set(key, source);
  return () => {
    if (map.get(key) === source) map.delete(key);
  };
}

export const hasRenderTargets = (scene: Object3D, key: string) =>
  sources.get(scene)?.has(key) ?? false;

export function sceneRenderTargets(scene: Object3D): RenderTarget[] {
  const out = new Set<RenderTarget>();
  for (const source of sources.get(scene)?.values() ?? []) {
    for (const rt of source()) out.add(rt);
  }
  return [...out];
}

/**
 * Render targets held by an object, found by walking its own properties (and
 * arrays of them): post-processing nodes keep theirs in private fields.
 */
export function ownRenderTargets(objects: readonly unknown[]): RenderTarget[] {
  const out: RenderTarget[] = [];
  const visit = (v: unknown) => {
    if ((v as { isRenderTarget?: boolean } | null)?.isRenderTarget) out.push(v as RenderTarget);
  };
  for (const o of objects) {
    if (!o || typeof o !== 'object') continue;
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.forEach(visit);
      else visit(v);
    }
  }
  return out;
}
