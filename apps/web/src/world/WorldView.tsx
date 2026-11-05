// 3D view of a world during a ride (lot 1.4 rendering + 1.5 cameras).

import { emptyRoutePoint, type Route, type RoutePoint } from '@hrt/route-engine';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  LOD,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { CameraMode, Quality } from '../store/settings';
import { AerialPerspective, WorldSky } from './Atmosphere';
import { type EnvironmentMap, loadAvatar, loadEnvironmentMap, loadTextureSlots } from './assets';
import { AutoQuality, adaptProfile, autoLevel } from './auto-quality';
import { FreeCamera, type FreeCameraProps } from './FreeCamera';
import { FOG_COLOR, Lighting } from './Lighting';
import { NEAR_SHADOWS_MARGIN_M } from './NearShadows';
import { Vegetation, type VegetationData } from './Plants3D';
import { PostFX } from './PostFX';
import { grassMask, placeShrubs, RoadIndex } from './plants';
import { POV_EYE, POV_FOV, POV_FOV_AVATAR, POV_PITCH, POV_PITCH_AVATAR } from './pov-camera';
import { POV_HIDDEN_LAYER, POV_ONLY_LAYER, Rider, type RiderHandle } from './Rider';
import { RoadFurniture, type RoadsideInstances, roadsideInstances } from './RoadFurniture';
import { renderProfile, terrainProfile } from './render-profile';
import { createWorldRenderer, frameInfo, rendererBackend } from './renderer';
import type { RendererBackend, RendererPreference } from './renderer-options';
import {
  buildRoadSurfaces,
  curbTexture,
  ROAD_WIDTH_M,
  type RoadSurfaces,
  sidewalkTexture,
} from './road-builders';
import { createAsphaltMaterial, createGravelMaterial } from './road-material';
import { planRoadside, ROAD_LAYERS } from './roadside';
import { Settlements3D, Traffic } from './Settlements3D';
import {
  buildChunkGeometry,
  CHUNKS_PER_SIDE,
  groundSampler,
  LOD_STEPS,
  terrainDetailTexture,
  terrainNormals,
  toScene,
} from './scene-builders';
import { generateSettlements, type Settlements } from './settlements';
import { createTerrainMaterial } from './terrain-material';
import { computeSplatMap, TERRAIN_LAYERS } from './terrain-splat';
import type { TextureArrays } from './texture-arrays';
import { batchPlants, plantOf } from './vegetation-builders';
import { REFLECTED_LAYER, Water } from './Water';
import { realClock, useWorldClock, type WorldClock, WorldClockContext } from './world-clock';
import { forestCover, occupancy, placeTrees, valueNoise2d, type WorldData } from './world-data';

const LOD_DISTANCES_M = [0, 1300, 2800];
/** Same seed as the trees, so that the forest floor lies under the forests. */
const FOREST_SEED = 7;
/** Trees thin out between these altitudes (see placeTrees), and so does their floor. */
const TREELINE_M = [1750, 1900] as const;
/** The rider keeps to the right of the road. */
const LANE_OFFSET_M = 1.3;

export interface BuiltWorld {
  base: number;
  terrainSizeM: number;
  chunks: BufferGeometry[][];
  roads: RoadSurfaces;
  /** Guardrails, walls, fences and delineators (lot 2.5). */
  roadside: RoadsideInstances;
  settlements: Settlements;
  /** Trees, shrubs and what the grass needs to know about the ground (lot 2.6). */
  vegetation: VegetationData;
  /** CC0 environment map, null when the assets are not downloaded. */
  environment: EnvironmentMap | null;
  /** PBR ground textures (TERRAIN_LAYERS order), null when not downloaded. */
  terrainTextures: TextureArrays | null;
  /** PBR road textures (ROAD_LAYERS order), null when not downloaded. */
  roadTextures: TextureArrays | null;
  /** Scene of the rigged rider (lot 2.10), null when not imported. */
  avatar: Object3D | null;
}

