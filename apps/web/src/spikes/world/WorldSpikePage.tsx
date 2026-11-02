import { SimulatedTrainer } from '@hrt/devices';
import { airDensityAtAltitude, DEFAULT_RIDER_PARAMS, simulateStep } from '@hrt/physics';
import { msToKmh } from '@hrt/shared';
import { OrbitControls, Sky } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  InstancedBufferAttribute,
  type InstancedMesh,
  type Mesh,
  Vector3,
} from 'three';
import { FixedStepLoop } from '../../sim/fixed-step-loop';
import { FrameStats, type FrameStatsSnapshot } from '../../world/frame-stats';
import {
  buildRoadGeometry,
  buildRoadLoop,
  flattenTerrainAlongRoad,
  type RoadLoop,
  type RoadSample,
  sampleRoad,
} from './road';
import { buildTerrainGeometry, type Heightfield, loadHeightfield } from './terrain';
import { placeTrees, type TreeInstances } from './trees';

const TREE_COUNT = 10_000;
const DIFFICULTY = 0.5;
const DESCENT_FACTOR = 0.5;
const STALE_POWER_MS = 3000;

interface World {
  hf: Heightfield;
  road: RoadLoop;
  trees: TreeInstances;
  terrainGeometry: BufferGeometry;
  roadGeometry: BufferGeometry;
  buildMs: number;
}

interface Ride {
  trainer: SimulatedTrainer;
  loop: FixedStepLoop;
  prevDistanceM: number;
  distanceM: number;
  speedMs: number;
  powerW: number;
  cadenceRpm: number;
  gradePercent: number;
  altitudeM: number;
  lastReadingMs: number;
}

async function buildWorld(): Promise<World> {
  const t0 = performance.now();
  const hf = await loadHeightfield();
  const road = buildRoadLoop(hf);
  flattenTerrainAlongRoad(hf, road);
  const trees = placeTrees(hf, road, TREE_COUNT);
  return {
    hf,
    road,
    trees,
    terrainGeometry: buildTerrainGeometry(hf),
    roadGeometry: buildRoadGeometry(road),
    buildMs: performance.now() - t0,
  };
}

/** Simulated trainer + physics at 20 Hz along the loop, decoupled from rendering. */
function useRide(world: World | null) {
  const ride = useRef<Ride | null>(null);

  useEffect(() => {
    if (!world) return;
    const trainer = new SimulatedTrainer({ initialPowerW: 200 });
    const sample: RoadSample = {
      position: new Vector3(),
      direction: new Vector3(),
      gradePercent: 0,
    };
    let simTimeS = 0;
    let lastSent = { grade: Number.NaN, atS: -1 };

    const stepFn = (dtS: number) => {
      const r = ride.current;
      if (!r) return;
      simTimeS += dtS;
      sampleRoad(world.road, r.distanceM, sample);
      r.gradePercent = sample.gradePercent;
      r.altitudeM = world.hf.baseElevationM + sample.position.y;
      const fresh = performance.now() - r.lastReadingMs < STALE_POWER_MS;
      const next = simulateStep(
        { speedMs: r.speedMs, distanceM: r.distanceM },
        {
          powerW: fresh ? r.powerW : 0,
          gradePercent: r.gradePercent,
          airDensity: airDensityAtAltitude(r.altitudeM),
          draftFactor: 0,
        },
        DEFAULT_RIDER_PARAMS,
        dtS,
      );
      r.prevDistanceM = r.distanceM;
      r.distanceM = next.distanceM;
      r.speedMs = next.speedMs;

      // Felt grade: difficulty applied, softened downhill, at most 2 updates per second.
      const felt = r.gradePercent * DIFFICULTY * (r.gradePercent < 0 ? DESCENT_FACTOR : 1);
      if (Math.abs(felt - lastSent.grade) >= 0.1 || Number.isNaN(lastSent.grade)) {
        if (simTimeS - lastSent.atS >= 0.5) {
          lastSent = { grade: felt, atS: simTimeS };
          void trainer.setSimulation({ gradePercent: Math.round(felt * 100) / 100 });
        }
      }
    };

    const loop = new FixedStepLoop(stepFn);
    ride.current = {
      trainer,
      loop,
      prevDistanceM: 0,
      distanceM: 0,
      speedMs: 0,
      powerW: 0,
      cadenceRpm: 0,
      gradePercent: 0,
      altitudeM: world.hf.baseElevationM,
      lastReadingMs: Number.NEGATIVE_INFINITY,
    };
    const off = trainer.onReading((reading) => {
      const r = ride.current;
      if (!r) return;
      r.powerW = reading.powerW ?? 0;
      r.cadenceRpm = reading.cadenceRpm ?? 0;
      r.lastReadingMs = reading.timestamp;
    });
    void trainer.connect();
    loop.start();
    return () => {
      off();
      loop.stop();
      void trainer.disconnect();
      ride.current = null;
    };
  }, [world]);

  return ride;
}

