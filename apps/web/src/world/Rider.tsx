// Cyclist and bike: cranks driven by the cadence, legs by two-bone IK on the
// pedals, wheels turning at the virtual speed. The bike is built by
// `bike-builder.ts` (lot 2.12). The rider is procedural (lot 1.5) unless the
// rigged avatar is available (lot 2.10, `rider-avatar.ts`), which replaces the
// legs, torso, head and arms and is posed on its skeleton.
// Local frame: +Z forward, +Y up, +X to the rider's left.

import { useFrame } from '@react-three/fiber';
import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import {
  type BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  type Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildBike } from './bike-builder';
import { AvatarRig } from './rider-avatar';
import { BB, CRANK_L, HIP_Y, HIP_Z, WHEEL_R, WRIST } from './rider-geometry';

const THIGH_L = 0.44;
const SHIN_L = 0.45;

export interface RiderHandle {
  group: Group | null;
  /** Eyes of the rider in the bike frame (POV camera), null for the procedural rider. */
  eye: Vector3 | null;
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

export const Rider = forwardRef<
  RiderHandle,
  {
    jersey?: string;
    /** Scene of the rigged avatar (lot 2.10); the procedural rider without it. */
    avatar?: Object3D | null;
  }
>(function Rider({ jersey = '#e4572e', avatar = null }, ref) {
  const group = useRef<Group>(null);
  const bike = useMemo(() => buildBike(), []);
  useLayoutEffect(() => () => bike.dispose(), [bike]);
  const legs = {
    lThigh: useRef<Mesh>(null),
    lShin: useRef<Mesh>(null),
    rThigh: useRef<Mesh>(null),
    rShin: useRef<Mesh>(null),
  };
  const torso = useRef<Group>(null);
  const rig = useMemo(() => (avatar ? new AvatarRig(avatar, { jersey }) : null), [avatar, jersey]);
  useLayoutEffect(() => () => rig?.dispose(), [rig]);
  const state = useRef({ crankAngle: 0, wheelAngle: 0, standing: 0 });

  // Shadows: the ~80 parts of the bike and the upper body are merged into one
  // silhouette that only the shadow cameras see (one draw call per cascade);
  // the legs, animated by the pedalling, cast their own shadow.
  // biome-ignore lint/correctness/useExhaustiveDependencies: built once, from the first pose
  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    const legMeshes = new Set(Object.values(legs).map((r) => r.current));
    const animated = new Set<Object3D | null>([...legMeshes, bike.pedals.l, bike.pedals.r]);
    const inRig = (o: Object3D) => {
      for (let p: Object3D | null = o; p; p = p.parent) if (p === rig?.root) return true;
      return false;
    };
    if (rig) {
      for (const o of rig.povHidden) o.traverse(hideInPov);
    }
    const proxy = buildShadowProxy(g, (m) => !animated.has(m) && !inRig(m));
    g.traverse((o) => {
      if (!(o as Mesh).isMesh) return;
      if (inRig(o)) {
        // The avatar casts its own shadow (animated by its skeleton) and does
        // not receive any: its parts would shadow each other.
        o.castShadow = true;
        o.receiveShadow = false;
        return;
      }
      o.castShadow = legMeshes.has(o as Mesh);
      // The POV arms sit inside the silhouette of the hidden upper body: they
      // would shadow themselves.
      o.receiveShadow = o.layers.mask !== 1 << POV_ONLY_LAYER;
    });
    // Fewer draw calls: the parts that never move relative to their group
    // (frame, bars, wheel parts…) are merged per material.
    const merged = mergeStaticParts(g, animated);
    if (proxy) g.add(proxy);
    return () => {
      if (proxy) {
        g.remove(proxy);
        proxy.geometry.dispose();
      }
      for (const m of merged) m.geometry.dispose();
    };
  }, [rig, bike]);

