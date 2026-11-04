// 3D view of a world during a ride (lot 1.4 rendering + 1.5 cameras).

import { emptyRoutePoint, type Route, type RoutePoint } from '@hrt/route-engine';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  type BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  type InstancedMesh,
  LOD,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { CameraMode, Quality } from '../store/settings';
import { type EnvironmentMap, loadEnvironmentMap, loadTextureSlots } from './assets';
import { FreeCamera, type FreeCameraProps } from './FreeCamera';
import { FOG_COLOR, Lighting, SUN_POSITION } from './Lighting';
import { NEAR_SHADOWS_MARGIN_M } from './NearShadows';
import { PostFX } from './PostFX';
import {
  POV_HIDDEN_LAYER,
  POV_ONLY_LAYER,
  Rider,
  type RiderHandle,
  SHADOW_ONLY_LAYER,
} from './Rider';
import { renderProfile, terrainProfile } from './render-profile';
import { createWorldRenderer, frameInfo, rendererBackend } from './renderer';
import type { RendererBackend, RendererPreference } from './renderer-options';
import {
  asphaltTextures,
  buildAsphalt,
  buildShoulders,
  buildSidewalks,
  curbTexture,
  gravelTexture,
  ROAD_WIDTH_M,
  sidewalkTexture,
} from './road-builders';
import { Settlements3D, Traffic } from './Settlements3D';
import {
  batchTrees,
  buildChunkGeometry,
  CHUNKS_PER_SIDE,
  collectNearTrees,
  LOD_STEPS,
  shadowTreeGeometries,
  type TreeBatch,
  terrainDetailTexture,
  terrainNormals,
  toScene,
  treeGeometries,
} from './scene-builders';
import { generateSettlements, type Settlements } from './settlements';
import { createTerrainMaterial } from './terrain-material';
import { computeSplatMap, TERRAIN_LAYERS } from './terrain-splat';
import type { TextureArrays } from './texture-arrays';
import { realClock, useWorldClock, type WorldClock, WorldClockContext } from './world-clock';
import { forestCover, placeTrees, valueNoise2d, type WorldData } from './world-data';

const TREES_BY_QUALITY: Record<Quality, number> = { low: 25_000, medium: 60_000, high: 110_000 };
const TREE_VIEW_DISTANCE_M: Record<Quality, number> = { low: 1800, medium: 2800, high: 4000 };
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
  roads: {
    asphalt: BufferGeometry[];
    shoulders: BufferGeometry[];
    sidewalks: BufferGeometry[];
    curbs: BufferGeometry[];
  };
  settlements: Settlements;
  trees: TreeBatch[];
  treeGeometries: ReturnType<typeof treeGeometries>;
  shadowTreeGeometries: ReturnType<typeof shadowTreeGeometries>;
  /** CC0 environment map, null when the assets are not downloaded. */
  environment: EnvironmentMap | null;
  /** PBR ground textures (TERRAIN_LAYERS order), null when not downloaded. */
  terrainTextures: TextureArrays | null;
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
  const roads: BuiltWorld['roads'] = { asphalt: [], shoulders: [], sidewalks: [], curbs: [] };
  for (const r of routes) {
    roads.asphalt.push(buildAsphalt(r, base));
    roads.shoulders.push(...buildShoulders(r, base));
  }
  for (const span of settlements.spans) {
    const r = world.routes.get(span.routeId);
    if (!r) continue;
    const { tops, curbs } = buildSidewalks(r, base, span);
    roads.sidewalks.push(...tops);
    roads.curbs.push(...curbs);
  }
  const trees = batchTrees(
    placeTrees(world, TREES_BY_QUALITY[quality], FOREST_SEED, settlements),
    t,
    base,
  );
  const built: BuiltWorld = {
    base,
    terrainSizeM: t.sizeM,
    chunks,
    roads,
    settlements,
    trees,
    treeGeometries: treeGeometries(),
    shadowTreeGeometries: shadowTreeGeometries(),
    environment: await environment,
    terrainTextures: await terrainTextures,
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
  ...props
}: Props) {
  const dpr = props.quality === 'high' ? Math.min(2, window.devicePixelRatio) : 1;
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
        <Scene {...props} />
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
}: Omit<Props, 'clock' | 'children' | 'renderer' | 'onRenderer'>) {
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
  const post = renderProfile(quality).post;
  const riderDistance = useMemo(() => () => view().distanceM, [view]);

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
    );
  });

  return (
    <>
      <color attach="background" args={[fogColor]} />
      <fog attach="fog" args={[fogColor, 600, 7500]} />
      <WorldSky />
      <Lighting shadows={renderProfile(quality).shadows} environment={built.environment} />
      {post && <PostFX profile={post} />}
      <Terrain built={built} quality={quality} />
      <Roads built={built} />
      {world.manifest.waterLevelM !== null && (
        <Water level={world.manifest.waterLevelM - base} size={world.terrain.sizeM} />
      )}
      <Trees built={built} quality={quality} />
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
      <Rider ref={rider} />
      {freeCamera && <FreeCamera {...freeCamera} base={base} />}
    </>
  );
}