/** Heavy geometry work, done once on the loading screen. */
export async function buildWorldScene(
  world: WorldData,
  quality: Quality,
  onProgress: (f: number) => void,
): Promise<BuiltWorld> {
  const t = world.terrain;
  const base = t.minElevationM;
  const environment = loadEnvironmentMap();
  const terrainTextures = loadTextureSlots(TERRAIN_LAYERS);
  const roadTextures = loadTextureSlots(ROAD_LAYERS);
  const avatar = loadAvatar();
  const normals = terrainNormals(t);
  const water = world.manifest.waterLevelM;
  const forest = forestCover(FOREST_SEED);
  const [treelineLow, treelineHigh] = TREELINE_M;
  const splat = computeSplatMap(
    t,
    normals,
    water,
    (x, y, z) =>
      forest(x, y, z) * Math.min(1, Math.max(0, (treelineHigh - z) / (treelineHigh - treelineLow))),
    valueNoise2d(11),
  );
  const chunks: BufferGeometry[][] = [];
  for (let r = 0; r < CHUNKS_PER_SIDE; r++) {
    for (let c = 0; c < CHUNKS_PER_SIDE; c++) {
      chunks.push(
        LOD_STEPS.map((step) => buildChunkGeometry(t, normals, r, c, step, base, water, splat)),
      );
    }
    onProgress((r + 1) / CHUNKS_PER_SIDE / 2);
    // Let the loading screen repaint.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const routes = [...world.routes.values()];
  const settlements = generateSettlements(t, routes, world.manifest.villages ?? [], water);
  const layout = planRoadside({
    terrain: t,
    routes,
    spans: settlements.spans,
    buildings: [...settlements.buildings, ...settlements.parkedCars],
    waterLevelM: water,
    forest,
  });
  const roads = buildRoadSurfaces(
    routes,
    base,
    layout,
    settlements.spans,
    groundSampler(t, normals, water, splat),
  );
  const profile = renderProfile(quality).vegetation;
  const roadIndex = new RoadIndex(routes);
  const vegetation: VegetationData = {
    trees: batchPlants(
      placeTrees(world, profile.trees, FOREST_SEED, settlements).map(plantOf),
      t,
      base,
    ),
    shrubs: batchPlants(
      placeShrubs(
        t,
        roadIndex,
        forest,
        water,
        profile.shrubs,
        occupancy(world, settlements, 1),
      ).map((s) => ({ ...s, species: 'bush' as const })),
      t,
      base,
    ),
    ground: {
      terrain: t,
      base,
      mask: grassMask(splat, t.samples),
      roads: roadIndex,
      spans: settlements.spans,
    },
  };
  const built: BuiltWorld = {
    base,
    terrainSizeM: t.sizeM,
    chunks,
    roads,
    roadside: roadsideInstances(layout, world.routes, t, base),
    settlements,
    vegetation,
    environment: await environment,
    terrainTextures: await terrainTextures,
    roadTextures: await roadTextures,
    avatar: await avatar,
  };
  onProgress(1);
  return built;
}

export interface RideView {
  distanceM: number;
  prevDistanceM: number;
  speedMs: number;
  cadenceRpm: number;
  powerW: number;
}

interface Props {
  world: WorldData;
  built: BuiltWorld;
  route: Route;
  /** Current state, read every frame (never through React). */
  view: () => RideView;
  /** Interpolation factor between the last two simulation steps. */
  alpha: () => number;
  camera: CameraMode;
  /** Dev mode: when set, the free camera replaces `camera`. */
  freeCamera?: Omit<FreeCameraProps, 'base'>;
  quality: Quality;
  /** Automatic quality (lot 2.9): lowers resolution and grass when the FPS stays low. */
  adaptive?: boolean;
  /** Read once, when the canvas is created. */
  renderer?: RendererPreference;
  reduceMotion: boolean;
  /** Called once the renderer is ready, with the backend it runs on. */
  onRenderer?: (backend: RendererBackend) => void;
  onFrame?: (deltaS: number, info: { calls: number; triangles: number }) => void;
  /** Animation time and randomness (real clock by default; fixed step for the benchmark). */
  clock?: WorldClock;
  /** Extra objects or probes rendered inside the canvas (benchmark). */
  children?: ReactNode;
}

export function WorldView({
  clock = realClock,
  children,
  renderer = 'auto',
  onRenderer,
  adaptive = false,
  onFrame,
  ...props
}: Props) {
  const [level, setLevel] = useState(0);
  const auto = useRef(new AutoQuality());
  // A new quality or a switch to a manual preset starts over from the full profile.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on these inputs only
  useEffect(() => {
    auto.current = new AutoQuality();
    setLevel(0);
  }, [adaptive, props.quality]);
  const handleFrame = useCallback(
    (d: number, info: { calls: number; triangles: number }) => {
      onFrame?.(d, info);
      if (!adaptive) return;
      const next = auto.current.push(d);
      if (next !== null) setLevel(next);
    },
    [adaptive, onFrame],
  );
  const baseDpr = props.quality === 'high' ? Math.min(2, window.devicePixelRatio) : 1;
  const dpr = baseDpr * autoLevel(level).resolution;
  return (
    <Canvas
      dpr={dpr}
      shadows={renderProfile(props.quality).shadows ? 'soft' : false}
      camera={{ fov: 62, near: 0.3, far: 9000, position: [0, 50, 0] }}
      gl={(defaults) =>
        createWorldRenderer(defaults.canvas as HTMLCanvasElement, {
          // With post-processing, SMAA replaces the MSAA of the canvas.
          antialias: props.quality !== 'low' && !renderProfile(props.quality).post,
          preference: renderer,
        })
      }
      onCreated={(state) => onRenderer?.(rendererBackend(state.gl))}
    >
      <WorldClockContext.Provider value={clock}>
        <Scene {...props} level={level} onFrame={handleFrame} />
        {children}
      </WorldClockContext.Provider>
    </Canvas>
  );
}

function Scene({
  world,
  built,
  route,
  view,
  alpha,
  camera,
  freeCamera,
  quality,
  reduceMotion,
  onFrame,
  level,
}: Omit<Props, 'clock' | 'children' | 'renderer' | 'onRenderer' | 'adaptive'> & {
  level: number;
}) {
  const clock = useWorldClock();
  const rider = useRef<RiderHandle>(null);
  const tmp = useMemo(
    () => ({
      p: emptyRoutePoint(),
      ahead: emptyRoutePoint(),
      pos: new Vector3(),
      look: new Vector3(),
      desired: new Vector3(),
      dir: new Vector3(),
      right: new Vector3(),
      target: new Vector3(),
      t: 0,
    }),
    [],
  );
  const base = built.base;
  const fogColor = FOG_COLOR;
  const profile = useMemo(() => adaptProfile(renderProfile(quality), level), [quality, level]);
  const post = profile.post;
  const riderDistance = useMemo(() => () => view().distanceM, [view]);
  const terrainMaterials = useTerrainMaterials(built, quality);

  useFrame((state, frameDelta) => {
    onFrame?.(frameDelta, frameInfo(state.gl));
    const delta = clock.step(frameDelta);
    tmp.t += delta;
    const v = view();
    const d = v.prevDistanceM + (v.distanceM - v.prevDistanceM) * alpha();
    const p = route.sampleAt(d, tmp.p);
    const a = route.sampleAt(d + 4, tmp.ahead);
    riderPose(p, a, base, tmp.pos, tmp.dir, tmp.right);
    const g = rider.current?.group;
    if (g) {
      g.position.copy(tmp.pos);
      tmp.target.copy(tmp.pos).add(tmp.dir);
      g.lookAt(tmp.target);
    }
    rider.current?.animate(Math.min(delta, 0.1), v.cadenceRpm, v.speedMs, v.powerW);
    if (freeCamera) return;
    placeCamera(
      camera,
      state.camera as PerspectiveCamera,
      tmp,
      delta,
      reduceMotion,
      route,
      d,
      base,
      g ?? null,
      rider.current?.eye ?? null,
    );
  });

  return (
    <>
      <color attach="background" args={[fogColor]} />
      <AerialPerspective profile={profile.atmosphere} />
      <WorldSky clouds={profile.atmosphere.clouds} />
      <Lighting shadows={renderProfile(quality).shadows} environment={built.environment} />
      {post && <PostFX profile={post} />}
      <Terrain built={built} material={terrainMaterials.terrain} />
      <Roads built={built} groundMaterial={terrainMaterials.verges} />
      <RoadFurniture
        instances={built.roadside}
        textures={built.roadTextures}
        shadowRadiusM={shadowRadius(quality)}
      />
      {world.manifest.waterLevelM !== null && (
        <Water
          terrain={world.terrain}
          levelM={world.manifest.waterLevelM}
          base={base}
          mode={profile.water}
        />
      )}
      <Vegetation
        data={built.vegetation}
        profile={profile.vegetation}
        terrainSizeM={built.terrainSizeM}
        shadowRadiusM={shadowRadius(quality)}
      />
      <Settlements3D
        settlements={built.settlements}
        routes={world.routes}
        base={base}
        shadowRadiusM={shadowRadius(quality)}
      />
      <Traffic
        route={route}
        settlements={built.settlements}
        base={base}
        riderDistance={riderDistance}
      />
      <StartArch route={route} base={base} />
      <Rider ref={rider} avatar={built.avatar} />
      {freeCamera && <FreeCamera {...freeCamera} base={base} />}
    </>
  );
}

/** Reach of the shadows of the instanced objects, null without shadows. */
const shadowRadius = (quality: Quality) => {
  const s = renderProfile(quality).shadows;
  return s ? s.maxFarM + NEAR_SHADOWS_MARGIN_M : null;
};

/** Rider position (right lane) and direction of travel, in the scene frame. */
function riderPose(
  p: RoutePoint,
  ahead: RoutePoint,
  base: number,
  pos: Vector3,
  dir: Vector3,
  right: Vector3,
) {
  right.set(Math.cos(p.heading), 0, Math.sin(p.heading));
  toScene(p.x, p.y, p.z, base, pos).addScaledVector(right, LANE_OFFSET_M);
  dir.set(ahead.x - p.x, ahead.z - p.z, -(ahead.y - p.y)).normalize();
}

function placeCamera(
  mode: CameraMode,
  cam: PerspectiveCamera,
  tmp: {
    pos: Vector3;
    dir: Vector3;
    right: Vector3;
    desired: Vector3;
    look: Vector3;
    ahead: RoutePoint;
    t: number;
  },
  delta: number,
  reduceMotion: boolean,
  route: Route,
  d: number,
  base: number,
  riderGroup: Object3D | null,
  riderEye: Vector3 | null,
) {
  const { pos, dir, right, desired, look } = tmp;
  // The head of the rider is hidden in the POV view; the procedural rider also hides its
  // torso and arms there (it has POV-only arms), the avatar shows its own arms.
  if (mode === 'pov') {
    cam.layers.disable(POV_HIDDEN_LAYER);
    cam.layers.enable(POV_ONLY_LAYER);
  } else {
    cam.layers.enable(POV_HIDDEN_LAYER);
    cam.layers.disable(POV_ONLY_LAYER);
  }
  const fov = mode === 'pov' ? (riderEye ? POV_FOV_AVATAR : POV_FOV) : 62;
  if (cam.fov !== fov) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
  if (mode === 'pov' && riderGroup) {
    const eye = riderEye ?? POV_EYE;
    const pitch = riderEye ? POV_PITCH_AVATAR : POV_PITCH;
    // Rigidly attached to the bike: no lag between the bars and the view.
    const bob = reduceMotion ? 0 : Math.sin(tmp.t * 8.5) * 0.006;
    riderGroup.updateMatrixWorld();
    cam.position
      .copy(eye)
      .setY(eye.y + bob)
      .applyMatrix4(riderGroup.matrixWorld);
    look.set(0, eye.y + Math.tan(pitch) * 10, 10).applyMatrix4(riderGroup.matrixWorld);
    cam.lookAt(look);
    return;
  }
  let stiffness = 5;
  if (mode === 'chase') {
    // Look ahead along the road so the camera anticipates the bends.
    const ahead = route.sampleAt(d + 25, tmp.ahead);
    toScene(ahead.x, ahead.y, ahead.z, base, look).addScaledVector(right, LANE_OFFSET_M * 0.5);
    look.y += 1.0;
    desired.copy(pos).addScaledVector(dir, -6.5);
    desired.y = Math.max(desired.y, pos.y) + 2.4;
  } else if (mode === 'side') {
    desired.copy(pos).addScaledVector(right, 7).addScaledVector(dir, 1.5);
    desired.y += 1.4;
    look.copy(pos).addScaledVector(dir, 1.5);
    look.y += 0.9;
  } else {
    const swing = reduceMotion ? 0 : Math.sin(tmp.t * 0.07) * 12;
    desired.copy(pos).addScaledVector(dir, -22).addScaledVector(right, swing);
    desired.y += 16;
    look.copy(pos).addScaledVector(dir, 8);
    stiffness = 1.5;
  }
  if (reduceMotion) stiffness *= 0.6;
  const k = 1 - Math.exp(-Math.min(delta, 0.1) * stiffness);
  // Snap on the first frame or after a camera change far away.
  if (cam.position.distanceTo(desired) > 200) cam.position.copy(desired);
  else cam.position.lerp(desired, k);
  cam.lookAt(look);
}

/**
 * Materials of the ground: the terrain (with the micro-relief of lot 2.8) and
 * the grass verges of the roads (without: the verges stay as approved in 2.5).
 */
function useTerrainMaterials(
  built: BuiltWorld,
  quality: Quality,
): { terrain: Material; verges: Material } {
  const backend = rendererBackend(useThree((s) => s.gl));
  const materials = useMemo(() => {
    const { terrainTextures } = built;
    if (terrainTextures) {
      const profile = terrainProfile(quality, backend);
      return {
        terrain: createTerrainMaterial(terrainTextures, profile),
        verges: profile.microRelief
          ? createTerrainMaterial(terrainTextures, { ...profile, microRelief: false })
          : null,
      };
    }
    // Without the CC0 textures: vertex colours and a procedural detail texture.
    return {
      terrain: new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        map: terrainDetailTexture(),
      }),
      verges: null,
    };
  }, [built, quality, backend]);
  useEffect(
    () => () => {
      materials.terrain.dispose();
      materials.verges?.dispose();
    },
    [materials],
  );
  return { terrain: materials.terrain, verges: materials.verges ?? materials.terrain };
}

