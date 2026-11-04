// Materials of the roads and their surroundings (lot 2.5), in TSL:
//   - asphalt: CC0 texture sampled in world space, then everything that
//     makes a real road look used, computed from the road coordinates
//     (u across, v along, in metres):
//     resurfacing sections of different ages with their joints, polished
//     wheel tracks, dusty and crumbling edges, transverse and longitudinal
//     cracks (some sealed with tar), cut-out patches, worn markings;
//   - gravel shoulder, its outer edge cut out irregularly over the grass of
//     the verge (the grass slopes and the ditches use the terrain material
//     itself, with the terrain's splat weights: no seam with the ground);
//   - masonry: stone wall texture projected in world space (triplanar).
// Every material falls back to procedural colours without the CC0 assets.

import {
  abs,
  attribute,
  clamp,
  Fn,
  float,
  floor,
  fract,
  fwidth,
  int,
  max,
  min,
  mix,
  mx_noise_float,
  normalize,
  normalWorldGeometry,
  positionWorld,
  pow,
  sin,
  smoothstep,
  step,
  texture,
  transformNormalToView,
  uv,
  vec3,
  vec4,
  vertexColor,
} from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { NOISE_CELLS, noiseTexture } from './noise-texture';
import { ASPHALT_SECTION_M } from './road-builders';
import { ROAD_LAYERS, ROAD_TILE_M } from './roadside';
import { unpackNormal } from './terrain-material';
import type { TextureArrays } from './texture-arrays';

// biome-ignore lint/suspicious/noExplicitAny: TSL graphs are untyped (see terrain-material.ts)
type N = any;

interface Sample {
  albedo: N;
  height: N;
  /** World-space normal. */
  normal: N;
  roughness: N;
}

/** Pseudo-random value in [0, 1) for a (cell) number. */
const rnd = (x: N): N => fract(sin(x.mul(12.9898).add(78.233)).mul(43758.5453));

const layerIndex = <T extends string>(layers: readonly T[], name: T) => layers.indexOf(name);

/** Top-down sampling of one layer of a texture array, in world space. */
function planarSampler(arrays: TextureArrays) {
  const pos = positionWorld;
  const nGeo = normalize(normalWorldGeometry);
  const tangent = normalize(vec3(1, 0, 0).sub(nGeo.mul(nGeo.x)));
  const bitangent = normalize(vec3(0, 0, -1).sub(nGeo.mul(nGeo.z.negate())));
  const toWorld = (t: N) => normalize(tangent.mul(t.x).add(bitangent.mul(t.y)).add(nGeo.mul(t.z)));
  return (layer: number, tileM: number): Sample => {
    const coords = pos.xz.div(tileM);
    const albedo = texture(arrays.albedo, coords).depth(int(layer));
    const surface = texture(arrays.surface, coords).depth(int(layer));
    return {
      albedo: albedo.rgb,
      height: albedo.w,
      normal: toWorld(unpackNormal(surface.xy)),
      roughness: surface.z,
    };
  };
}

/**
 * Coverage of a line of half-width `w` at distance `dist` (same units),
 * anti-aliased: a line thinner than a pixel fades instead of flickering.
 */
const line = (dist: N, w: number): N => {
  const fw = max(fwidth(dist), float(1e-4));
  return clamp(float(w).sub(dist).div(fw).add(0.5), 0, 1).mul(min(float(1), float(w * 2).div(fw)));
};

/** Dashes along v: `dash` metres painted every `period` metres, anti-aliased. */
const dashes = (v: N, dash: number, period: number, phase = 0): N => {
  const t = fract(v.add(phase).div(period)).mul(period);
  const fw = max(fwidth(v), float(1e-4));
  return clamp(float(dash).sub(t).div(fw), 0, 1).mul(clamp(t.div(fw), 0, 1));
};

