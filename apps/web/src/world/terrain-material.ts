// PBR material of the terrain (lot 2.4), in TSL: six CC0 materials from two
// texture arrays, mixed by the splat weights of the vertices (terrain-splat.ts)
// and sharpened per pixel by the height of each texture, with stochastic
// sampling and a large-scale tint variation against visible repetition, and
// a triplanar projection for the rock and the scree on steep slopes.
//
// Cost: a pixel only samples the layers present at its vertices (one branch
// per layer, usually 1 to 3 taken). The gradients are computed before the
// branches, so the sampling stays valid in non-uniform control flow.

import {
  abs,
  attribute,
  cross,
  dFdx,
  dFdy,
  dot,
  Fn,
  float,
  floor,
  fract,
  If,
  int,
  max,
  mix,
  mx_noise_float,
  normalize,
  normalWorldGeometry,
  positionWorld,
  pow,
  sign,
  sin,
  smoothstep,
  sqrt,
  step,
  struct,
  texture,
  transformNormalToView,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { LAYER_TILE_M, TERRAIN_LAYERS } from './terrain-splat';
import type { TextureArrays } from './texture-arrays';

export interface TerrainMaterialOptions {
  /** Two offset samples per layer blended by a noise (breaks the repetition). */
  stochastic: boolean;
  /** Triplanar projection of the rock and scree layers (no stretching on cliffs). */
  triplanar: boolean;
}

// TSL nodes change type with every operation; their typings cannot follow a
// graph built in loops, so the shader code works with untyped nodes.
// biome-ignore lint/suspicious/noExplicitAny: see above
type N = any;
const TRIPLANAR_LAYERS = new Set(['rock', 'scree']);
/** Pixels above this height score more in the mix: crisp, natural borders. */
const HEIGHT_BLEND_BIAS = 0.35;
/** Exponent of the height-blend scores: the higher, the sharper the borders. */
const HEIGHT_BLEND_SHARPNESS = 8;
/** Layers lighter than this at a pixel are not sampled at all. */
const MIN_WEIGHT = 0.02;
const NORMAL_STRENGTH = 1.0;

/** Pseudo-random offset in [0, 1)² for an integer cell. */
const hash2 = (cell: N): N => fract(sin(vec2(cell.mul(127.1), cell.mul(311.7))).mul(43758.5453));

/** Unpacks the XY of an OpenGL normal map (Z rebuilt). */
export const unpackNormal = (rg: N): N => {
  const xy = rg.mul(2).sub(1).mul(NORMAL_STRENGTH);
  return vec3(xy, sqrt(max(float(0), float(1).sub(dot(xy, xy)))));
};

interface LayerSample {
  albedo: N;
  /** Height of the texture at the pixel, 0..1. */
  height: N;
  /** World-space normal of the layer. */
  normal: N;
  roughness: N;
}

const TerrainSurface = struct({ albedo: 'vec3', normal: 'vec3', roughness: 'float' });

export function createTerrainMaterial(
  arrays: TextureArrays,
  { stochastic, triplanar }: TerrainMaterialOptions,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ metalness: 0 });
  const pos = positionWorld;
  const nGeo = normalize(normalWorldGeometry);
  // Tangent frame of the planar (top-down) projection: u along +X; the arrays
  // are not flipped, so the normal maps' green points towards −Z.
  const tangent = normalize(vec3(1, 0, 0).sub(nGeo.mul(nGeo.x)));
  const bitangent = normalize(vec3(0, 0, -1).sub(nGeo.mul(nGeo.z.negate())));
  const toWorld = (t: N) => normalize(tangent.mul(t.x).add(bitangent.mul(t.y)).add(nGeo.mul(t.z)));

  // Screen-space derivatives of the world position, taken outside the branches.
  const dPdx = dFdx(pos);
  const dPdy = dFdy(pos);

  // Stochastic sampling: the ground is cut into noise cells (about 15 m),
  // each with its own texture offset, blended across the cell borders.
  const cellNoise = mx_noise_float(pos.xz.mul(0.07)).mul(0.5).add(0.5).mul(8);
  const cellA = floor(cellNoise);
  const cellFrac = fract(cellNoise);
  const offsetA = hash2(cellA);
  const offsetB = hash2(cellA.add(1));

  const sample = (tex: TextureArrays['albedo'], uv: N, layer: number, dx: N, dy: N) =>
    texture(tex, uv).depth(int(layer)).grad(dx, dy);

  const planar = (layer: number, tileM: number): LayerSample => {
    const uv = pos.xz.div(tileM);
    const dx = dPdx.xz.div(tileM);
    const dy = dPdy.xz.div(tileM);
    let albedo: N;
    let surface: N;
    if (stochastic) {
      const a1 = sample(arrays.albedo, uv.add(offsetA), layer, dx, dy);
      const s1 = sample(arrays.surface, uv.add(offsetA), layer, dx, dy);
      const a2 = sample(arrays.albedo, uv.add(offsetB), layer, dx, dy);
      const s2 = sample(arrays.surface, uv.add(offsetB), layer, dx, dy);
      // The border follows the texture's own contrast rather than a straight line.
      const diff = a1.rgb.sub(a2.rgb);
      const t = smoothstep(0.2, 0.8, cellFrac.sub(diff.x.add(diff.y).add(diff.z).mul(0.1)));
      albedo = mix(a1, a2, t);
      surface = mix(s1, s2, t);
    } else {
      albedo = sample(arrays.albedo, uv, layer, dx, dy);
      surface = sample(arrays.surface, uv, layer, dx, dy);
    }
    return {
      albedo: albedo.rgb,
      height: albedo.w,
      normal: toWorld(unpackNormal(surface.xy)),
      roughness: surface.z,
    };
  };

  // Triplanar (whiteout blend of the normals, after Ben Golus). The weights
  // follow the true face of the triangle: on the steep cuts along the roads,
  // the smoothed vertex normals of the 10 m grid lean too far towards the sky
  // and would stretch the top-down projection down the face.
  const face = normalize(cross(dPdx, dPdy));
  const faceN = face.mul(sign(dot(face, nGeo)));
  const blend = pow(abs(faceN), vec3(4));
  const blendW = blend.div(blend.x.add(blend.y).add(blend.z));
  const triplanarLayer = (layer: number, tileM: number): LayerSample => {
    const project = (axes: 'zy' | 'xz' | 'xy') => {
      const uv = pos[axes].div(tileM);
      const dx = dPdx[axes].div(tileM);
      const dy = dPdy[axes].div(tileM);
      return {
        a: sample(arrays.albedo, uv, layer, dx, dy),
        s: sample(arrays.surface, uv, layer, dx, dy),
      };
    };
    const x = project('zy');
    const y = project('xz');
    const z = project('xy');
    const albedo = x.a.mul(blendW.x).add(y.a.mul(blendW.y)).add(z.a.mul(blendW.z));
    const roughness = x.s.z.mul(blendW.x).add(y.s.z.mul(blendW.y)).add(z.s.z.mul(blendW.z));
    const tx = unpackNormal(x.s.xy);
    const ty = unpackNormal(y.s.xy);
    const tz = unpackNormal(z.s.xy);
    const wx = vec3(tx.xy.add(faceN.zy), abs(tx.z).mul(faceN.x));
    const wy = vec3(ty.xy.add(faceN.xz), abs(ty.z).mul(faceN.y));
    const wz = vec3(tz.xy.add(faceN.xy), abs(tz.z).mul(faceN.z));
    const normal = normalize(
      wx.zyx.mul(blendW.x).add(wy.xzy.mul(blendW.y)).add(wz.xyz.mul(blendW.z)),
    );
    return { albedo: albedo.rgb, height: albedo.w, normal, roughness };
  };

  // Splat weights of the vertices, broken up by a small-scale noise so that
  // the borders do not follow the 10 m terrain grid.
  const splat0 = attribute('splat0', 'vec3');
  const splat1 = attribute('splat1', 'vec3');
  const wobble = mx_noise_float(pos.xz.mul(0.35)).mul(0.25);
  // A layer absent at the vertices stays absent (no stray snow in the fields).
  const weights: N[] = [splat0.x, splat0.y, splat0.z, splat1.x, splat1.y, splat1.z].map((w, k) =>
    max(float(0), w.add(wobble.mul(k % 2 === 0 ? 1 : -1)).mul(step(0.004, w))),
  );

  // Height blending in one pass: each present layer scores (weight × height)^p.
  const surface: N = (
    Fn(() => {
      const albedo = vec3(0).toVar();
      const normal = vec3(0).toVar();
      const roughness = float(0).toVar();
      const total = float(1e-6).toVar();
      TERRAIN_LAYERS.forEach((name, layer) => {
        const w = weights[layer];
        If(w.greaterThan(MIN_WEIGHT), () => {
          const tile = LAYER_TILE_M[name];
          const s =
            triplanar && TRIPLANAR_LAYERS.has(name)
              ? triplanarLayer(layer, tile)
              : planar(layer, tile);
          const score = pow(w.mul(s.height.add(HEIGHT_BLEND_BIAS)), HEIGHT_BLEND_SHARPNESS);
          albedo.addAssign(s.albedo.mul(score));
          normal.addAssign(s.normal.mul(score));
          roughness.addAssign(s.roughness.mul(score));
          total.addAssign(score);
        });
      });
      return TerrainSurface(albedo.div(total), normalize(normal), roughness.div(total));
    })() as N
  ).toVar('terrainSurface');

  // Large-scale variation of brightness and hue (fields, sun-burnt patches).
  const macro = mx_noise_float(pos.xz.mul(0.004)).mul(0.5).add(0.5);
  const detail = mx_noise_float(pos.xz.mul(0.03)).mul(0.5).add(0.5);
  const tint = mix(vec3(0.86, 0.92, 0.84), vec3(1.1, 1.04, 0.9), macro).mul(
    detail.mul(0.16).add(0.92),
  );

  // For the GPU memory estimate (gpu-memory.ts).
  material.userData.textures = [arrays.albedo, arrays.surface];
  material.colorNode = vec4(surface.get('albedo').mul(tint), 1);
  material.normalNode = transformNormalToView(surface.get('normal'));
  material.roughnessNode = surface.get('roughness').mul(1.05).min(1);
  return material;
}
