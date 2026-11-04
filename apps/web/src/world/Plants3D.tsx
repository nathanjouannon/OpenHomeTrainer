// Vegetation of the world (lot 2.6), around the camera:
//   - trees and shrubs: every plant of the world sits in a list sorted by
//     terrain chunk; a few times per second the ones in reach are sorted into
//     the tiers of their species (full model, LOD 1, LOD 2, imposter) and
//     copied into one InstancedMesh per species and tier;
//   - grass, tall grass and flowers: generated in tiles of 12 m around the
//     camera, in a pool of instances where a tile takes a free slot as it
//     comes into range and gives it back as it leaves;
//   - wind: bends the tips of the blades (TSL).

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  type BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type InstancedMesh,
  type Material,
} from 'three';
import {
  collectTiers,
  type GrassKind,
  type GrassSource,
  generateGrassTile,
  SPECIES,
  type TierBuffers,
  tilesAround,
  type VegetationBatch,
} from './plants';
import { SHADOW_ONLY_LAYER } from './Rider';
import type { VegetationProfile } from './render-profile';
import { CHUNKS_PER_SIDE } from './scene-builders';
import {
  buildClump,
  buildImposter,
  buildModel,
  buildShadowModel,
  type GRASS_CELLS,
  grassUv,
  type ModelName,
} from './vegetation-builders';
import {
  createFoliageMaterial,
  createGrassMaterial,
  createImposterMaterial,
  createShadowMaterial,
} from './vegetation-material';
import {
  foliageTexture,
  grassTexture,
  type IMPOSTER_ORDER,
  imposterTexture,
  imposterUv,
} from './vegetation-textures';
import { useWorldClock } from './world-clock';

export interface VegetationData {
  trees: VegetationBatch[];
  shrubs: VegetationBatch[];
  /** What the grass tiles need to know about the ground. */
  ground: GrassSource;
}

const UPDATE_S = 0.4;
const GRASS_UPDATE_S = 0.2;
export const GRASS_TILE_M = 12;
/** Most instances of one species in each tier (before the number the world holds). */
const TREE_TIER_CAPS = [1500, 7000, 24_000, Number.POSITIVE_INFINITY];
const SHRUB_TIER_CAPS = [2500, 9000];
/** Most shadow-casting trees of one species. */
const SHADOW_TREES_MAX = 2500;

const MODEL_ORDER: readonly ModelName[] = SPECIES;

interface Models {
  /** [species][tier]: LOD 0 and 1, then two imposters (3 and 2 quads; trees only). */
  trees: (BufferGeometry | null)[][];
  shrubs: (BufferGeometry | null)[][];
  shadows: (BufferGeometry | null)[];
  grass: Record<GrassKind, BufferGeometry>;
}

function buildModels(): Models {
  const trees = MODEL_ORDER.map((name) =>
    name === 'bush'
      ? [null, null, null, null]
      : [
          buildModel(name, 0),
          buildModel(name, 1),
          buildImposter(name, imposterUv(name as (typeof IMPOSTER_ORDER)[number]), 3),
          buildImposter(name, imposterUv(name as (typeof IMPOSTER_ORDER)[number]), 2),
        ],
  );
  const shrubs = MODEL_ORDER.map((name) =>
    name === 'bush' ? [buildModel('bush', 0), buildModel('bush', 1)] : [null, null],
  );
  const shadows = MODEL_ORDER.map((name) => (name === 'bush' ? null : buildShadowModel(name)));
  const grass = {
    grass: buildClump(grassUv('grass'), 0.8, 0.55),
    tall: buildClump(grassUv('tall'), 0.95, 1.2),
    daisy: buildClump(grassUv('daisy'), 0.6, 0.6),
    buttercup: buildClump(grassUv('buttercup'), 0.6, 0.6),
    violet: buildClump(grassUv('violet'), 0.6, 0.6),
  } satisfies Record<keyof typeof GRASS_CELLS, BufferGeometry>;
  return { trees, shrubs, shadows, grass };
}