export default function WorldSpikePage() {
  const [world, setWorld] = useState<World | null>(null);
  const [freeCam, setFreeCam] = useState(false);
  const [nativeDpr, setNativeDpr] = useState(false);
  const [gpu, setGpu] = useState('?');
  const stats = useMemo(() => new FrameStats(), []);
  const ride = useRide(world);

  useEffect(() => {
    let cancelled = false;
    void buildWorld().then((w) => {
      if (!cancelled) setWorld(w);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const trainer = ride.current?.trainer;
      if (e.key === 'ArrowUp') trainer?.adjustRiderPower(+1);
      else if (e.key === 'ArrowDown') trainer?.adjustRiderPower(-1);
      else if (e.key === 'c' || e.key === 'C') setFreeCam((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ride]);

  if (!world) return <p className="page">Construction du monde (terrain, route, arbres)…</p>;

  return (
    <div className="world">
      <Canvas
        dpr={nativeDpr ? window.devicePixelRatio : 1}
        camera={{ fov: 60, near: 0.5, far: 8000, position: [0, 200, 0] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          const ctx = gl.getContext();
          const ext = ctx.getExtension('WEBGL_debug_renderer_info');
          setGpu(
            String(
              ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
            ),
          );
        }}
      >
        <Scene world={world} ride={ride} stats={stats} freeCam={freeCam} />
      </Canvas>
      <Hud
        world={world}
        ride={ride}
        stats={stats}
        gpu={gpu}
        nativeDpr={nativeDpr}
        onToggleDpr={() => setNativeDpr((v) => !v)}
        freeCam={freeCam}
      />
    </div>
  );
}

function Scene({
  world,
  ride,
  stats,
  freeCam,
}: {
  world: World;
  ride: RefObject<Ride | null>;
  stats: FrameStats;
  freeCam: boolean;
}) {
  const rider = useRef<Mesh>(null);
  const sample = useMemo<RoadSample>(
    () => ({ position: new Vector3(), direction: new Vector3(), gradePercent: 0 }),
    [],
  );
  const tmp = useMemo(() => ({ desired: new Vector3(), look: new Vector3() }), []);

  useFrame((state, delta) => {
    stats.record(delta, state.gl.info.render);
    const r = ride.current;
    if (!r) return;
    // Interpolate between the last two physics states for smooth motion.
    const d = r.prevDistanceM + (r.distanceM - r.prevDistanceM) * r.loop.alpha();
    sampleRoad(world.road, d, sample);
    if (rider.current) {
      rider.current.position.copy(sample.position).setY(sample.position.y + 1.0);
      tmp.look.copy(rider.current.position).add(sample.direction);
      rider.current.lookAt(tmp.look);
    }
    if (freeCam) return;
    const cam = state.camera;
    tmp.desired
      .copy(sample.position)
      .addScaledVector(sample.direction, -9)
      .setY(sample.position.y + 3.5);
    cam.position.lerp(tmp.desired, 1 - Math.exp(-delta * 4));
    tmp.look
      .copy(sample.position)
      .addScaledVector(sample.direction, 12)
      .setY(sample.position.y + 1.2);
    cam.lookAt(tmp.look);
  });

  return (
    <>
      <color attach="background" args={['#b9cde0']} />
      <fog attach="fog" args={['#b9cde0', 500, 3500]} />
      <Sky distance={6000} sunPosition={[800, 500, -600]} turbidity={6} rayleigh={1.2} />
      <hemisphereLight args={['#dfe9f3', '#4a5a30', 0.9]} />
      <directionalLight position={[800, 1000, -600]} intensity={2.4} />
      <mesh geometry={world.terrainGeometry}>
        <meshStandardMaterial vertexColors roughness={0.95} />
      </mesh>
      <mesh geometry={world.roadGeometry}>
        <meshStandardMaterial
          color="#3b3b3e"
          roughness={0.85}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      <Trees trees={world.trees} />
      <mesh ref={rider}>
        <capsuleGeometry args={[0.35, 1.1, 4, 8]} />
        <meshStandardMaterial color="#e4572e" />
      </mesh>
      {freeCam && <OrbitControls makeDefault />}
    </>
  );
}

function Trees({ trees }: { trees: TreeInstances }) {
  const trunk = useRef<InstancedMesh>(null);
  const crown = useRef<InstancedMesh>(null);
  const geometries = useMemo(
    () => ({
      trunk: new CylinderGeometry(0.18, 0.28, 3, 5).translate(0, 1.5, 0),
      crown: new ConeGeometry(1.9, 6.5, 7).translate(0, 5.5, 0),
    }),
    [],
  );

  useLayoutEffect(() => {
    for (const mesh of [trunk.current, crown.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.array.set(trees.matrices.subarray(0, trees.count * 16));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    if (crown.current) {
      crown.current.instanceColor = new InstancedBufferAttribute(
        trees.colors.subarray(0, trees.count * 3),
        3,
      );
    }
  }, [trees]);

  return (
    <>
      <instancedMesh ref={trunk} args={[geometries.trunk, undefined, trees.count]}>
        <meshStandardMaterial color="#4b3621" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[geometries.crown, undefined, trees.count]}>
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </instancedMesh>
    </>
  );
}

function Hud({
  world,
  ride,
  stats,
  gpu,
  nativeDpr,
  onToggleDpr,
  freeCam,
}: {
  world: World;
  ride: RefObject<Ride | null>;
  stats: FrameStats;
  gpu: string;
  nativeDpr: boolean;
  onToggleDpr: () => void;
  freeCam: boolean;
}) {
  const [snap, setSnap] = useState<FrameStatsSnapshot | null>(null);
  const [rideSnap, setRideSnap] = useState<Ride | null>(null);

  // The HUD refreshes at 4 Hz, never at the simulation or render rate.
  useEffect(() => {
    const id = setInterval(() => {
      setSnap(stats.snapshot());
      setRideSnap(ride.current ? { ...ride.current } : null);
    }, 250);
    return () => clearInterval(id);
  }, [stats, ride]);

  const lap = rideSnap ? Math.floor(rideSnap.distanceM / world.road.lengthM) + 1 : 1;
  const verdict = snap && snap.durationS > 10 ? (snap.avgFps >= 50 ? 'ok' : 'ko') : 'pending';

  return (
    <div className="hud">
      <div className="hud-block">
        <strong>{rideSnap?.powerW ?? 0} W</strong> · {rideSnap?.cadenceRpm ?? 0} rpm ·{' '}
        {msToKmh(rideSnap?.speedMs ?? 0).toFixed(1)} km/h · pente{' '}
        {rideSnap?.gradePercent.toFixed(1) ?? 0} %
        <br />
        Tour {lap} · {((rideSnap?.distanceM ?? 0) / 1000).toFixed(2)} km · boucle{' '}
        {(world.road.lengthM / 1000).toFixed(2)} km · alt. {Math.round(rideSnap?.altitudeM ?? 0)} m
        <br />
        <span className="muted">
          ↑/↓ puissance ±10 W · C caméra libre {freeCam ? '(active)' : ''}
        </span>
      </div>
      <div className={`hud-block fps-${verdict}`}>
        <strong>{snap?.fps.toFixed(0) ?? '—'} FPS</strong> · moyenne{' '}
        {snap?.avgFps.toFixed(1) ?? '—'} · 1 % low {snap?.low1Fps.toFixed(1) ?? '—'} (
        {snap?.durationS.toFixed(0) ?? 0} s)
        <br />
        {snap?.drawCalls ?? 0} draw calls · {((snap?.triangles ?? 0) / 1e6).toFixed(2)} M triangles
        · {world.trees.count} arbres
        <br />
        <span className="muted">
          GPU : {gpu} · résolution {nativeDpr ? `native (×${window.devicePixelRatio})` : '×1'} ·
          monde construit en {Math.round(world.buildMs)} ms
        </span>
        <div className="row">
          <button type="button" onClick={() => stats.reset()}>
            Remettre la mesure à zéro
          </button>
          <button type="button" onClick={onToggleDpr}>
            Résolution {nativeDpr ? '×1' : 'native'}
          </button>
          <a href="#/">Accueil</a>
        </div>
      </div>
      <div className="hud-attribution muted">
        Terrain :{' '}
        {world.hf.source === 'dem' ? 'relief réel (MNT)' : 'procédural (lance `pnpm fetch-dem`)'}
        {world.hf.attribution ? ` — ${world.hf.attribution}` : ''}
      </div>
    </div>
  );
}
