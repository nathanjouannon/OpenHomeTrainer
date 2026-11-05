// Roadside furniture (lot 2.5): guardrails, low stone walls, field fences and
// delineator posts. Each kind is one InstancedMesh holding only the modules
// near the camera (refreshed a few times per second), plus a shadow-only copy
// of the nearest ones: the whole world holds tens of thousands of modules.

import type { Route } from '@hrt/route-engine';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  type BufferGeometry,
  DoubleSide,
  type InstancedMesh,
  type Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { NEAR_SHADOWS_UPDATE_S } from './NearShadows';
import { delineatorGeometry } from './prop-builders';
import { SHADOW_ONLY_LAYER } from './Rider';
import { createMasonryMaterial } from './road-material';
import { type RoadsideLayout, type RunKind, runMatrices } from './roadside';
import { fenceGeometry, guardrailGeometry, wallGeometry } from './roadside-builders';
import { collectNear, toScene } from './scene-builders';
import type { TextureArrays } from './texture-arrays';
import { useWorldClock } from './world-clock';
import type { Terrain } from './world-data';

/** Modules are drawn up to this distance from the camera (m). */
export const ROADSIDE_VIEW_M = 900;
/** Most modules of one kind drawn at once. */
const MAX_VISIBLE = 4096;

export type RoadsideInstances = Record<RunKind | 'delineator', Float32Array>;

/** Instance matrices of every roadside module of the world, by kind. */
export function roadsideInstances(
  layout: RoadsideLayout,
  routes: ReadonlyMap<string, Route>,
  terrain: Terrain,
  base: number,
): RoadsideInstances {
  const parts: Record<RunKind, Float32Array[]> = { guardrail: [], wall: [], fence: [] };
  for (const run of layout.runs) {
    const route = routes.get(run.routeId);
    if (route) parts[run.kind].push(runMatrices(route, run, terrain, base));
  }
  const concat = (list: Float32Array[]) => {
    const out = new Float32Array(list.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of list) {
      out.set(a, o);
      o += a.length;
    }
    return out;
  };
  const posts = new Float32Array(layout.delineators.length * 16);
  const o = new Object3D();
  layout.delineators.forEach((p, i) => {
    toScene(p.x, p.y, p.z, base, o.position);
    o.rotation.set(0, Math.PI - p.yaw, 0);
    o.updateMatrix();
    o.matrix.toArray(posts, i * 16);
  });
  return {
    guardrail: concat(parts.guardrail),
    wall: concat(parts.wall),
    fence: concat(parts.fence),
    delineator: posts,
  };
}

const shadowMaterial = new MeshBasicMaterial();

/**
 * The instances of `matrices` (column-major, 16 floats each) within
 * `radiusM` of the camera, and a shadow-only copy of those within
 * `shadowRadiusM` (none when null).
 */
function NearInstances({
  matrices,
  geometry,
  material,
  radiusM,
  shadowRadiusM,
}: {
  matrices: Float32Array;
  geometry: BufferGeometry;
  material: Material;
  radiusM: number;
  shadowRadiusM: number | null;
}) {
  const total = matrices.length / 16;
  const capacity = Math.max(1, Math.min(total, MAX_VISIBLE));
  const mesh = useRef<InstancedMesh | null>(null);
  const shadow = useRef<InstancedMesh | null>(null);
  const camera = useThree((s) => s.camera);
  const clock = useWorldClock();
  // Filled on the first frame.
  const timer = useRef(NEAR_SHADOWS_UPDATE_S);

  useFrame((_, delta) => {
    timer.current += clock.step(delta);
    if (timer.current < NEAR_SHADOWS_UPDATE_S) return;
    timer.current = 0;
    const { x, z } = camera.position;
    for (const [m, r] of [
      [mesh.current, radiusM],
      [shadow.current, shadowRadiusM],
    ] as const) {
      if (!m || r === null) continue;
      m.count = collectNear(matrices, total, x, z, r, m.instanceMatrix.array as Float32Array);
      m.instanceMatrix.needsUpdate = true;
      // No draw call at all for an empty batch.
      m.visible = m.count > 0;
    }
  });

  // Set up once per mesh, never in an inline `ref`: React calls an inline ref
  // again on every render, which emptied the batch until the next refill and
  // made the whole kind blink (feedback of 2026-11-03, docs/16 §3).
  const hasShadow = shadowRadiusM !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the meshes are rebuilt when these change
  useLayoutEffect(() => {
    for (const m of [mesh.current, shadow.current]) {
      if (!m) continue;
      m.count = 0;
      m.visible = false;
    }
    shadow.current?.layers.set(SHADOW_ONLY_LAYER);
    // Filled on the next frame.
    timer.current = NEAR_SHADOWS_UPDATE_S;
  }, [geometry, material, capacity, hasShadow]);

  if (total === 0) return null;
  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[geometry, material, capacity]}
        frustumCulled={false}
        receiveShadow
      />
      {hasShadow && (
        <instancedMesh
          ref={shadow}
          args={[geometry, shadowMaterial, capacity]}
          frustumCulled={false}
          castShadow
        />
      )}
    </>
  );
}

export function RoadFurniture({
  instances,
  textures,
  shadowRadiusM,
}: {
  instances: RoadsideInstances;
  /** Road texture arrays (masonry), null without the CC0 assets. */
  textures: TextureArrays | null;
  shadowRadiusM: number | null;
}) {
  const geometries = useMemo(
    () => ({
      guardrail: guardrailGeometry(),
      wall: wallGeometry(),
      fence: fenceGeometry(),
      delineator: delineatorGeometry(),
    }),
    [],
  );
  const materials = useMemo(
    () => ({
      // Galvanised steel: the environment map gives it its sheen.
      guardrail: new MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.6,
        roughness: 0.38,
        side: DoubleSide,
      }),
      wall: createMasonryMaterial(textures),
      fence: new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
      delineator: new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    }),
    [textures],
  );
  useEffect(
    () => () => {
      for (const m of Object.values(materials)) m.dispose();
    },
    [materials],
  );
  useEffect(
    () => () => {
      for (const g of Object.values(geometries)) g.dispose();
    },
    [geometries],
  );
  return (
    <>
      {(['guardrail', 'wall', 'fence', 'delineator'] as const).map((kind) => (
        <NearInstances
          key={kind}
          matrices={instances[kind]}
          geometry={geometries[kind]}
          material={materials[kind]}
          radiusM={ROADSIDE_VIEW_M}
          shadowRadiusM={shadowRadiusM}
        />
      ))}
    </>
  );
}
