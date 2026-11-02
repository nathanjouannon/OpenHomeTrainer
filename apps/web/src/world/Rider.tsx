// Procedural cyclist and bike (lot 1.5): cranks driven by the cadence, legs
// by two-bone IK on the pedals, wheels turning at the virtual speed.
// Local frame: +Z forward, +Y up, +X to the rider's left.

import { useFrame } from '@react-three/fiber';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  CylinderGeometry,
  type Group,
  type Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';

const WHEEL_R = 0.34;
const CRANK_L = 0.17;
const THIGH_L = 0.44;
const SHIN_L = 0.45;
const BB = new Vector3(0, 0.29, -0.06);
const HIP_Y = 0.98;
const HIP_Z = -0.27;

export interface RiderHandle {
  group: Group | null;
  /** Advances the animation; call once per frame. */
  animate(dtS: number, cadenceRpm: number, speedMs: number, powerW: number): void;
}

const unitCylinder = new CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
const UP = new Vector3(0, 1, 0);

/** Places a unit cylinder (radius r) between a and b. */
function limb(mesh: Mesh | null, a: Vector3, b: Vector3, r: number) {
  if (!mesh) return;
  const dir = b.clone().sub(a);
  const len = dir.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.scale.set(r, len, r);
}

/** Knee position from hip and foot, knee bent forward (+Z). */
function solveKnee(hip: Vector3, foot: Vector3, out: Vector3): Vector3 {
  const d = foot.clone().sub(hip);
  const dist = Math.min(THIGH_L + SHIN_L - 1e-4, d.length());
  const a = (THIGH_L * THIGH_L - SHIN_L * SHIN_L + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, THIGH_L * THIGH_L - a * a));
  const dirN = d.normalize();
  // Perpendicular to the leg in the sagittal plane (YZ), towards the front.
  const perp = new Vector3(0, -dirN.z, dirN.y);
  if (perp.z < 0) perp.negate();
  return out.copy(hip).addScaledVector(dirN, a).addScaledVector(perp, h);
}