function Terrain({ built, material }: { built: BuiltWorld; material: Material }) {
  const lods = useMemo(
    () =>
      built.chunks.map((levels) => {
        const lod = new LOD();
        levels.forEach((geometry, i) => {
          const mesh = new Mesh(geometry, material);
          // The terrain receives shadows but casts none (cascades only reach ~200 m).
          mesh.receiveShadow = true;
          // The planar reflection of the lake shows the terrain.
          mesh.layers.enable(REFLECTED_LAYER);
          lod.addLevel(mesh, LOD_DISTANCES_M[i] ?? 0);
        });
        return lod;
      }),
    [built, material],
  );
  return (
    <>
      {lods.map((lod) => (
        <primitive key={lod.uuid} object={lod} />
      ))}
    </>
  );
}

/**
 * The roads are drawn before the terrain: the ground under them (sunk 0.6 m)
 * then fails the depth test and its costly shader never runs there.
 */
const ROAD_RENDER_ORDER = -1;
/** Verge pieces are drawn up to this distance from the camera (m). */
const VERGE_VIEW_M = 1300;
const VERGE_UPDATE_S = 0.4;

function Roads({ built, groundMaterial }: { built: BuiltWorld; groundMaterial: Material }) {
  const camera = useThree((s) => s.camera);
  const clock = useWorldClock();
  const mats = useMemo(() => {
    const offset = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
    return {
      asphalt: createAsphaltMaterial(built.roadTextures),
      gravel: createGravelMaterial(built.roadTextures),
      sidewalk: new MeshStandardMaterial({ map: sidewalkTexture(), roughness: 0.9, ...offset }),
      curb: new MeshStandardMaterial({ map: curbTexture(), roughness: 0.8, side: DoubleSide }),
    };
  }, [built]);
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) {
        if (m instanceof MeshStandardMaterial) m.map?.dispose();
        m.dispose();
      }
    },
    [mats],
  );
  // The verges (ditches, gravel) only matter near the camera: far away they
  // are thinner than a pixel, and drawing them all would cost ~200k triangles.
  const pieces = useRef<(Mesh | null)[]>([]);
  // Updated on the first frame.
  const timer = useRef(VERGE_UPDATE_S);
  useFrame((_, delta) => {
    timer.current += clock.step(delta);
    if (timer.current < VERGE_UPDATE_S) return;
    timer.current = 0;
    built.roads.verges.forEach((piece, i) => {
      const sphere = piece.ground.boundingSphere;
      const visible =
        !!sphere && sphere.center.distanceTo(camera.position) - sphere.radius < VERGE_VIEW_M;
      for (const mesh of [pieces.current[i * 2], pieces.current[i * 2 + 1]]) {
        if (mesh) mesh.visible = visible;
      }
    });
  });
  const r = built.roads;
  return (
    <>
      {r.asphalt && (
        <mesh
          geometry={r.asphalt}
          material={mats.asphalt}
          renderOrder={ROAD_RENDER_ORDER}
          receiveShadow
        />
      )}
      {r.verges.map((piece, i) => (
        <group key={piece.ground.uuid}>
          <mesh
            ref={(m) => {
              pieces.current[i * 2] = m;
            }}
            geometry={piece.ground}
            renderOrder={ROAD_RENDER_ORDER}
            material={groundMaterial}
            visible={false}
            receiveShadow
          />
          <mesh
            ref={(m) => {
              pieces.current[i * 2 + 1] = m;
            }}
            geometry={piece.gravel}
            material={mats.gravel}
            visible={false}
            receiveShadow
          />
        </group>
      ))}
      {r.sidewalks && (
        <mesh
          geometry={r.sidewalks}
          material={mats.sidewalk}
          renderOrder={ROAD_RENDER_ORDER}
          receiveShadow
        />
      )}
      {r.curbs && <mesh geometry={r.curbs} material={mats.curb} receiveShadow />}
    </>
  );
}