/** Reach of the shadows of the instanced objects, null without shadows. */
const shadowRadius = (quality: Quality) => {
  const s = renderProfile(quality).shadows;
  return s ? s.maxFarM + NEAR_SHADOWS_MARGIN_M : null;
};

/** Physical sky (TSL shader, works on WebGPU and WebGL2). */
function WorldSky() {
  const sky = useMemo(() => {
    const s = new SkyMesh();
    s.scale.setScalar(8000);
    s.turbidity.value = 5;
    s.rayleigh.value = 1.1;
    s.mieCoefficient.value = 0.004;
    s.mieDirectionalG.value = 0.8;
    s.sunPosition.value.copy(SUN_POSITION);
    // Clouds come with lot 2.7.
    s.cloudCoverage.value = 0;
    return s;
  }, []);
  useEffect(
    () => () => {
      sky.geometry.dispose();
      sky.material.dispose();
    },
    [sky],
  );
  return <primitive object={sky} />;
}

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

/** POV: eyes of the rider (bike frame), looking down enough to see the hoods. */
const POV_EYE = new Vector3(0, 1.43, 0.06);
const POV_PITCH = -0.36;

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
) {
  const { pos, dir, right, desired, look } = tmp;
  // The rider's head, torso and arms are hidden in the POV view, which has its own arms.
  if (mode === 'pov') {
    cam.layers.disable(POV_HIDDEN_LAYER);
    cam.layers.enable(POV_ONLY_LAYER);
  } else {
    cam.layers.enable(POV_HIDDEN_LAYER);
    cam.layers.disable(POV_ONLY_LAYER);
  }
  const fov = mode === 'pov' ? 80 : 62;
  if (cam.fov !== fov) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
  if (mode === 'pov' && riderGroup) {
    // Rigidly attached to the bike: no lag between the bars and the view.
    const bob = reduceMotion ? 0 : Math.sin(tmp.t * 8.5) * 0.006;
    riderGroup.updateMatrixWorld();
    cam.position
      .copy(POV_EYE)
      .setY(POV_EYE.y + bob)
      .applyMatrix4(riderGroup.matrixWorld);
    look.set(0, POV_EYE.y + Math.tan(POV_PITCH) * 10, 10).applyMatrix4(riderGroup.matrixWorld);
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

function Terrain({ built, quality }: { built: BuiltWorld; quality: Quality }) {
  const backend = rendererBackend(useThree((s) => s.gl));
  const material = useMemo(
    () =>
      built.terrainTextures
        ? createTerrainMaterial(built.terrainTextures, terrainProfile(quality, backend))
        : // Without the CC0 textures: vertex colours and a procedural detail texture.
          new MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.95,
            map: terrainDetailTexture(),
          }),
    [built, quality, backend],
  );
  useEffect(() => () => material.dispose(), [material]);
  const lods = useMemo(
    () =>
      built.chunks.map((levels) => {
        const lod = new LOD();
        levels.forEach((geometry, i) => {
          const mesh = new Mesh(geometry, material);
          // The terrain receives shadows but casts none (cascades only reach ~200 m).
          mesh.receiveShadow = true;
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

function Roads({ built }: { built: BuiltWorld }) {
  const mats = useMemo(() => {
    const { map, bump } = asphaltTextures();
    // Drawn over the terrain and shoulders when they are at the same depth.
    const offset = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
    return {
      asphalt: new MeshStandardMaterial({
        map,
        bumpMap: bump,
        bumpScale: 0.6,
        roughness: 0.92,
        ...offset,
      }),
      gravel: new MeshStandardMaterial({
        map: gravelTexture(),
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      sidewalk: new MeshStandardMaterial({ map: sidewalkTexture(), roughness: 0.9, ...offset }),
      curb: new MeshStandardMaterial({ map: curbTexture(), roughness: 0.8, side: DoubleSide }),
    };
  }, []);
  const r = built.roads;
  return (
    <>
      {r.asphalt.map((g) => (
        <mesh key={g.uuid} geometry={g} material={mats.asphalt} receiveShadow />
      ))}
      {r.shoulders.map((g) => (
        <mesh key={g.uuid} geometry={g} material={mats.gravel} receiveShadow />
      ))}
      {r.sidewalks.map((g) => (
        <mesh key={g.uuid} geometry={g} material={mats.sidewalk} receiveShadow />
      ))}
      {r.curbs.map((g) => (
        <mesh key={g.uuid} geometry={g} material={mats.curb} receiveShadow />
      ))}
    </>
  );
}

function Water({ level, size }: { level: number; size: number }) {
  return (
    <mesh position={[0, level, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#3e6f8f" roughness={0.12} metalness={0.15} />
    </mesh>
  );
}

/** Most trees in the shadow casting radius, per kind (dense forest included). */
const SHADOW_TREES_MAX = 4000;
const TREE_UPDATE_S = 0.4;

function Trees({ built, quality }: { built: BuiltWorld; quality: Quality }) {
  const refs = useRef<(InstancedMesh | null)[]>([]);
  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    [],
  );
  // Only seen by the shadow cameras.
  const shadowMaterial = useMemo(() => new MeshBasicMaterial(), []);
  const viewDistance = TREE_VIEW_DISTANCE_M[quality];
  const shadows = renderProfile(quality).shadows;
  // Updated on the first frame.
  const timer = useRef(TREE_UPDATE_S);
  const camera = useThree((s) => s.camera);
  const clock = useWorldClock();
  const shadowRefs = useRef<Partial<Record<TreeBatch['kind'], InstancedMesh | null>>>({});

  useLayoutEffect(() => {
    built.trees.forEach((batch, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      mesh.instanceMatrix.array.set(batch.matrices);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor = new InstancedBufferAttribute(batch.colors, 3);
      mesh.computeBoundingSphere();
    });
  }, [built]);

  // Only the chunks near the camera are drawn; only the trees near the camera
  // cast shadows (whole chunks would be drawn again in every cascade).
  useFrame((_, delta) => {
    timer.current += clock.step(delta);
    if (timer.current < TREE_UPDATE_S) return;
    timer.current = 0;
    const { x, z } = camera.position;
    built.trees.forEach((batch, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      mesh.visible = Math.hypot(batch.center.x - x, batch.center.z - z) < viewDistance + 900;
    });
    if (!shadows) return;
    const chunkM = built.terrainSizeM / CHUNKS_PER_SIDE;
    for (const kind of ['conifer', 'broadleaf'] as const) {
      const mesh = shadowRefs.current[kind];
      if (!mesh) continue;
      const out = mesh.instanceMatrix.array as Float32Array;
      const radius = shadows.maxFarM + NEAR_SHADOWS_MARGIN_M;
      mesh.count = collectNearTrees(built.trees, kind, x, z, radius, chunkM, out);
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {built.trees.map((batch, i) => (
        <instancedMesh
          key={`${batch.chunk}-${batch.kind}`}
          ref={(m) => {
            refs.current[i] = m;
          }}
          args={[
            batch.kind === 'conifer'
              ? built.treeGeometries.conifer
              : built.treeGeometries.broadleaf,
            material,
            batch.count,
          ]}
          frustumCulled
          receiveShadow
        />
      ))}
      {shadows &&
        (['conifer', 'broadleaf'] as const).map((kind) => (
          <instancedMesh
            key={`shadow-${kind}`}
            ref={(m) => {
              shadowRefs.current[kind] = m;
              if (m) {
                m.count = 0;
                m.layers.set(SHADOW_ONLY_LAYER);
              }
            }}
            args={[built.shadowTreeGeometries[kind], shadowMaterial, SHADOW_TREES_MAX]}
            frustumCulled={false}
            castShadow
          />
        ))}
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
      for (const levels of built.chunks) for (const g of levels) g.dispose();
      for (const list of Object.values(built.roads)) for (const g of list) g.dispose();
    },
    [built],
  );
}
