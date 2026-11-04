// Sky and haze of the world (lot 2.7):
//   - physical sky (TSL `SkyMesh`, WebGPU and WebGL2) with its clouds;
//   - aerial perspective as a TSL fog node: the distance turns the colours to
//     the haze, the haze is bluer far away and warm towards the sun, and a
//     mist hangs low over the valley (exponential height fog, integrated
//     along the view ray). The world always ends in the haze: a last ramp
//     brings the fog to 1 before the terrain's edge.

import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color, Vector3 } from 'three';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import {
  abs,
  cameraPosition,
  clamp,
  dot,
  exp,
  float,
  fog,
  length,
  max,
  mix,
  positionWorld,
  pow,
  select,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import { FOG_COLOR, SUN_POSITION } from './Lighting';
import type { AtmosphereProfile } from './render-profile';
import { REFLECTED_LAYER } from './Water';
import { realClock, useWorldClock } from './world-clock';

/** The terrain ends beyond this distance (m): the fog is complete before. */
const FOG_COMPLETE_M = [5500, 7500] as const;
/** Haze of the distance: extinction per metre. */
const HAZE_PER_M = 1 / 16_000;
/** Mist of the valley: extinction per metre at the scene's floor, and its fall-off with altitude. */
const MIST_PER_M = 1 / 7000;
const MIST_FALLOFF_PER_M = 1 / 320;

export function WorldSky({ clouds }: { clouds: boolean }) {
  const clock = useWorldClock();
  const sky = useMemo(() => {
    const s = new SkyMesh();
    s.scale.setScalar(8000);
    s.turbidity.value = 5;
    s.rayleigh.value = 1.1;
    s.mieCoefficient.value = 0.004;
    s.mieDirectionalG.value = 0.8;
    s.sunPosition.value.copy(SUN_POSITION);
    s.layers.enable(REFLECTED_LAYER);
    return s;
  }, []);
  useEffect(() => {
    sky.cloudCoverage.value = clouds ? 0.38 : 0;
    sky.cloudDensity.value = 0.5;
    // The clouds drift with the shader's own clock, so only on a real ride:
    // the benchmark's captures must not depend on when they are taken.
    sky.cloudSpeed.value = clock === realClock ? 0.00002 : 0;
  }, [sky, clouds, clock]);
  useEffect(
    () => () => {
      sky.geometry.dispose();
      sky.material.dispose();
    },
    [sky],
  );
  return <primitive object={sky} />;
}

/** The fog node of the scene (replaces the linear fog). */
export function AerialPerspective({ profile }: { profile: AtmosphereProfile }) {
  const scene = useThree((s) => s.scene);
  const node = useMemo(() => createFogNode(profile.heightFog), [profile.heightFog]);
  useEffect(() => {
    scene.fogNode = node;
    return () => {
      scene.fogNode = null;
    };
  }, [scene, node]);
  return null;
}

// biome-ignore lint/suspicious/noExplicitAny: TSL graphs are untyped (see terrain-material.ts)
type N = any;

function createFogNode(heightFog: boolean): N {
  const toPoint: N = positionWorld.sub(cameraPosition);
  const dist: N = length(toPoint);
  const sun = new Vector3().copy(SUN_POSITION).normalize();
  const view: N = toPoint.div(max(dist, 1));
  // Haze: colour of the horizon, bluer far away, warm in the direction of the sun.
  const horizon: N = uniform(new Color(FOG_COLOR));
  const far: N = clamp(dist.div(9000), 0, 1);
  const bluer: N = mix(horizon, vec3(0.6, 0.73, 0.93), far.mul(0.3));
  const sunDir: N = uniform(sun);
  const glow: N = pow(max(dot(view, sunDir), 0), 6).mul(0.4);
  const color: N = mix(bluer, vec3(1.0, 0.86, 0.68), glow);
  let optical: N = dist.mul(HAZE_PER_M);
  if (heightFog) {
    // Mist: density MIST·exp(−b·y), integrated along the ray from the camera to the point.
    const t: N = toPoint.y.mul(MIST_FALLOFF_PER_M);
    const safe: N = select(abs(t).lessThan(1e-4), float(1e-4), t);
    const camera: N = exp(cameraPosition.y.mul(-MIST_FALLOFF_PER_M));
    const average: N = camera.mul(float(1).sub(exp(safe.negate()))).div(safe);
    optical = optical.add(
      dist.mul(MIST_PER_M).mul(average).mul(max(camera, 0)).div(max(camera, 1e-6)),
    );
  }
  const factor: N = max(
    float(1).sub(exp(optical.negate())),
    smoothstep(FOG_COMPLETE_M[0], FOG_COMPLETE_M[1], dist),
  );
  return fog(color, factor);
}
