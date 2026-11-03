// Post-processing of the world (lot 2.3), in TSL with the RenderPipeline of
// Three.js (WebGPU and WebGL2): ambient occlusion (GTAO, from the depth
// buffer), light bloom, tone mapping, colour grading (3D LUT) and SMAA.
// Each effect follows the quality level (render-profile.ts).

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import {
  ClampToEdgeWrapping,
  Data3DTexture,
  LinearFilter,
  type Object3D,
  type PerspectiveCamera,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { pass, renderOutput, texture3D, uniform, vec4 } from 'three/tsl';
import { type Node, RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { buildGradingLut, WORLD_LOOK } from './color-grading';
import type { PostProfile } from './render-profile';
import { ownRenderTargets, registerRenderTargets } from './render-targets';
import { asWorldRenderer, renderFrame } from './renderer';

const LUT_SIZE = 32;
/** Bloom only on what is clearly brighter than a sunlit surface (sky near the sun, glints). */
const BLOOM = { strength: 0.06, radius: 0.2, threshold: 2 };
/** Occlusion of the gaps under cars, around trunks and curbs, between houses (m). */
const AO = { radiusM: 1.4, thickness: 1.5, distanceExponent: 1.4, scale: 0.85 };

function gradingLut(): Data3DTexture {
  const t = new Data3DTexture(buildGradingLut(LUT_SIZE, WORLD_LOOK), LUT_SIZE, LUT_SIZE, LUT_SIZE);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.wrapR = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

interface Pipeline {
  pipeline: RenderPipeline;
  /** Effect nodes, for their render targets and their disposal. */
  effects: Node[];
  lut: Data3DTexture | null;
}

function createPipeline(
  renderer: WebGPURenderer,
  scene: Object3D,
  camera: PerspectiveCamera,
  profile: PostProfile,
): Pipeline {
  const pipeline = new RenderPipeline(renderer);
  // Tone mapping is applied here, before the grading and the anti-aliasing.
  pipeline.outputColorTransform = false;
  const scenePass = pass(scene, camera);
  const effects: Node[] = [scenePass];
  let color: Node<'vec4'> = scenePass.getTextureNode('output');
  if (profile.ao) {
    // No normal buffer: GTAO rebuilds the normals from the depth.
    const aoPass = ao(scenePass.getTextureNode('depth'), null as unknown as Node, camera);
    aoPass.resolutionScale = profile.ao.resolutionScale;
    aoPass.radius.value = AO.radiusM;
    aoPass.thickness.value = AO.thickness;
    aoPass.distanceExponent.value = AO.distanceExponent;
    aoPass.scale.value = AO.scale;
    aoPass.samples.value = profile.ao.samples;
    effects.push(aoPass);
    const c = scenePass.getTextureNode('output');
    color = vec4(c.rgb.mul(aoPass.getTextureNode().r), c.a);
  }
  if (profile.bloom) {
    const bloomPass = bloom(color, BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    effects.push(bloomPass);
    color = color.add(bloomPass) as Node<'vec4'>;
  }
  let out: Node<'vec4'> = renderOutput(color);
  let lut: Data3DTexture | null = null;
  if (profile.grading) {
    lut = gradingLut();
    out = lut3D(out, texture3D(lut), LUT_SIZE, uniform(1)) as unknown as Node<'vec4'>;
  }
  if (profile.smaa) {
    const aa = smaa(out);
    effects.push(aa);
    out = aa as unknown as Node<'vec4'>;
  }
  pipeline.outputNode = out;
  return { pipeline, effects, lut };
}

/** Takes over the rendering of the canvas when the quality level has post-processing. */
export function PostFX({ profile }: { profile: PostProfile }) {
  const gl = asWorldRenderer(useThree((s) => s.gl));
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const p = useMemo(() => createPipeline(gl, scene, camera, profile), [gl, scene, camera, profile]);

  useLayoutEffect(
    () => registerRenderTargets(scene, 'post', () => ownRenderTargets(p.effects)),
    [scene, p],
  );
  useEffect(
    () => () => {
      for (const e of p.effects) e.dispose();
      p.pipeline.dispose();
      p.lut?.dispose();
    },
    [p],
  );

  // Priority 1: R3F no longer renders the scene itself.
  useFrame(() => renderFrame(gl, () => p.pipeline.render()), 1);
  return null;
}