export const Rider = forwardRef<RiderHandle, { jersey?: string; frame?: string }>(function Rider(
  { jersey = '#e4572e', frame = '#1f6feb' },
  ref,
) {
  const group = useRef<Group>(null);
  const rearWheel = useRef<Group>(null);
  const frontWheel = useRef<Group>(null);
  const crank = useRef<Group>(null);
  const legs = {
    lThigh: useRef<Mesh>(null),
    lShin: useRef<Mesh>(null),
    rThigh: useRef<Mesh>(null),
    rShin: useRef<Mesh>(null),
  };
  const torso = useRef<Group>(null);
  const state = useRef({ crankAngle: 0, wheelAngle: 0, standing: 0 });

  const mats = useMemo(
    () => ({
      frame: new MeshStandardMaterial({ color: frame, roughness: 0.35, metalness: 0.4 }),
      dark: new MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.6 }),
      tyre: new MeshStandardMaterial({ color: '#141414', roughness: 0.9 }),
      metal: new MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.3, metalness: 0.8 }),
      jersey: new MeshStandardMaterial({ color: jersey, roughness: 0.7 }),
      shorts: new MeshStandardMaterial({ color: '#151518', roughness: 0.8 }),
      skin: new MeshStandardMaterial({ color: '#d9a27e', roughness: 0.8 }),
      helmet: new MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.4 }),
      hood: new MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.75 }),
      glove: new MeshStandardMaterial({ color: '#202124', roughness: 0.8 }),
    }),
    [jersey, frame],
  );

  const tubes = useMemo(() => {
    const p = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const rear = p(0, WHEEL_R, -0.5);
    const front = p(0, WHEEL_R, 0.5);
    const seatCluster = p(0, 0.84, -0.22);
    const headTop = p(0, 0.9, 0.38);
    const headBottom = p(0, 0.74, 0.42);
    return [
      [BB, seatCluster, 0.018],
      [seatCluster, rear, 0.011],
      [BB, rear, 0.012],
      [seatCluster, headTop, 0.016],
      [BB, headBottom, 0.022],
      [headBottom, headTop, 0.02],
      [headBottom, front, 0.014],
      [seatCluster, p(0, HIP_Y - 0.06, HIP_Z - 0.02), 0.012],
      [headTop, p(0, 0.94, 0.44), 0.014],
    ] as [Vector3, Vector3, number][];
  }, []);

  useImperativeHandle(ref, () => ({
    get group() {
      return group.current;
    },
    animate(dtS, cadenceRpm, speedMs, powerW) {
      const s = state.current;
      s.crankAngle += (cadenceRpm / 60) * Math.PI * 2 * dtS;
      s.wheelAngle += (speedMs / WHEEL_R) * dtS;
      // Out of the saddle on hard efforts at low speed (climbing).
      const wantStanding = powerW > 380 && speedMs < 6 ? 1 : 0;
      s.standing += (wantStanding - s.standing) * Math.min(1, dtS * 2);
      if (rearWheel.current) rearWheel.current.rotation.x = s.wheelAngle;
      if (frontWheel.current) frontWheel.current.rotation.x = s.wheelAngle;
      if (crank.current) crank.current.rotation.x = s.crankAngle;
      const lift = s.standing * 0.12;
      const forward = s.standing * 0.12;
      for (const side of [1, -1] as const) {
        const angle = s.crankAngle + (side === 1 ? 0 : Math.PI);
        const foot = new Vector3(
          side * 0.1,
          BB.y - Math.cos(angle) * CRANK_L + 0.02,
          BB.z - Math.sin(angle) * CRANK_L,
        );
        const hip = new Vector3(side * 0.09, HIP_Y + lift, HIP_Z + forward);
        const knee = solveKnee(hip, foot, new Vector3());
        knee.x = side * 0.1;
        limb(side === 1 ? legs.lThigh.current : legs.rThigh.current, hip, knee, 0.065);
        limb(side === 1 ? legs.lShin.current : legs.rShin.current, knee, foot, 0.045);
      }
      if (torso.current) {
        torso.current.position.set(0, lift, forward);
        torso.current.rotation.z = Math.sin(s.crankAngle) * (0.02 + s.standing * 0.08);
      }
    },
  }));

  // Static parts: torso, arms, head, held in a group that sways when standing.
  const shoulderY = 1.4;
  const shoulderZ = 0.17;
  const arms = useMemo(
    () =>
      ([1, -1] as const).map((side) => {
        const shoulder = new Vector3(side * 0.18, shoulderY, shoulderZ);
        const hand = new Vector3(side * 0.205, 0.99, 0.52);
        const elbow = shoulder
          .clone()
          .lerp(hand, 0.5)
          .add(new Vector3(side * 0.05, 0.02, -0.06));
        return { shoulder, elbow, hand };
      }),
    [],
  );

  return (
    <group ref={group}>
      {/* Wheels */}
      {[
        [rearWheel, -0.5],
        [frontWheel, 0.5],
      ].map(([r, z]) => (
        <group key={String(z)} position={[0, WHEEL_R, z as number]}>
          <group ref={r as typeof rearWheel}>
            <mesh
              material={mats.tyre}
              rotation={[0, Math.PI / 2, 0]}
              geometry={new TorusGeometry(WHEEL_R - 0.015, 0.016, 8, 40)}
            />
            <mesh
              material={mats.dark}
              rotation={[0, Math.PI / 2, 0]}
              geometry={new TorusGeometry(WHEEL_R - 0.045, 0.012, 6, 40)}
            />
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <mesh
                key={k}
                material={mats.metal}
                rotation={[(k * Math.PI) / 6, 0, 0]}
                geometry={new BoxGeometry(0.004, (WHEEL_R - 0.05) * 2, 0.004)}
              />
            ))}
          </group>
        </group>
      ))}
      {/* Frame */}
      {tubes.map(([a, b, r]) => (
        <mesh
          key={`${a.toArray()}${b.toArray()}`}
          material={mats.frame}
          geometry={unitCylinder}
          ref={(m) => limb(m, a, b, r)}
        />
      ))}
      <mesh
        material={mats.dark}
        position={[0, HIP_Y - 0.04, HIP_Z - 0.04]}
        geometry={new BoxGeometry(0.12, 0.04, 0.26)}
      />
      <DropBar tape={mats.dark} hood={mats.hood} glove={mats.glove} metal={mats.metal} />
      {/* Cranks */}
      <group ref={crank} position={BB.toArray()}>
        <mesh
          material={mats.metal}
          rotation={[0, 0, Math.PI / 2]}
          geometry={new CylinderGeometry(0.1, 0.1, 0.01, 24)}
          position={[-0.06, 0, 0]}
        />
        {[1, -1].map((side) => (
          <group key={side} rotation={[side === 1 ? 0 : Math.PI, 0, 0]}>
            <mesh
              material={mats.dark}
              position={[side * 0.08, -CRANK_L / 2, 0]}
              geometry={new BoxGeometry(0.02, CRANK_L, 0.025)}
            />
          </group>
        ))}
      </group>
      {/* Legs */}
      <mesh ref={legs.lThigh} material={mats.shorts} geometry={unitCylinder} />
      <mesh ref={legs.rThigh} material={mats.shorts} geometry={unitCylinder} />
      <mesh ref={legs.lShin} material={mats.skin} geometry={unitCylinder} />
      <mesh ref={legs.rShin} material={mats.skin} geometry={unitCylinder} />
      {/* Upper body */}
      <group ref={torso}>
        <mesh
          material={mats.jersey}
          geometry={unitCylinder}
          ref={(m) => {
            limb(
              m,
              new Vector3(0, HIP_Y + 0.02, HIP_Z),
              new Vector3(0, shoulderY, shoulderZ),
              0.15,
            );
            hideInPov(m);
          }}
        />
        <mesh
          ref={hideInPov}
          material={mats.skin}
          position={[0, shoulderY + 0.12, shoulderZ + 0.12]}
          geometry={new SphereGeometry(0.1, 16, 12)}
        />
        <mesh
          ref={hideInPov}
          material={mats.helmet}
          position={[0, shoulderY + 0.17, shoulderZ + 0.1]}
          scale={[1, 0.75, 1.25]}
          geometry={new SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)}
        />
        {arms.map(({ shoulder, elbow, hand }) => (
          <group key={shoulder.x}>
            <mesh
              material={mats.jersey}
              geometry={unitCylinder}
              ref={(m) => {
                limb(m, shoulder, elbow, 0.045);
                hideInPov(m);
              }}
            />
            <mesh
              material={mats.skin}
              geometry={unitCylinder}
              ref={(m) => {
                limb(m, elbow, hand, 0.035);
                hideInPov(m);
              }}
            />
          </group>
        ))}
      </group>
    </group>
  );
});

