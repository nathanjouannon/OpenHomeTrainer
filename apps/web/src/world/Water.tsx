// The lake (lot 2.7), by quality:
//   - flat: a plain shiny colour (low);
//   - environment: PBR water, its ripples a scrolling normal map: the
//     environment map and the sun give it its Fresnel reflections (medium);
//   - planar: the same ripples over a true reflection, the scene rendered
//     from under the water by a TSL `reflector`, at a third of the resolution
//     and without the vegetation (only the layer REFLECTED_LAYER: terrain and
//     sky); the plane only covers the lake, so that the extra pass is skipped
//     when the lake is out of view (high).
// The reflection and the scrolling use the world clock, not the shader's own,
// so that the benchmark's captures do not depend on when they are taken.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  Mesh,
  NoColorSpace,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from 'three';
import {
  cameraPosition,
  dot,
  Fn,
  float,
  length,
  max,
  mix,
  mul,
  normalize,
  positionWorld,
  pow,
  reflect,
  reflector,
  texture,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { MeshStandardNodeMaterial, NodeMaterial } from 'three/webgpu';
import { SUN_POSITION } from './Lighting';
import { lakeBounds, WATER_NORMAL_SIZE, waterNormalData } from './lake';
import type { WaterMode } from './render-profile';
import { useWorldClock } from './world-clock';
import type { Terrain } from './world-data';

/** Objects on this layer (as well as layer 0) are seen in the planar reflection. */
export const REFLECTED_LAYER = 6;

// biome-ignore lint/suspicious/noExplicitAny: TSL graphs are untyped (see terrain-material.ts)
type N = any;

const WATER_COLOR = '#1f4f66';
const SUN_COLOR = '#fff1dc';

function normalTexture(): DataTexture {
  const t = new DataTexture(waterNormalData(), WATER_NORMAL_SIZE, WATER_NORMAL_SIZE);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.colorSpace = NoColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Normal of the ripples in world space (y up): two scales of the map drifting in different directions. */
function rippleNormal(map: DataTexture, time: N): N {
  const sample = (scale: number, speed: [number, number]) => {
    const uv = positionWorld.xz.div(scale).add(vec2(speed[0], speed[1]).mul(time));
    return texture(map, uv).xyz.mul(2).sub(1);
  };
  const a = sample(5, [0.012, 0.007]);
  const b = sample(21, [-0.004, 0.009]);
  const n = a.add(b);
  // Texture (x, y, up) to world (x, up, z).
  return normalize(vec3(n.x, n.z, n.y));
}

interface WaterResources {
  material: Material;
  time: { value: number };
  /** Planar reflection: where to set the layers of its camera. */
  reflect: {
    reflector: { getVirtualCamera(camera: unknown): { layers: { set(layer: number): void } } };
  } | null;
  dispose(): void;
}

function createWater(mode: WaterMode): WaterResources {
  const time = uniform(0);
  const map = normalTexture();
  const handle = time as unknown as { value: number };
  if (mode === 'flat') {
    const material = new MeshStandardNodeMaterial({
      color: new Color(WATER_COLOR),
      roughness: 0.12,
      metalness: 0.15,
    });
    return {
      material,
      time: handle,
      reflect: null,
      dispose: () => {
        material.dispose();
        map.dispose();
      },
    };
  }
  if (mode === 'environment') {
    const material = new MeshStandardNodeMaterial({
      color: new Color(WATER_COLOR),
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.94,
    });
    material.normalNode = transformNormalToView(rippleNormal(map, time));
    return {
      material,
      time: handle,
      reflect: null,
      dispose: () => {
        material.dispose();
        map.dispose();
      },
    };
  }
  // Planar reflection, after three's WaterMesh (MIT): Fresnel between the
  // colour of the water and the mirror, the ripples bending the reflection.
  const material = new NodeMaterial();
  material.transparent = true;
  material.opacityNode = float(0.96);
  const sunDir = uniform(new Vector3().copy(SUN_POSITION).normalize());
  const sunColor = uniform(new Color(SUN_COLOR));
  const waterColor = uniform(new Color(WATER_COLOR));
  const mirror: N = reflector({ resolutionScale: 0.33 });
  material.colorNode = Fn(() => {
    const surface = rippleNormal(map, time);
    const toEye = cameraPosition.sub(positionWorld);
    const eye = normalize(toEye);
    const distance = length(toEye);
    const bend = surface.xz.mul(float(0.001).add(float(1).div(distance))).mul(8);
    mirror.uvNode = mirror.uvNode.add(bend);
    const sunReflection = normalize(reflect(sunDir.negate(), surface));
    const specular: N = pow(max(0, dot(eye, sunReflection)), 120)
      .mul(sunColor)
      .mul(2);
    const diffuse: N = max(dot(sunDir, surface), 0).mul(sunColor).mul(0.5);
    const theta = max(dot(eye, surface), 0);
    const f0 = float(0.02);
    const fresnel: N = mul(pow(float(1).sub(theta), 5), float(1).sub(f0)).add(f0);
    const scatter: N = max(0, dot(surface, eye)).mul(waterColor);
    return mix(sunColor.mul(diffuse).mul(0.3).add(scatter), mirror.rgb.add(specular), fresnel);
  })();
  return {
    material,
    time: handle,
    reflect: mirror as WaterResources['reflect'] & object,
    dispose: () => {
      material.dispose();
      map.dispose();
    },
  };
}

export function Water({
  terrain,
  levelM,
  base,
  mode,
}: {
  terrain: Terrain;
  /** Absolute altitude of the lake (m). */
  levelM: number;
  base: number;
  mode: WaterMode;
}) {
  const camera = useThree((s) => s.camera);
  const clock = useWorldClock();
  const water = useMemo(() => createWater(mode), [mode]);
  useEffect(() => () => water.dispose(), [water]);
  const lake = useMemo(() => {
    const b = lakeBounds(terrain, levelM);
    if (!b) return null;
    const margin = 40;
    const w = b.maxX - b.minX + margin * 2;
    const h = b.maxY - b.minY + margin * 2;
    const mesh = new Mesh(new PlaneGeometry(w, h), water.material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((b.minX + b.maxX) / 2, levelM - base, -(b.minY + b.maxY) / 2);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    return mesh;
  }, [terrain, levelM, base, water]);
  useEffect(() => {
    if (!lake || !water.reflect) return;
    // The reflector draws its mirror target as a child of the water.
    const target = (water.reflect as unknown as { target?: Mesh }).target;
    if (target) lake.add(target);
    return () => {
      if (target) lake.remove(target);
    };
  }, [lake, water]);
  useEffect(() => () => lake?.geometry.dispose(), [lake]);

  useFrame((_, delta) => {
    water.time.value += clock.step(delta);
    // Terrain and sky only, in the mirror.
    water.reflect?.reflector.getVirtualCamera(camera).layers.set(REFLECTED_LAYER);
  });
  if (!lake) return null;
  return <primitive object={lake} />;
}