export function createAsphaltMaterial(arrays: TextureArrays | null): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ metalness: 0 });
  // Drawn over the verges where they meet.
  material.polygonOffset = true;
  material.polygonOffsetFactor = -4;
  material.polygonOffsetUnits = -4;
  const pos = positionWorld;
  const u = uv().x;
  const v = uv().y;
  const au = abs(u);
  const nGeo = normalize(normalWorldGeometry);
  const noise = noiseTexture();
  /** Four independent noises in 0..1, features about `featureM` wide. */
  const noise4 = (p: N, featureM: number): N => texture(noise, p.div(featureM * NOISE_CELLS));
  // Slow noises come from the vertices (road-builders.ts); the fine ones
  // from two fetches of the noise texture, four noises each.
  const roadNoise = attribute('roadNoise', 'vec4');
  const roadTint = attribute('roadTint', 'float');
  const ground1 = noise4(pos.xz, 1.5);
  const ground04 = noise4(pos.xz, 0.4);

  // The CC0 aggregate, sampled once: the sections, tracks, patches and
  // cracks below already break its repetition.
  const base: Sample = arrays
    ? planarSampler(arrays)(layerIndex(ROAD_LAYERS, 'asphalt'), ROAD_TILE_M.asphalt)
    : {
        albedo: vec3(0.11, 0.11, 0.115).mul(ground04.w.mul(0.3).add(0.85)),
        height: float(0.5),
        normal: nGeo,
        roughness: float(0.9),
      };

  const surface = Fn(() => {
    const albedo = base.albedo.toVar();
    const roughness = base.roughness.toVar();

    // Resurfacing campaigns: sections of 80 to 250 m with their own age,
    // separated by straight transverse joints.
    const sv = roadNoise.x;
    const section = floor(sv);
    const age = rnd(section.add(13.1));
    const fresh = vec3(0.5, 0.5, 0.53);
    const old = vec3(0.86, 0.84, 0.8);
    albedo.mulAssign(mix(fresh, old, age));
    albedo.mulAssign(roadTint.sub(0.5).mul(0.3).add(1));
    roughness.assign(roughness.mul(mix(0.95, 1.08, age)));
    const joint = line(abs(fract(sv).sub(0.5)).negate().add(0.5).mul(ASPHALT_SECTION_M), 0.02);
    albedo.mulAssign(float(1).sub(joint.mul(0.55)));

    // Wheel tracks: darker, polished bands in each lane.
    const trackAlong = roadNoise.y.mul(0.5).add(0.5);
    const t1 = au.sub(0.75).div(0.32);
    const t2 = au.sub(2.35).div(0.32);
    const track = max(float(0), float(1).sub(t1.mul(t1)))
      .add(max(float(0), float(1).sub(t2.mul(t2))))
      .mul(trackAlong);
    albedo.mulAssign(float(1).sub(track.mul(0.16)));
    roughness.subAssign(track.mul(0.1));
    // Oil drips between the wheels.
    const oil = smoothstep(0.35, 0.0, abs(au.sub(1.55))).mul(smoothstep(0.6, 0.85, ground1.y));
    albedo.mulAssign(float(1).sub(oil.mul(0.18)));

    // Edges: dust, then crumbling asphalt with gravel showing through.
    const edgeNoise = ground04.x.add(ground1.x).sub(1).mul(0.16);
    const dust = smoothstep(2.6, 3.15, au.add(edgeNoise));
    albedo.assign(mix(albedo, albedo.mul(vec3(1.35, 1.3, 1.2)), dust.mul(0.6)));
    const crumble = smoothstep(3.08, 3.2, au.add(edgeNoise));
    albedo.assign(mix(albedo, vec3(0.3, 0.28, 0.24), crumble.mul(0.8)));
    roughness.assign(mix(roughness, float(1), dust.mul(0.4)));

    // Patches cut out and filled with newer asphalt, per lane and 16 m cell.
    const cellV = floor(v.div(16));
    const lane = step(0, u);
    const id = cellV.mul(2).add(lane);
    const present = step(rnd(id.add(0.37)), age.mul(0.35).add(0.06));
    const vc = cellV
      .add(0.15)
      .add(rnd(id.add(1.3)).mul(0.5))
      .mul(16);
    const halfLen = rnd(id.add(2.9)).mul(2.6).add(0.6);
    const u0 = rnd(id.add(4.1)).mul(1.4);
    const halfW = rnd(id.add(5.7)).mul(0.9).add(0.45);
    const uc = min(u0.add(halfW), float(3.15).sub(halfW));
    const box = max(abs(v.sub(vc)).sub(halfLen), abs(au.sub(uc)).sub(halfW));
    const fwBox = max(fwidth(box), float(1e-4));
    const patch = clamp(box.negate().div(fwBox), 0, 1).mul(present);
    const seal = line(abs(box), 0.03).mul(present);
    albedo.assign(mix(albedo, base.albedo.mul(0.62), patch));
    roughness.assign(mix(roughness, base.roughness, patch));

    // Cracks: transverse ones every few metres in the old sections, a
    // longitudinal one at the joint between the lanes and along the edges.
    // Some are sealed with tar (wider, black, glossy).
    const cellT = floor(v.div(7));
    const hasT = step(rnd(cellT.add(3.7)), age.mul(0.8).sub(0.15));
    const vt = cellT
      .add(0.2)
      .add(rnd(cellT.add(9.2)).mul(0.6))
      .mul(7);
    const wobble = ground1.z.sub(0.5).mul(0.4);
    const reach = mix(float(-1.5), float(3.4), rnd(cellT.add(5.5)));
    const flip = step(0.5, rnd(cellT.add(6.1)))
      .mul(2)
      .sub(1);
    const across = step(u.mul(flip), reach);
    const distT = abs(v.sub(vt).sub(wobble));
    const sealedT = step(0.55, rnd(cellT.add(8.8)));
    const crackT = hasT.mul(across);
    const distL = abs(u.sub(ground1.w.sub(0.5).mul(0.12)));
    const alongL = smoothstep(0.55, 0.8, roadNoise.z.add(age.mul(0.25)));
    const distE = abs(au.sub(2.95).sub(ground04.z.sub(0.5).mul(0.1)));
    const alongE = smoothstep(0.65, 0.85, roadNoise.w.add(age.mul(0.2)));
    const open = max(
      line(distT, 0.006).mul(crackT).mul(float(1).sub(sealedT)),
      max(line(distL, 0.005).mul(alongL), line(distE, 0.006).mul(alongE)),
    ).mul(float(1).sub(patch));
    const tar = max(line(distT, 0.03).mul(crackT).mul(sealedT).mul(float(1).sub(patch)), seal);
    albedo.mulAssign(float(1).sub(open.mul(0.75)));
    roughness.assign(mix(roughness, float(1), open));
    albedo.assign(mix(albedo, vec3(0.025, 0.025, 0.028), tar.mul(0.9)));
    roughness.assign(mix(roughness, float(0.5), tar));

    // Markings: dashed centre line (3 m every 13 m) and dashed edge lines
    // (3 m every 6.5 m), worn by the traffic, by the years, and cut by the patches.
    const centre = line(au, 0.06).mul(dashes(v, 3, 13));
    const edge = line(abs(au.sub(3.055)), 0.075).mul(dashes(v, 3, 6.5, 1.7));
    const wear = smoothstep(0.15, 0.5, ground04.y.add(float(1).sub(age).mul(0.3)));
    const paint = max(centre, edge).mul(wear).mul(float(1).sub(patch)).mul(float(1).sub(tar));
    albedo.assign(mix(albedo, vec3(0.8, 0.8, 0.76), paint.mul(0.9)));
    roughness.assign(mix(roughness, float(0.6), paint));
    // A dry road: no wet-looking sheen at grazing angles.
    return vec4(albedo, clamp(roughness, 0.62, 1));
  })().toVar('asphaltSurface');

  material.userData.textures = [noise, ...(arrays ? [arrays.albedo, arrays.surface] : [])];
  material.colorNode = vec4(surface.rgb, 1);
  material.roughnessNode = surface.a;
  material.normalNode = transformNormalToView(base.normal);
  return material;
}