/** Layer 1 is not rendered by the POV camera (the head would fill the view). */
const POV_HIDDEN_LAYER = 1;
const hideInPov = (o: Object3D | null) => {
  o?.layers.set(POV_HIDDEN_LAYER);
};

/**
 * Road drop handlebar seen in the POV view: tops, ramps, hoods with brake and
 * shift levers, drops, gloved hands on the hoods and a bike computer.
 */
function DropBar({
  tape,
  hood,
  glove,
  metal,
}: {
  tape: MeshStandardMaterial;
  hood: MeshStandardMaterial;
  glove: MeshStandardMaterial;
  metal: MeshStandardMaterial;
}) {
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const curve = (side: number) => [
    v(side * 0.02, 0.95, 0.46),
    v(side * 0.12, 0.95, 0.46),
    v(side * 0.18, 0.952, 0.49),
    v(side * 0.205, 0.955, 0.53),
    v(side * 0.21, 0.93, 0.6),
    v(side * 0.21, 0.87, 0.625),
    v(side * 0.21, 0.81, 0.6),
    v(side * 0.21, 0.785, 0.53),
    v(side * 0.21, 0.79, 0.43),
  ];
  return (
    <group>
      {[1, -1].flatMap((side) => {
        const pts = curve(side);
        return [
          ...pts.slice(1).map((b, i) => (
            <mesh
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed list of bar segments
              key={`bar${side}${i}`}
              material={tape}
              geometry={unitCylinder}
              ref={(m) => limb(m, pts[i] as Vector3, b, 0.0125)}
            />
          )),
          // Hood: lever body angled up and forward from the ramp.
          <mesh
            key={`hood${side}`}
            material={hood}
            geometry={unitCylinder}
            ref={(m) => limb(m, v(side * 0.205, 0.95, 0.525), v(side * 0.205, 0.99, 0.615), 0.022)}
          />,
          <mesh
            key={`horn${side}`}
            material={hood}
            position={[side * 0.205, 0.995, 0.615]}
            geometry={new SphereGeometry(0.024, 10, 8)}
            scale={[0.85, 1.1, 1]}
          />,
          // Brake lever blade and the shift paddle behind it.
          <mesh
            key={`lever${side}`}
            material={metal}
            geometry={unitCylinder}
            ref={(m) => limb(m, v(side * 0.205, 0.975, 0.62), v(side * 0.212, 0.82, 0.645), 0.009)}
          />,
          <mesh
            key={`paddle${side}`}
            material={hood}
            geometry={unitCylinder}
            ref={(m) => limb(m, v(side * 0.2, 0.96, 0.61), v(side * 0.2, 0.85, 0.625), 0.006)}
          />,
          // Gloved hand wrapped around the hood: palm on top, fingers around the lever.
          <mesh
            key={`hand${side}`}
            material={glove}
            position={[side * 0.207, 0.99, 0.56]}
            rotation={[-0.5, 0, 0]}
            scale={[0.036, 0.026, 0.055]}
            geometry={new SphereGeometry(1, 14, 10)}
          />,
          <mesh
            key={`fingers${side}`}
            material={glove}
            geometry={unitCylinder}
            ref={(m) => limb(m, v(side * 0.2, 0.985, 0.6), v(side * 0.208, 0.945, 0.625), 0.016)}
          />,
          <mesh
            key={`thumb${side}`}
            material={glove}
            geometry={unitCylinder}
            ref={(m) => limb(m, v(side * 0.185, 0.975, 0.53), v(side * 0.19, 0.99, 0.585), 0.012)}
          />,
        ];
      })}
      {/* Stem and bike computer. */}
      <mesh
        material={tape}
        position={[0, 0.95, 0.46]}
        rotation={[0, 0, Math.PI / 2]}
        geometry={new CylinderGeometry(0.016, 0.016, 0.05, 10)}
      />
      <mesh
        material={tape}
        position={[0, 0.968, 0.51]}
        geometry={new BoxGeometry(0.052, 0.016, 0.085)}
      />
      <mesh
        position={[0, 0.977, 0.512]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={new PlaneGeometry(0.042, 0.06)}
      >
        <meshStandardMaterial
          color="#b8c4b0"
          emissive="#4b5a46"
          emissiveIntensity={0.4}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

/** Keeps the animation running even when nobody calls `animate` (preview). */
export function useIdleAnimation(ref: React.RefObject<RiderHandle | null>, cadenceRpm = 85) {
  useFrame((_, delta) => ref.current?.animate(delta, cadenceRpm, 8, 200));
}