/** Start/finish gantry and a chequered line across the road at d = 0. */
function StartArch({ route, base }: { route: Route; base: number }) {
  const { position, rotationY, banner } = useMemo(() => {
    const p = route.sampleAt(0);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#d7263d';
      ctx.fillRect(0, 0, 512, 64);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('START · FINISH', 256, 46);
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return {
      position: toScene(p.x, p.y, p.z, base),
      // Scene rotation so that local +X is the road's right side.
      rotationY: -p.heading,
      banner: tex,
    };
  }, [route, base]);
  const checker = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
          ctx.fillRect(i * 4, j * 4, 4, 4);
        }
      }
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, []);
  const halfSpan = ROAD_WIDTH_M / 2 + 1;
  const white = useMemo(() => new Color('#e9e9e9'), []);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh
        position={[0, 0.08, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={new PlaneGeometry(ROAD_WIDTH_M, 0.8)}
      >
        <meshStandardMaterial map={checker} polygonOffset polygonOffsetFactor={-8} />
      </mesh>
      {[-halfSpan, halfSpan].map((x) => (
        <mesh key={x} position={[x, 2.6, 0]} castShadow>
          <boxGeometry args={[0.35, 5.2, 0.35]} />
          <meshStandardMaterial color={white} />
        </mesh>
      ))}
      <mesh position={[0, 4.9, 0]} castShadow>
        <boxGeometry args={[halfSpan * 2 + 0.4, 0.9, 0.12]} />
        <meshStandardMaterial map={banner} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** Keeps the canvas focused-free: releases GPU memory when the view unmounts. */
export function useDisposeOnUnmount(built: BuiltWorld | null) {
  useEffect(
    () => () => {
      if (!built) return;
      built.environment?.texture.dispose();
      built.terrainTextures?.albedo.dispose();
      built.terrainTextures?.surface.dispose();
      built.roadTextures?.albedo.dispose();
      built.roadTextures?.surface.dispose();
      for (const levels of built.chunks) for (const g of levels) g.dispose();
      const { asphalt, verges, sidewalks, curbs } = built.roads;
      for (const g of [asphalt, sidewalks, curbs]) g?.dispose();
      for (const piece of verges) {
        piece.ground.dispose();
        piece.gravel.dispose();
      }
    },
    [built],
  );
}