/**
 * Gravel shoulder (uv.x = distance from the asphalt edge, m). Its outer edge
 * is cut out by a noise (alpha test), so that the grass of the verge, drawn
 * by the terrain material underneath, shows through irregularly.
 */
export function createGravelMaterial(road: TextureArrays | null): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ metalness: 0 });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  material.alphaTest = 0.5;
  const pos = positionWorld;
  const x = uv().x;
  const gravel: Sample = road
    ? planarSampler(road)(layerIndex(ROAD_LAYERS, 'gravel'), ROAD_TILE_M.gravel)
    : {
        albedo: vec3(0.42, 0.4, 0.36).mul(mx_noise_float(pos.xz.mul(6)).mul(0.15).add(1)),
        height: float(0.5),
        normal: normalize(normalWorldGeometry),
        roughness: float(1),
      };
  // Ragged edge between 0.55 and 1.05 m from the asphalt; the stones stand
  // out of the grass first (texture height).
  const edge = x
    .add(mx_noise_float(pos.xz.mul(2.2)).mul(0.2))
    .add(mx_noise_float(pos.xz.mul(9)).mul(0.06))
    .sub(gravel.height.mul(0.2));
  // Dust and soil kicked onto the gravel, darker towards the grass.
  const soil = smoothstep(0.3, 0.9, edge);
  material.userData.textures = road ? [road.albedo, road.surface] : [];
  material.colorNode = vec4(gravel.albedo.mul(mix(vec3(1), vec3(0.78, 0.74, 0.66), soil)), 1);
  material.opacityNode = smoothstep(0.95, 0.75, edge);
  material.roughnessNode = gravel.roughness;
  material.normalNode = transformNormalToView(gravel.normal);
  return material;
}