  const mats = useMemo(
    () => ({
      jersey: new MeshStandardMaterial({ color: jersey, roughness: 0.7 }),
      shorts: new MeshStandardMaterial({ color: '#151518', roughness: 0.8 }),
      skin: new MeshStandardMaterial({ color: '#d9a27e', roughness: 0.8 }),
      helmet: new MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.4 }),
      glove: new MeshStandardMaterial({ color: '#202124', roughness: 0.8 }),
    }),
    [jersey],
  );

  useImperativeHandle(ref, () => ({
    get group() {
      return group.current;
    },
    eye: rig?.eye ?? null,
    animate(dtS, cadenceRpm, speedMs, powerW) {
      const s = state.current;
      s.crankAngle += (cadenceRpm / 60) * Math.PI * 2 * dtS;
      s.wheelAngle += (speedMs / WHEEL_R) * dtS;
      // Out of the saddle on hard efforts at low speed (climbing).
      const wantStanding = powerW > 380 && speedMs < 6 ? 1 : 0;
      s.standing += (wantStanding - s.standing) * Math.min(1, dtS * 2);
      bike.setPose(s.crankAngle, s.wheelAngle);
      const lift = s.standing * 0.12;
      const forward = s.standing * 0.12;
      if (rig) {
        rig.pose(s.crankAngle, s.standing);
        return;
      }
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
        const hand = new Vector3(side * WRIST.x, WRIST.y, WRIST.z);
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
      <primitive object={bike.root} />
      {!rig && <PovArms skin={mats.skin} jersey={mats.jersey} glove={mats.glove} />}
      {rig && <primitive object={rig.root} />}
      {/* Legs */}
      {!rig && (
        <>
          <mesh ref={legs.lThigh} material={mats.shorts} geometry={unitCylinder} />
          <mesh ref={legs.rThigh} material={mats.shorts} geometry={unitCylinder} />
          <mesh ref={legs.lShin} material={mats.skin} geometry={unitCylinder} />
          <mesh ref={legs.rShin} material={mats.skin} geometry={unitCylinder} />
        </>
      )}
      {/* Upper body */}
      {!rig && (
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
      )}
    </group>
  );
});

/** Layer 1 is not rendered by the POV camera (the head would fill the view). */
export const POV_HIDDEN_LAYER = 1;
/** Layer 2 is rendered by the POV camera only. */
export const POV_ONLY_LAYER = 2;
/** Layer 3 is rendered by the shadow cameras only (shadow silhouettes). */
export const SHADOW_ONLY_LAYER = 3;

const proxyMaterial = new MeshBasicMaterial();

/**
 * Merges, in every group of `root`, the child meshes that share a material,
 * the camera layers and the shadow flags (except `animated` ones). Returns
 * the merged meshes.
 */
export function mergeStaticParts(root: Object3D, animated: ReadonlySet<Object3D | null>): Mesh[] {
  const out: Mesh[] = [];
  const visit = (group: Object3D) => {
    for (const child of [...group.children]) if (!(child as Mesh).isMesh) visit(child);
    const buckets = new Map<string, Mesh[]>();
    for (const child of group.children) {
      const m = child as Mesh;
      if (!m.isMesh || animated.has(m) || Array.isArray(m.material)) continue;
      if ((m as SkinnedMesh).isSkinnedMesh) continue;
      const key = `${m.material.uuid}|${m.layers.mask}|${m.castShadow}|${m.receiveShadow}`;
      const list = buckets.get(key) ?? [];
      list.push(m);
      buckets.set(key, list);
    }
    for (const meshes of buckets.values()) {
      if (meshes.length < 2) continue;
      // All indexed or all not: `mergeGeometries` needs the same layout.
      const indexed = meshes.every((m) => m.geometry.index);
      const parts = meshes.map((m) => {
        m.updateMatrix();
        const g = m.geometry.index && !indexed ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(m.matrix);
        for (const name of Object.keys(g.attributes)) {
          if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
        }
        return g;
      });
      const geometry = mergeGeometries(parts);
      for (const p of parts) p.dispose();
      const first = meshes[0] as Mesh;
      if (!geometry) continue;
      const merged = new Mesh(geometry, first.material);
      merged.layers.mask = first.layers.mask;
      merged.castShadow = first.castShadow;
      merged.receiveShadow = first.receiveShadow;
      for (const m of meshes) group.remove(m);
      group.add(merged);
      out.push(merged);
    }
  };
  visit(root);
  return out;
}

/**
 * One mesh with the geometry of every part of `root` accepted by `include`
 * (POV-only parts excluded), in the root's frame, on the shadow-only layer.
 */
function buildShadowProxy(root: Object3D, include: (m: Mesh) => boolean): Mesh | null {
  root.updateMatrixWorld(true);
  const toRoot = new Matrix4().copy(root.matrixWorld).invert();
  const parts: BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !include(m) || m.layers.mask === 1 << POV_ONLY_LAYER) return;
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const g = new BufferGeometry();
    g.setAttribute('position', (src.getAttribute('position') as BufferAttribute).clone());
    g.applyMatrix4(new Matrix4().multiplyMatrices(toRoot, m.matrixWorld));
    parts.push(g);
  });
  const merged = parts.length ? mergeGeometries(parts) : null;
  for (const p of parts) p.dispose();
  if (!merged) return null;
  const proxy = new Mesh(merged, proxyMaterial);
  proxy.layers.set(SHADOW_ONLY_LAYER);
  proxy.castShadow = true;
  proxy.frustumCulled = false;
  return proxy;
}
const hideInPov = (o: Object3D | null) => {
  o?.layers.set(POV_HIDDEN_LAYER);
};
const onlyInPov = (o: Object3D | null) => {
  o?.layers.set(POV_ONLY_LAYER);
};

