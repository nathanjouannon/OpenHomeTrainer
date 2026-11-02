// 3D view of a world during a ride (lot 1.4 rendering + 1.5 cameras).

import { emptyRoutePoint, type Route, type RoutePoint } from '@hrt/route-engine';
import { Sky } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  type BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  type InstancedMesh,
  LOD,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { CameraMode, Quality } from '../store/settings';
import { Rider, type RiderHandle } from './Rider';
import {
  batchTrees,
  buildChunkGeometry,
  buildRoadGeometry,
  CHUNKS_PER_SIDE,
  LOD_STEPS,
  ROAD_WIDTH_M,
  roadTexture,
  type TreeBatch,
  terrainDetailTexture,
  terrainNormals,
  toScene,
  treeGeometries,
} from './scene-builders';
import { placeTrees, type WorldData } from './world-data';

const TREES_BY_QUALITY: Record<Quality, number> = { low: 25_000, medium: 60_000, high: 110_000 };
const TREE_VIEW_DISTANCE_M: Record<Quality, number> = { low: 1800, medium: 2800, high: 4000 };
const LOD_DISTANCES_M = [0, 1300, 2800];
/** The rider keeps to the right of the road. */
const LANE_OFFSET_M = 1.3;

export interface BuiltWorld {
  base: number;
  chunks: BufferGeometry[][];
  roads: Map<string, BufferGeometry>;
  trees: TreeBatch[];
  treeGeometries: ReturnType<typeof treeGeometries>;
}

/** Heavy geometry work, done once on the loading screen. */
export async function buildWorldScene(
  world: WorldData,
  quality: Quality,
  onProgress: (f: number) => void,
): Promise<BuiltWorld> {
  const t = world.terrain;
  const base = t.minElevationM;
  const normals = terrainNormals(t);
  const water = world.manifest.waterLevelM;
  const chunks: BufferGeometry[][] = [];
  for (let r = 0; r < CHUNKS_PER_SIDE; r++) {
    for (let c = 0; c < CHUNKS_PER_SIDE; c++) {
      chunks.push(LOD_STEPS.map((step) => buildChunkGeometry(t, normals, r, c, step, base, water)));
    }
    onProgress((r + 1) / CHUNKS_PER_SIDE / 2);
    // Let the loading screen repaint.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const roads = new Map([...world.routes.values()].map((r) => [r.id, buildRoadGeometry(r, base)]));
  const trees = batchTrees(placeTrees(world, TREES_BY_QUALITY[quality]), t, base);
  onProgress(1);
  return { base, chunks, roads, trees, treeGeometries: treeGeometries() };
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
  quality: Quality;
  reduceMotion: boolean;
  onFrame?: (deltaS: number, info: { calls: number; triangles: number }) => void;
}

export function WorldView(props: Props) {
  const dpr = props.quality === 'high' ? Math.min(2, window.devicePixelRatio) : 1;
  return (
    <Canvas
      dpr={dpr}
      camera={{ fov: 62, near: 0.3, far: 9000, position: [0, 50, 0] }}
      gl={{ antialias: props.quality !== 'low', powerPreference: 'high-performance' }}
    >
      <Scene {...props} />
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
  quality,
  reduceMotion,
  onFrame,
}: Props) {
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
  const fogColor = '#c3d3e2';

  useFrame((state, delta) => {
    onFrame?.(delta, state.gl.info.render);
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
    placeCamera(camera, state.camera, tmp, delta, reduceMotion, route, d, base);
  });

  return (
    <>
      <color attach="background" args={[fogColor]} />
      <fog attach="fog" args={[fogColor, 600, 7500]} />
      <Sky
        distance={8000}
        sunPosition={[600, 700, -900]}
        turbidity={5}
        rayleigh={1.1}
        mieCoefficient={0.004}
      />
      <hemisphereLight args={['#e3edf7', '#4d5a33', 1.0]} />
      <directionalLight position={[600, 900, -900]} intensity={2.3} color="#fff4e2" />
      <Terrain built={built} />
      <Roads built={built} />
      {world.manifest.waterLevelM !== null && (
        <Water level={world.manifest.waterLevelM - base} size={world.terrain.sizeM} />
      )}
      <Trees built={built} quality={quality} />
      <StartArch route={route} base={base} />
      <Rider ref={rider} />
    </>
  );
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

function placeCamera(
  mode: CameraMode,
  cam: import('three').Camera,
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
) {
  const { pos, dir, right, desired, look } = tmp;
  let stiffness = 5;
  if (mode === 'chase') {
    // Look ahead along the road so the camera anticipates the bends.
    const ahead = route.sampleAt(d + 25, tmp.ahead);
    toScene(ahead.x, ahead.y, ahead.z, base, look).addScaledVector(right, LANE_OFFSET_M * 0.5);
    look.y += 1.0;
    desired.copy(pos).addScaledVector(dir, -6.5);
    desired.y = Math.max(desired.y, pos.y) + 2.4;
  } else if (mode === 'first-person') {
    desired.copy(pos).addScaledVector(dir, 0.25);
    desired.y += 1.62 + (reduceMotion ? 0 : Math.sin(tmp.t * 9) * 0.01);
    look.copy(desired).addScaledVector(dir, 20);
    look.y -= 1.2;
    stiffness = 30;
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

function Terrain({ built }: { built: BuiltWorld }) {
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        map: terrainDetailTexture(),
      }),
    [],
  );
  const lods = useMemo(
    () =>
      built.chunks.map((levels) => {
        const lod = new LOD();
        levels.forEach((geometry, i) => {
          lod.addLevel(new Mesh(geometry, material), LOD_DISTANCES_M[i] ?? 0);
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
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        map: roadTexture(),
        roughness: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    [],
  );
  return (
    <>
      {[...built.roads.entries()].map(([id, geometry]) => (
        <mesh key={id} geometry={geometry} material={material} />
      ))}
    </>
  );
}

function Water({ level, size }: { level: number; size: number }) {
  return (
    <mesh position={[0, level, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#3e6f8f" roughness={0.12} metalness={0.15} />
    </mesh>
  );
}

function Trees({ built, quality }: { built: BuiltWorld; quality: Quality }) {
  const refs = useRef<(InstancedMesh | null)[]>([]);
  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    [],
  );
  const viewDistance = TREE_VIEW_DISTANCE_M[quality];
  const timer = useRef(0);
  const camera = useThree((s) => s.camera);

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

  // Only the chunks near the camera are drawn.
  useFrame((_, delta) => {
    timer.current += delta;
    if (timer.current < 0.4) return;
    timer.current = 0;
    built.trees.forEach((batch, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      const dx = batch.center.x - camera.position.x;
      const dz = batch.center.z - camera.position.z;
      mesh.visible = Math.hypot(dx, dz) < viewDistance + 900;
    });
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
        <mesh key={x} position={[x, 2.6, 0]}>
          <boxGeometry args={[0.35, 5.2, 0.35]} />
          <meshStandardMaterial color={white} />
        </mesh>
      ))}
      <mesh position={[0, 4.9, 0]}>
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
      for (const levels of built.chunks) for (const g of levels) g.dispose();
      for (const g of built.roads.values()) g.dispose();
    },
    [built],
  );
}