/** Stone masonry of the low walls, projected in world space on the three axes. */
export function createMasonryMaterial(road: TextureArrays | null): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ metalness: 0 });
  const pos = positionWorld;
  const n = normalize(normalWorldGeometry);
  if (!road) {
    material.colorNode = vec4(
      vertexColor()
        .rgb.mul(vec3(0.52, 0.5, 0.46))
        .mul(mx_noise_float(pos.mul(3)).mul(0.25).add(1)),
      1,
    );
    material.roughnessNode = float(0.9);
    return material;
  }
  const layer = layerIndex(ROAD_LAYERS, 'masonry');
  const tile = ROAD_TILE_M.masonry;
  const blend = pow(abs(n), vec3(6));
  const w = blend.div(blend.x.add(blend.y).add(blend.z));
  const project = (coords: N) => ({
    a: texture(road.albedo, coords.div(tile)).depth(int(layer)),
    s: texture(road.surface, coords.div(tile)).depth(int(layer)),
  });
  const px = project(pos.zy);
  const py = project(pos.xz);
  const pz = project(pos.xy);
  const albedo = px.a.rgb.mul(w.x).add(py.a.rgb.mul(w.y)).add(pz.a.rgb.mul(w.z));
  const roughness = px.s.z.mul(w.x).add(py.s.z.mul(w.y)).add(pz.s.z.mul(w.z));
  // Whiteout blend of the tangent-space normals (see terrain-material.ts).
  const tx = unpackNormal(px.s.xy);
  const ty = unpackNormal(py.s.xy);
  const tz = unpackNormal(pz.s.xy);
  const wx = vec3(tx.xy.add(n.zy), abs(tx.z).mul(n.x));
  const wy = vec3(ty.xy.add(n.xz), abs(ty.z).mul(n.y));
  const wz = vec3(tz.xy.add(n.xy), abs(tz.z).mul(n.z));
  const normal = normalize(wx.zyx.mul(w.x).add(wy.xzy.mul(w.y)).add(wz.xyz.mul(w.z)));
  // Lichens and dirt by patches.
  const stain = mx_noise_float(pos.mul(0.6)).mul(0.5).add(0.5);
  const tint = mix(vec3(1.05, 1.02, 0.96), vec3(0.8, 0.84, 0.74), stain);
  material.userData.textures = [road.albedo, road.surface];
  material.colorNode = vec4(albedo.mul(vertexColor().rgb).mul(tint), 1);
  material.roughnessNode = roughness;
  material.normalNode = transformNormalToView(normal);
  return material;
}