export function Vegetation({
  data,
  profile,
  terrainSizeM,
  shadowRadiusM,
}: {
  data: VegetationData;
  profile: VegetationProfile;
  terrainSizeM: number;
  /** Reach of the shadows of instanced objects (m), null without shadows. */
  shadowRadiusM: number | null;
}) {
  const resources = useMemo(() => {
    const foliage = foliageTexture();
    const imposters = imposterTexture();
    const grass = grassTexture();
    const wind = createGrassMaterial(grass);
    return {
      textures: [foliage, imposters, grass],
      foliage: createFoliageMaterial(foliage),
      imposter: createImposterMaterial(imposters),
      shadow: createShadowMaterial(),
      wind,
      models: buildModels(),
    };
  }, []);
  useEffect(
    () => () => {
      for (const t of resources.textures) t.dispose();
      resources.foliage.dispose();
      resources.imposter.dispose();
      resources.shadow.dispose();
      resources.wind.material.dispose();
      const { trees, shrubs, shadows, grass } = resources.models;
      for (const g of [...trees.flat(), ...shrubs.flat(), ...shadows, ...Object.values(grass)]) {
        g?.dispose();
      }
    },
    [resources],
  );
  const clock = useWorldClock();
  useFrame((_, delta) => {
    resources.wind.time.value += clock.step(delta);
  });
  const chunkM = terrainSizeM / CHUNKS_PER_SIDE;
  return (
    <>
      <PlantTiers
        batches={data.trees}
        geometries={resources.models.trees}
        materials={[resources.foliage, resources.foliage, resources.imposter, resources.imposter]}
        radiiM={profile.treeTiersM}
        maxM={profile.treeViewM}
        chunkM={chunkM}
        caps={TREE_TIER_CAPS}
        shadows={
          shadowRadiusM === null
            ? null
            : {
                radiusM: shadowRadiusM,
                geometries: resources.models.shadows,
                material: resources.shadow,
              }
        }
      />
      <PlantTiers
        batches={data.shrubs}
        geometries={resources.models.shrubs}
        materials={[resources.foliage, resources.foliage]}
        radiiM={[profile.shrubFullM]}
        maxM={profile.shrubViewM}
        chunkM={chunkM}
        caps={SHRUB_TIER_CAPS}
        shadows={null}
      />
      {profile.grass && (
        <GrassField
          source={data.ground}
          grass={profile.grass}
          geometries={resources.models.grass}
          material={resources.wind.material}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------- trees and shrubs

function PlantTiers({
  batches,
  geometries,
  materials,
  radiiM,
  maxM,
  chunkM,
  caps,
  shadows,
}: {
  batches: readonly VegetationBatch[];
  /** [species][tier], null where a species has no mesh. */
  geometries: readonly (readonly (BufferGeometry | null)[])[];
  /** By tier. */
  materials: readonly Material[];
  radiiM: readonly number[];
  maxM: number;
  chunkM: number;
  caps: readonly number[];
  shadows: {
    radiusM: number;
    geometries: readonly (BufferGeometry | null)[];
    material: Material;
  } | null;
}) {
  const camera = useThree((s) => s.camera);
  const clock = useWorldClock();
  const counts = useMemo(() => {
    const c = new Array<number>(SPECIES.length).fill(0);
    for (const b of batches) {
      for (let i = 0; i < b.count; i++)
        c[b.species[i] as number] = (c[b.species[i] as number] ?? 0) + 1;
    }
    return c;
  }, [batches]);
  const capacity = useCallback(
    (s: number, t: number) =>
      Math.max(1, Math.min(counts[s] as number, caps[t] ?? Number.POSITIVE_INFINITY)),
    [counts, caps],
  );
  const meshes = useRef<(InstancedMesh | null)[][]>(SPECIES.map(() => []));
  const buffers = useRef<(TierBuffers | undefined)[][]>(SPECIES.map(() => []));
  const shadowMeshes = useRef<(InstancedMesh | null)[]>([]);
  const shadowBuffers = useRef<(TierBuffers | undefined)[][]>(SPECIES.map(() => []));
  const timer = useRef(UPDATE_S);

  useLayoutEffect(() => {
    geometries.forEach((tiers, s) => {
      tiers.forEach((geometry, t) => {
        const mesh = meshes.current[s]?.[t];
        if (!mesh || !geometry) return;
        const cap = capacity(s, t);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        mesh.instanceColor.setUsage(DynamicDrawUsage);
        mesh.count = 0;
        mesh.visible = false;
        (buffers.current[s] as (TierBuffers | undefined)[])[t] = {
          matrices: mesh.instanceMatrix.array as Float32Array,
          colors: mesh.instanceColor.array as Float32Array,
          count: 0,
        };
      });
      const shadow = shadowMeshes.current[s];
      if (shadow) {
        shadow.count = 0;
        shadow.layers.set(SHADOW_ONLY_LAYER);
        shadow.instanceMatrix.setUsage(DynamicDrawUsage);
        (shadowBuffers.current[s] as (TierBuffers | undefined)[])[0] = {
          matrices: shadow.instanceMatrix.array as Float32Array,
          colors: new Float32Array(SHADOW_TREES_MAX * 3),
          count: 0,
        };
      }
    });
  }, [geometries, capacity]);

  useFrame((_, delta) => {
    timer.current += clock.step(delta);
    if (timer.current < UPDATE_S) return;
    timer.current = 0;
    const { x, z } = camera.position;
    collectTiers(batches, x, z, radiiM, maxM, chunkM, buffers.current);
    meshes.current.forEach((tiers, s) => {
      tiers.forEach((mesh, t) => {
        const buf = buffers.current[s]?.[t];
        if (!mesh || !buf) return;
        mesh.count = buf.count;
        mesh.visible = buf.count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
    });
    if (!shadows) return;
    collectTiers(batches, x, z, [], shadows.radiusM, chunkM, shadowBuffers.current);
    shadowMeshes.current.forEach((mesh, s) => {
      const buf = shadowBuffers.current[s]?.[0];
      if (!mesh || !buf) return;
      mesh.count = buf.count;
      mesh.visible = buf.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    });
  });

  // One mesh per species and tier that exists, with a stable key.
  const parts = geometries.flatMap((tiers, s) =>
    (counts[s] as number) > 0
      ? tiers.flatMap((geometry, t) =>
          geometry ? [{ key: `${SPECIES[s]}-${t}`, s, t, geometry }] : [],
        )
      : [],
  );
  const shadowParts = (shadows?.geometries ?? []).flatMap((geometry, s) =>
    geometry && (counts[s] as number) > 0 ? [{ key: `shadow-${SPECIES[s]}`, s, geometry }] : [],
  );
  return (
    <>
      {parts.map(({ key, s, t, geometry }) => (
        <instancedMesh
          key={key}
          ref={(m) => {
            (meshes.current[s] as (InstancedMesh | null)[])[t] = m;
          }}
          args={[geometry, materials[t] as Material, capacity(s, t)]}
          frustumCulled={false}
          receiveShadow
        />
      ))}
      {shadows &&
        shadowParts.map(({ key, s, geometry }) => (
          <instancedMesh
            key={key}
            ref={(m) => {
              shadowMeshes.current[s] = m;
            }}
            args={[geometry, shadows.material, SHADOW_TREES_MAX]}
            frustumCulled={false}
            castShadow
          />
        ))}
    </>
  );
}

// ------------------------------------------------------------------- grass

const FLOWER_KINDS = ['daisy', 'buttercup', 'violet'] as const;

function GrassField({
  source,
  grass,
  geometries,
  material,
}: {
  source: GrassSource;
  grass: NonNullable<VegetationProfile['grass']>;
  geometries: Record<GrassKind, BufferGeometry>;
  material: Material;
}) {
  const layers: { kind: GrassKind; density: number; capacityShare: number }[] = [
    { kind: 'grass', density: grass.density, capacityShare: 1 },
    { kind: 'tall', density: grass.tall, capacityShare: 1 },
    ...FLOWER_KINDS.map((kind) => ({ kind, density: grass.flowers, capacityShare: 0.3 })),
  ];
  return (
    <>
      {layers.map((l) => (
        <GrassLayer
          key={l.kind}
          source={source}
          kind={l.kind}
          density={l.density}
          capacityPerTile={Math.max(
            8,
            Math.ceil(l.density * GRASS_TILE_M * GRASS_TILE_M * l.capacityShare),
          )}
          radiusM={grass.radiusM}
          geometry={geometries[l.kind]}
          material={material}
        />
      ))}
    </>
  );
}

function GrassLayer({
  source,
  kind,
  density,
  capacityPerTile,
  radiusM,
  geometry,
  material,
}: {
  source: GrassSource;
  kind: GrassKind;
  density: number;
  capacityPerTile: number;
  radiusM: number;
  geometry: BufferGeometry;
  material: Material;
}) {
  const camera = useThree((s) => s.camera);
  const clock = useWorldClock();
  const slots = useMemo(
    () => Math.ceil((Math.PI * (radiusM + GRASS_TILE_M) ** 2) / GRASS_TILE_M ** 2) + 12,
    [radiusM],
  );
  const mesh = useRef<InstancedMesh | null>(null);
  const tiles = useRef(new Map<string, number>());
  const free = useRef<number[]>([]);
  const timer = useRef(GRASS_UPDATE_S);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.instanceColor = new InstancedBufferAttribute(
      new Float32Array(slots * capacityPerTile * 3),
      3,
    );
    m.instanceColor.setUsage(DynamicDrawUsage);
    // Every slot starts empty (zero matrices draw nothing).
    (m.instanceMatrix.array as Float32Array).fill(0);
    tiles.current.clear();
    free.current = Array.from({ length: slots }, (_, i) => slots - 1 - i);
    timer.current = GRASS_UPDATE_S;
  }, [slots, capacityPerTile]);

  useFrame((_, delta) => {
    timer.current += clock.step(delta);
    if (timer.current < GRASS_UPDATE_S) return;
    timer.current = 0;
    const m = mesh.current;
    if (!m?.instanceColor) return;
    const matrices = m.instanceMatrix.array as Float32Array;
    const colors = m.instanceColor.array as Float32Array;
    // World frame: y is north, the opposite of the scene's z.
    const cx = camera.position.x;
    const cy = -camera.position.z;
    let changed = false;
    // Give back the tiles that left the ring (with some slack against flicker).
    for (const [key, slot] of tiles.current) {
      const [ix, iy] = key.split(',').map(Number) as [number, number];
      const dist = Math.hypot((ix + 0.5) * GRASS_TILE_M - cx, (iy + 0.5) * GRASS_TILE_M - cy);
      if (dist <= radiusM + GRASS_TILE_M * 0.8) continue;
      matrices.fill(0, slot * capacityPerTile * 16, (slot + 1) * capacityPerTile * 16);
      tiles.current.delete(key);
      free.current.push(slot);
      changed = true;
    }
    for (const { ix, iy } of tilesAround(cx, cy, radiusM, GRASS_TILE_M)) {
      const key = `${ix},${iy}`;
      if (tiles.current.has(key)) continue;
      const slot = free.current.pop();
      if (slot === undefined) break;
      tiles.current.set(key, slot);
      const from = slot * capacityPerTile;
      const to = from + capacityPerTile;
      const n = generateGrassTile(
        source,
        { kind, density, x0: ix * GRASS_TILE_M, y0: iy * GRASS_TILE_M, sizeM: GRASS_TILE_M },
        matrices.subarray(from * 16, to * 16),
        colors.subarray(from * 3, to * 3),
      );
      matrices.fill(0, (from + n) * 16, to * 16);
      changed = true;
    }
    if (changed) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, slots * capacityPerTile]}
      frustumCulled={false}
    />
  );
}
