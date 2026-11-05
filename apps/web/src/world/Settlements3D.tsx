// Villages, farms, street furniture, pedestrians and oncoming traffic.

import { emptyRoutePoint, type Route } from '@hrt/route-engine';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  DoubleSide,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from 'three';
import { NearShadows } from './NearShadows';
import {
  barnTexture,
  buildBuildings,
  CAR_COLORS,
  CLOTHES_COLORS,
  carGeometry,
  facadeTexture,
  lampGeometry,
  PEDESTRIAN_HIP_M,
  PEDESTRIAN_SHOULDER_M,
  pedestrianGeometries,
  roofTexture,
  TROUSERS_COLORS,
  villageSignTexture,
} from './prop-builders';
import { sidewalkTexture } from './road-builders';
import { toScene } from './scene-builders';
import {
  type Prop,
  ROAD_HALF_WIDTH_M,
  type Settlements,
  SIDEWALK_HEIGHT_M,
  SIDEWALK_WIDTH_M,
} from './settlements';
import { useWorldClock } from './world-clock';

/** Scene rotation (around Y) of a world heading: local +Z points along the heading. */
const yawToScene = (heading: number) => Math.PI - heading;

function useInstances(
  ref: React.RefObject<InstancedMesh | null>,
  props: readonly (Prop & { pitch?: number })[],
  base: number,
  colors?: readonly string[],
  colorOf?: (i: number) => number,
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const c = new Color();
    props.forEach((p, i) => {
      toScene(p.x, p.y, p.z, base, o.position);
      // Yaw first, then the nose-up pitch about the car's own axis.
      o.rotation.set(-(p.pitch ?? 0), yawToScene(p.yaw), 0, 'YXZ');
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (colors && colorOf)
        mesh.setColorAt(i, c.set(colors[colorOf(i) % colors.length] ?? '#fff'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, props, base, colors, colorOf]);
}

export function Settlements3D({
  settlements,
  routes,
  base,
  shadowRadiusM,
}: {
  settlements: Settlements;
  routes: Map<string, Route>;
  base: number;
  /** Lamps and parked cars cast shadows within this distance of the camera. */
  shadowRadiusM: number | null;
}) {
  const s = settlements;
  const built = useMemo(() => buildBuildings(s.buildings, base), [s, base]);
  const mats = useMemo(
    () => ({
      walls: new MeshStandardMaterial({
        map: facadeTexture(),
        vertexColors: true,
        roughness: 0.9,
        side: DoubleSide,
      }),
      barns: new MeshStandardMaterial({
        map: barnTexture(),
        vertexColors: true,
        roughness: 0.95,
        side: DoubleSide,
      }),
      roofs: new MeshStandardMaterial({
        map: roofTexture(),
        vertexColors: true,
        roughness: 0.8,
        side: DoubleSide,
      }),
      painted: new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
      car: new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 }),
    }),
    [],
  );
  const geo = useMemo(
    () => ({
      car: carGeometry(),
      lamp: lampGeometry(),
      // Unit pad, its top at y = 0: scaled to each pad, its sides go down into the ground.
      pad: new BoxGeometry(1, 1, 1).translate(0, -0.5, 0),
    }),
    [],
  );
  const padMaterial = useMemo(() => {
    const map = sidewalkTexture();
    const first = s.pads[0];
    // Same paving as the sidewalks (1.5 m slabs).
    if (first) map.repeat.set(first.w / 1.5, first.d / 1.5);
    return new MeshStandardMaterial({ map, roughness: 0.9 });
  }, [s]);
  useEffect(
    () => () => {
      padMaterial.map?.dispose();
      padMaterial.dispose();
    },
    [padMaterial],
  );
  const pads = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = pads.current;
    if (!mesh) return;
    const o = new Object3D();
    s.pads.forEach((p, i) => {
      toScene(p.x, p.y, p.z, base, o.position);
      o.rotation.set(-p.pitch, yawToScene(p.yaw), 0, 'YXZ');
      o.scale.set(p.w, p.z - p.groundM + 0.5, p.d);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [s, base]);
  const lamps = useRef<InstancedMesh>(null);
  const cars = useRef<InstancedMesh>(null);
  const carColor = useMemo(() => (i: number) => s.parkedCars[i]?.color ?? 0, [s]);
  useInstances(lamps, s.lamps, base);
  useInstances(cars, s.parkedCars, base, CAR_COLORS, carColor);

  return (
    <>
      <mesh geometry={built.walls} material={mats.walls} castShadow receiveShadow />
      <mesh geometry={built.barns} material={mats.barns} castShadow receiveShadow />
      <mesh geometry={built.roofs} material={mats.roofs} castShadow receiveShadow />
      {s.lamps.length > 0 && (
        <instancedMesh ref={lamps} args={[geo.lamp, mats.painted, s.lamps.length]} />
      )}
      {s.pads.length > 0 && (
        <instancedMesh
          ref={pads}
          args={[geo.pad, padMaterial, s.pads.length]}
          renderOrder={-1}
          receiveShadow
        />
      )}
      {s.parkedCars.length > 0 && (
        <instancedMesh ref={cars} args={[geo.car, mats.car, s.parkedCars.length]} receiveShadow />
      )}
      {shadowRadiusM !== null && (
        <>
          <NearShadows source={lamps} geometry={geo.lamp} radiusM={shadowRadiusM} max={256} />
          <NearShadows source={cars} geometry={geo.car} radiusM={shadowRadiusM} max={256} />
        </>
      )}
      {s.signs.map((sign) => (
        <VillageSign key={`${sign.x},${sign.y},${sign.end}`} sign={sign} base={base} />
      ))}
      <Pedestrians settlements={s} routes={routes} base={base} />
    </>
  );
}

function VillageSign({ sign, base }: { sign: Settlements['signs'][number]; base: number }) {
  const map = useMemo(() => villageSignTexture(sign.name, sign.end), [sign]);
  const position = useMemo(() => toScene(sign.x, sign.y, sign.z, base), [sign, base]);
  return (
    <group position={position} rotation={[0, yawToScene(sign.yaw), 0]}>
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 1.1, -0.03]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 2.2, 8]} />
          <meshStandardMaterial color="#8a8d92" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 1.95, 0]} geometry={new PlaneGeometry(1.45, 0.55)} castShadow>
        <meshStandardMaterial map={map} side={DoubleSide} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** People walking up and down the sidewalks of each village. */
