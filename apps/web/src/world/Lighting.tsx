// Sun, sky light and tone mapping of the world (lot 2.2): a directional sun
// with cascaded shadow maps near the camera, ambient light and reflections
// from a CC0 HDRI (its own sun clipped out), AgX tone mapping.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AgXToneMapping, DirectionalLight, type PerspectiveCamera, Vector3 } from 'three';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import type { EnvironmentMap } from './assets';
import { SHADOW_ONLY_LAYER } from './Rider';
import type { ShadowProfile } from './render-profile';
import { registerRenderTargets } from './render-targets';

/** Where the sun is (scene frame, from the origin): east-north-east, 33° high. */
export const SUN_POSITION = new Vector3(600, 700, -900);
const SUN_COLOR = '#fff1dc';
const SUN_INTENSITY = 3.2;
/** Ambient light and reflections from the environment map. */
const ENVIRONMENT_INTENSITY = 0.9;
const EXPOSURE = 1.05;
/** Casters up to this far behind the cascades (towards the sun) still cast shadows. */
const SHADOW_LIGHT_MARGIN_M = 150;

/** Fog and sky horizon colour, matched to the sky shader near the horizon. */
export const FOG_COLOR = '#bcd0e3';

/**
 * Rotation (around Y) of the environment map that brings its sun in the
 * direction of the scene's sun, so that the brighter side of its sky lights
 * the same side of the objects. Node materials sample the map at Rᵀ·d, and a
 * rotation of θ around Y turns the azimuth atan2(z, x) of a direction by −θ:
 * Rᵀ·sun lands on the map's sun when θ = map azimuth − scene azimuth.
 */
export function environmentRotationY(sunAzimuthRad: number, sunPosition = SUN_POSITION): number {
  return sunAzimuthRad - Math.atan2(sunPosition.z, sunPosition.x);
}

interface Sun {
  light: DirectionalLight;
  csm: CSMShadowNode | null;
}

function createSun(shadows: ShadowProfile | null): Sun {
  const light = new DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  light.position.copy(SUN_POSITION);
  light.target.position.set(0, 0, 0);
  if (!shadows) return { light, csm: null };
  light.castShadow = true;
  const shadow = light.shadow;
  shadow.mapSize.set(shadows.mapSize, shadows.mapSize);
  shadow.camera.near = 1;
  shadow.camera.far = SHADOW_LIGHT_MARGIN_M + shadows.maxFarM * 3;
  shadow.bias = -0.0004;
  shadow.normalBias = 0.04;
  // Shadow silhouettes (the rider) are only seen by the shadow cameras.
  shadow.camera.layers.enable(SHADOW_ONLY_LAYER);
  const csm = new CSMShadowNode(light, {
    cascades: shadows.cascades,
    maxFar: shadows.maxFarM,
    mode: 'practical',
    lightMargin: SHADOW_LIGHT_MARGIN_M,
  });
  csm.fade = true;
  shadow.shadowNode = csm;
  return { light, csm };
}

export function Lighting({
  shadows,
  environment,
}: {
  shadows: ShadowProfile | null;
  environment: EnvironmentMap | null;
}) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const sun = useMemo(() => createSun(shadows), [shadows]);
  const projection = useRef({ fov: 0, aspect: 0 });

  useLayoutEffect(() => {
    gl.toneMapping = AgXToneMapping;
    gl.toneMappingExposure = EXPOSURE;
  }, [gl]);

  useLayoutEffect(() => {
    if (!environment) return;
    scene.environment = environment.texture;
    scene.environmentIntensity = ENVIRONMENT_INTENSITY;
    scene.environmentRotation.set(0, environmentRotationY(environment.sun.azimuthRad), 0);
    return () => {
      scene.environment = null;
    };
  }, [scene, environment]);

  // Shadow maps of the cascades, for the GPU memory estimate of the bench.
  useLayoutEffect(
    () =>
      registerRenderTargets(scene, 'shadows', () =>
        (sun.csm?.lights ?? []).flatMap((l) => (l.shadow?.map ? [l.shadow.map] : [])),
      ),
    [scene, sun],
  );

  useEffect(
    () => () => {
      sun.csm?.dispose();
      sun.light.dispose();
    },
    [sun],
  );

  // The cascades are cut along the camera frustum: recompute them when the
  // projection changes (the POV camera has a wider field of view).
  useFrame(({ camera }) => {
    const csm = sun.csm;
    if (!csm?.camera) return;
    const cam = camera as PerspectiveCamera;
    const p = projection.current;
    if (p.fov === cam.fov && p.aspect === cam.aspect) return;
    p.fov = cam.fov;
    p.aspect = cam.aspect;
    csm.updateFrustums();
  });

  return (
    <>
      <primitive object={sun.light} />
      <primitive object={sun.light.target} />
      {/* Without the environment map (assets not downloaded): a plain sky/ground light. */}
      {!environment && <hemisphereLight args={['#dfe9f5', '#4d5a33', 1.1]} />}
    </>
  );
}
