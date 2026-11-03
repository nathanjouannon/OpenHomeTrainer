// Shadow-only copies of the instances of an InstancedMesh near the camera.
// A world-wide InstancedMesh (lamps, parked cars, roadside posts) has a
// bounding sphere as large as the world: every shadow cascade would draw all
// its instances. The copy holds only the ones within reach of the cascades.

import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useMemo, useRef } from 'react';
import { type BufferGeometry, type InstancedMesh, MeshBasicMaterial } from 'three';
import { SHADOW_ONLY_LAYER } from './Rider';
import { collectNear } from './scene-builders';
import { useWorldClock } from './world-clock';

export const NEAR_SHADOWS_UPDATE_S = 0.4;
/** Shadows reach a little beyond the last cascade (long shadows of tall objects). */
export const NEAR_SHADOWS_MARGIN_M = 60;

const material = new MeshBasicMaterial();

export function NearShadows({
  source,
  geometry,
  radiusM,
  max,
}: {
  source: RefObject<InstancedMesh | null>;
  geometry: BufferGeometry;
  radiusM: number;
  max: number;
}) {
  const mesh = useRef<InstancedMesh | null>(null);
  const camera = useThree((s) => s.camera);
  const clock = useWorldClock();
  // Filled on the first frame.
  const timer = useRef(NEAR_SHADOWS_UPDATE_S);
  const capacity = useMemo(() => Math.max(1, max), [max]);

  useFrame((_, delta) => {
    timer.current += clock.step(delta);
    if (timer.current < NEAR_SHADOWS_UPDATE_S) return;
    timer.current = 0;
    const src = source.current;
    const m = mesh.current;
    if (!src || !m) return;
    const out = m.instanceMatrix.array as Float32Array;
    const matrices = src.instanceMatrix.array as Float32Array;
    const { x, z } = camera.position;
    m.count = collectNear(matrices, src.count, x, z, radiusM, out);
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={(m) => {
        mesh.current = m;
        if (m) {
          m.count = 0;
          m.layers.set(SHADOW_ONLY_LAYER);
        }
      }}
      args={[geometry, material, capacity]}
      frustumCulled={false}
      castShadow
    />
  );
}