function Pedestrians({
  settlements,
  routes,
  base,
}: {
  settlements: Settlements;
  routes: Map<string, Route>;
  base: number;
}) {
  const people = settlements.pedestrians;
  const geo = useMemo(() => pedestrianGeometries(), []);
  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    [],
  );
  const clock = useWorldClock();
  const body = useRef<InstancedMesh>(null);
  const head = useRef<InstancedMesh>(null);
  const legs = useRef<InstancedMesh>(null);
  const arms = useRef<InstancedMesh>(null);
  const state = useMemo(
    () => people.map((p) => ({ d: p.startM, v: p.speedMs, phase: clock.random() * 6 })),
    [people, clock],
  );
  const tmp = useMemo(
    () => ({
      o: new Object3D(),
      leg: new Object3D(),
      m: new Matrix4(),
      p: emptyRoutePoint(),
      v: new Vector3(),
    }),
    [],
  );

  const camera = useThree((s) => s.camera);
  const colors = useMemo(() => {
    const c = new Color();
    return people.map((p, i) => ({
      shirt: c.set(CLOTHES_COLORS[p.color % CLOTHES_COLORS.length] ?? '#888').clone(),
      // Trousers: another colour than the shirt, from the person's index.
      trousers: c
        .set(TROUSERS_COLORS[(i * 7 + p.color) % TROUSERS_COLORS.length] ?? '#333')
        .clone(),
    }));
  }, [people]);

  // The colour attributes exist before the first frame (the shader uses them).
  useLayoutEffect(() => {
    const white = new Color('#ffffff');
    people.forEach((_, i) => {
      body.current?.setColorAt(i, white);
      legs.current?.setColorAt(i * 2, white);
      legs.current?.setColorAt(i * 2 + 1, white);
    });
  }, [people]);

  useFrame((_, delta) => {
    const dt = Math.min(clock.step(delta), 0.1);
    const { o, leg, p } = tmp;
    // Only the people near the camera are drawn (and cast shadows): packed
    // into the first instances, with their colours.
    let k = 0;
    people.forEach((person, n) => {
      const st = state[n];
      const route = routes.get(person.routeId);
      if (!st || !route) return;
      st.d += st.v * dt;
      // Turn back at the end of the village.
      if (st.d < person.span.fromM + 3 || st.d > person.span.toM - 3) {
        st.v = -st.v;
        st.d = Math.min(person.span.toM - 3, Math.max(person.span.fromM + 3, st.d));
      }
      st.phase += Math.abs(st.v) * dt * 3.2;
      route.sampleAt(st.d, p);
      const offset = person.side * (ROAD_HALF_WIDTH_M + SIDEWALK_WIDTH_M * (0.35 + (n % 3) * 0.15));
      const x = p.x + Math.cos(p.heading) * offset;
      const y = p.y - Math.sin(p.heading) * offset;
      toScene(x, y, p.z + SIDEWALK_HEIGHT_M + 0.04, base, o.position);
      if (o.position.distanceTo(camera.position) > PEDESTRIANS_VIEW_M) return;
      const i = k++;
      const c = colors[n];
      if (c) {
        body.current?.setColorAt(i, c.shirt);
        legs.current?.setColorAt(i * 2, c.trousers);
        legs.current?.setColorAt(i * 2 + 1, c.trousers);
      }
      o.position.y += Math.abs(Math.sin(st.phase)) * 0.03;
      o.rotation.set(0, yawToScene(st.v > 0 ? p.heading : p.heading + Math.PI), 0);
      o.updateMatrix();
      body.current?.setMatrixAt(i, o.matrix);
      head.current?.setMatrixAt(i, o.matrix);
      for (const side of [0, 1]) {
        const swing = Math.sin(st.phase + side * Math.PI);
        leg.position.set(side ? 0.1 : -0.1, PEDESTRIAN_HIP_M, 0);
        leg.rotation.set(swing * 0.45, 0, 0);
        leg.updateMatrix();
        tmp.m.multiplyMatrices(o.matrix, leg.matrix);
        legs.current?.setMatrixAt(i * 2 + side, tmp.m);
        // Arms swing against the leg of their side, hanging a little out.
        leg.position.set(side ? 0.215 : -0.215, PEDESTRIAN_SHOULDER_M - 0.04, 0);
        leg.rotation.set(-swing * 0.35, 0, side ? 0.06 : -0.06);
        leg.updateMatrix();
        tmp.m.multiplyMatrices(o.matrix, leg.matrix);
        arms.current?.setMatrixAt(i * 2 + side, tmp.m);
      }
    });
    for (const [mesh, per] of [
      [body.current, 1],
      [head.current, 1],
      [legs.current, 2],
      [arms.current, 2],
    ] as const) {
      if (!mesh) continue;
      mesh.count = k * per;
      mesh.visible = k > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  if (people.length === 0) return null;
  return (
    <>
      <instancedMesh
        ref={body}
        args={[geo.body, material, people.length]}
        frustumCulled={false}
        castShadow
      />
      <instancedMesh
        ref={head}
        args={[geo.head, material, people.length]}
        frustumCulled={false}
        castShadow
      />
      <instancedMesh
        ref={legs}
        args={[geo.leg, material, people.length * 2]}
        frustumCulled={false}
        castShadow
      />
      <instancedMesh
        ref={arms}
        args={[geo.arm, material, people.length * 2]}
        frustumCulled={false}
        castShadow
      />
    </>
  );
}

const TRAFFIC_CARS = 6;
/** Pedestrians are drawn within this distance of the camera (m). */
const PEDESTRIANS_VIEW_M = 500;

/**
 * Oncoming cars in the left lane of the ridden route, spawned ahead of the
 * rider (slower through villages).
 */
export function Traffic({
  route,
  settlements,
  base,
  liftM,
  riderDistance,
}: {
  route: Route;
  settlements: Settlements;
  base: number;
  /** Height of the asphalt of the route above its altitude (m). */
  liftM: number;
  riderDistance: () => number;
}) {
  const geometry = useMemo<BufferGeometry>(() => carGeometry(), []);
  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 }),
    [],
  );
  const mesh = useRef<InstancedMesh>(null);
  const spans = useMemo(
    () => settlements.spans.filter((s) => s.routeId === route.id),
    [settlements, route],
  );
  const clock = useWorldClock();
  // biome-ignore lint/correctness/useExhaustiveDependencies: new cars when the route changes
  const cars = useMemo(
    () =>
      Array.from({ length: TRAFFIC_CARS }, (_, i) => ({
        d: riderDistance() + 300 + i * 450 + clock.random() * 200,
        color: Math.floor(clock.random() * CAR_COLORS.length),
      })),
    [route, riderDistance, clock],
  );
  const tmp = useMemo(() => ({ o: new Object3D(), p: emptyRoutePoint() }), []);

  useLayoutEffect(() => {
    const c = new Color();
    cars.forEach((car, i) => {
      mesh.current?.setColorAt(i, c.set(CAR_COLORS[car.color] ?? '#fff'));
    });
    if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [cars]);

  useFrame((_, delta) => {
    const dt = Math.min(clock.step(delta), 0.1);
    const rider = riderDistance();
    const L = route.lengthM;
    cars.forEach((car, i) => {
      const lapD = ((car.d % L) + L) % L;
      const inVillage = spans.some(
        (s) => (lapD >= s.fromM && lapD <= s.toM) || (lapD + L >= s.fromM && lapD + L <= s.toM),
      );
      car.d -= (inVillage ? 12 : 21) * dt;
      // Passed the rider: reappear far ahead, out of sight.
      if (car.d < rider - 80) car.d = rider + 700 + clock.random() * 900;
      const p = route.sampleAt(car.d, tmp.p);
      const offset = -ROAD_HALF_WIDTH_M / 2;
      const x = p.x + Math.cos(p.heading) * offset;
      const y = p.y - Math.sin(p.heading) * offset;
      toScene(x, y, p.z + liftM, base, tmp.o.position);
      tmp.o.rotation.set(0, yawToScene(p.heading + Math.PI), 0);
      tmp.o.updateMatrix();
      mesh.current?.setMatrixAt(i, tmp.o.matrix);
    });
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, TRAFFIC_CARS]}
      frustumCulled={false}
      castShadow
      receiveShadow
    />
  );
}