/** Unit cylinder thinner at the far end (b), for forearms. */
const taperedCylinder = new CylinderGeometry(0.72, 1, 1, 10).translate(0, 0.5, 0);

/**
 * Arms seen from the POV camera. The camera sits about where the shoulders
 * are, so the body arms would be cut in the middle of the view. These start
 * from an elbow held low and wide, out of the frame (and beyond the near
 * plane), and the forearms come up from the bottom of the view to the hands
 * on the hoods, like the arms of a first-person game.
 */
function PovArms({
  skin,
  jersey,
  glove,
}: {
  skin: MeshStandardMaterial;
  jersey: MeshStandardMaterial;
  glove: MeshStandardMaterial;
}) {
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  return (
    <group>
      {[1, -1].flatMap((side) => {
        const shoulder = v(side * 0.19, 1.38, 0.16);
        const elbow = v(side * 0.27, 0.95, 0.25);
        const wrist = v(side * WRIST.x, WRIST.y, WRIST.z);
        const sleeveEnd = elbow.clone().lerp(shoulder, 0.45);
        const cuffStart = elbow.clone().lerp(wrist, 0.86);
        return [
          <mesh
            key={`upper${side}`}
            material={skin}
            geometry={unitCylinder}
            ref={(m) => {
              limb(m, elbow, sleeveEnd, 0.042);
              onlyInPov(m);
            }}
          />,
          <mesh
            key={`sleeve${side}`}
            material={jersey}
            geometry={unitCylinder}
            ref={(m) => {
              limb(m, sleeveEnd, shoulder, 0.05);
              onlyInPov(m);
            }}
          />,
          <mesh
            key={`elbow${side}`}
            material={skin}
            position={elbow.toArray()}
            geometry={new SphereGeometry(0.042, 10, 8)}
            ref={onlyInPov}
          />,
          <mesh
            key={`forearm${side}`}
            material={skin}
            geometry={taperedCylinder}
            ref={(m) => {
              limb(m, elbow, wrist, 0.04);
              onlyInPov(m);
            }}
          />,
          // Glove cuff over the wrist, joining the forearm to the hand.
          <mesh
            key={`cuff${side}`}
            material={glove}
            geometry={unitCylinder}
            ref={(m) => {
              limb(m, cuffStart, wrist.clone().lerp(elbow, -0.06), 0.031);
              onlyInPov(m);
            }}
          />,
        ];
      })}
    </group>
  );
}

/** Keeps the animation running even when nobody calls `animate` (preview). */
export function useIdleAnimation(ref: React.RefObject<RiderHandle | null>, cadenceRpm = 85) {
  useFrame((_, delta) => ref.current?.animate(delta, cadenceRpm, 8, 200));
}
