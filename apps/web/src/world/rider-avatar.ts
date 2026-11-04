// Rigged rider (lot 2.10): the Quaternius « Universal Base Characters » body
// (CC0) in cycling kit, posed on the bike by IK on its skeleton.
//
// Everything is computed in the rider frame (+Z forward, +Y up, +X left) from
// the local transforms of the bones, so the rider can move in the scene
// without any world matrix being needed here.

import {
  type Bone,
  BufferAttribute,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RGBAFormat,
  type SkinnedMesh,
  SphereGeometry,
  UnsignedByteType,
  Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { type Garment, garmentOf, hemDistances, rasterizeGarmentMask } from './avatar-garments';
import { createAvatarMaterial } from './avatar-material';
import { HAND_DIR, HIP_Y, HIP_Z, pedalPosition, solveTwoBone, WRIST } from './rider-geometry';

const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);

/** Share of the forward lean taken by each bone of the spine. */
const LEAN_SHARES: readonly [string, number][] = [
  ['pelvis', 0.3],
  ['spine_01', 0.25],
  ['spine_02', 0.25],
  ['spine_03', 0.2],
];
/** Pitch of the head once the neck has compensated the lean (looking slightly down). */
const HEAD_PITCH = 0.17;
/** Roll (rad) of the hands about the forearm: thumbs up and in on the hoods. */
const HAND_ROLL = 1.0;
/** Finger flexion (rad) by phalanx, thumb included, for the grip on the hoods. */
const FINGER_CURL = [0.75, 1.0, 0.7];
/** Rest height of the eyes above the head bone, and ahead of it. */
const EYE_OFFSET = new Vector3(0, 0.105, 0.095);
/** Foot pitch (rad, toes down) at the top of the pedal stroke and its swing. */
const FOOT_PITCH = 0.08;
const FOOT_SWING = 0.12;
/** Height of the ball of the foot above the pedal axle. */
const BALL_ABOVE_PEDAL = 0.03;

export interface Kit {
  jersey: string;
}

/** How far (m) each garment stands off the skin. */
const CLOTH_OFFSET: Record<Garment, number> = {
  skin: 0,
  jersey: 0.008,
  shorts: 0.006,
  socks: 0.003,
  shoes: 0.008,
  gloves: 0.004,
};

/** Side (px) of the garment mask. */
const MASK_SIZE = 1024;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class AvatarRig {
  /** Put this in the rider group. */
  readonly root = new Group();
  readonly meshes: SkinnedMesh[] = [];
  /** Parts the POV camera must not see (it sits inside the head). */
  readonly povHidden: Object3D[] = [];
  /** Eyes, in the rider frame, seated. */
  readonly eye = new Vector3();

  private readonly bones = new Map<string, Bone>();
  private readonly restQ = new Map<Bone, Quaternion>();
  private readonly restP = new Map<Bone, Vector3>();
  /** Orientation of every bone at rest, in the rider frame. */
  private readonly restRider = new Map<Bone, Quaternion>();
  private readonly aimAxis = new Map<Bone, Vector3>();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly eyeLocal = new Vector3();
  private readonly legs: { l: LegBones; r: LegBones };
  private readonly arms: { l: ArmBones; r: ArmBones };
  private readonly hipRest: Vector3;
  private readonly shoulderRest: Vector3;
  private readonly footToBall: Vector3;

  // Scratch values.
  private readonly m = new Matrix4();
  private readonly q1 = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly v3 = new Vector3();
  private readonly v4 = new Vector3();

  constructor(asset: Object3D, kit: Kit) {
    const scene = cloneSkinned(asset);
    this.root.add(scene);
    this.root.updateMatrixWorld(true);

    scene.traverse((o) => {
      if ((o as Bone).isBone) this.bones.set(o.name, o as Bone);
    });
    for (const bone of this.bones.values()) {
      this.restQ.set(bone, bone.quaternion.clone());
      this.restP.set(bone, bone.position.clone());
      this.restRider.set(bone, this.riderQuat(bone, new Quaternion()));
      const child = bone.children.find((c) => (c as Bone).isBone);
      if (child && child.position.lengthSq() > 1e-8) {
        this.aimAxis.set(bone, child.position.clone().normalize());
      }
    }
    const bone = (name: string) => {
      const b = this.bones.get(name);
      if (!b) throw new Error(`Avatar: bone ${name} missing`);
      return b;
    };

    this.dress(scene, kit);
    this.curlFingers();
    this.addHelmet(bone('Head'));

    this.legs = { l: legBones(bone, 'l'), r: legBones(bone, 'r') };
    this.arms = { l: armBones(bone, 'l'), r: armBones(bone, 'r') };
    this.hipRest = this.restMid(this.legs.l.thigh, this.legs.r.thigh);
    this.shoulderRest = this.restMid(this.arms.l.upper, this.arms.r.upper);
    this.footToBall = this.restPos(this.legs.l.ball).sub(this.restPos(this.legs.l.foot));
    this.eyeLocal
      .copy(EYE_OFFSET)
      .applyQuaternion(this.q1.copy(this.restRider.get(bone('Head')) as Quaternion).invert());

    this.pose(0, 0);
    this.eye.copy(this.headEye());
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }

  /**
   * Poses the rider: crank angle (rad) and `standing` (0 seated, 1 out of
   * the saddle).
   */
  pose(crankAngle: number, standing: number) {
    for (const [b, q] of this.restQ) {
      b.quaternion.copy(q);
      b.position.copy(this.restP.get(b) as Vector3);
      b.updateMatrix();
    }
    const lift = standing * 0.12;
    const forward = standing * 0.12;
    const hip = new Vector3(0, HIP_Y + lift, HIP_Z + forward);

    // Torso: leaning as far as the arms need to reach the hoods. The pelvis
    // turns first and is then placed on the saddle; the spine follows.
    const lean = this.leanFor(hip) - standing * 0.1;
    LEAN_SHARES.forEach(([name, share], i) => {
      this.rotateAboutX(this.bone(name), lean * share);
      if (i === 0) this.placePelvis(hip);
    });
    this.rotateAboutAxis(this.bone('spine_02'), Z, Math.sin(crankAngle) * (0.02 + standing * 0.08));
    const compensation = -(lean - HEAD_PITCH) / 2;
    this.rotateAboutX(this.bone('neck_01'), compensation);
    this.rotateAboutX(this.bone('Head'), compensation);

    for (const side of [1, -1] as const) {
      this.poseLeg(side === 1 ? this.legs.l : this.legs.r, side, crankAngle);
      this.poseArm(side === 1 ? this.arms.l : this.arms.r, side);
    }
  }

  // --- legs and arms ---

  private poseLeg(leg: LegBones, side: 1 | -1, crankAngle: number) {
    const angle = crankAngle + (side === 1 ? 0 : Math.PI);
    const pedal = pedalPosition(side, crankAngle, this.v1);
    const pitch = FOOT_PITCH + FOOT_SWING * Math.sin(angle);
    // Ankle so that the ball of the (flat, then pitched) foot sits on the pedal.
    const ankle = this.v2
      .copy(this.footToBall)
      .applyAxisAngle(X, pitch)
      .negate()
      .add(pedal)
      .add(this.v3.set(0, BALL_ABOVE_PEDAL, 0));
    const hip = this.riderPos(leg.thigh, this.v3);
    const l1 = leg.calf.position.length();
    const l2 = leg.foot.position.length();
    const knee = solveTwoBone(hip, ankle, l1, l2, this.v4.set(-side * 0.12, 0, 1), new Vector3());
    this.aim(leg.thigh, knee.clone().sub(hip));
    this.aim(leg.calf, ankle.clone().sub(knee));
    this.setRiderQuat(
      leg.foot,
      this.q2.setFromAxisAngle(X, pitch).multiply(this.restRider.get(leg.foot) as Quaternion),
    );
  }

  private poseArm(arm: ArmBones, side: 1 | -1) {
    const shoulder = this.riderPos(arm.upper, new Vector3());
    const wrist = new Vector3(side * WRIST.x, WRIST.y, WRIST.z);
    const l1 = arm.lower.position.length();
    const l2 = arm.hand.position.length();
    const elbow = solveTwoBone(
      shoulder,
      wrist,
      l1,
      l2,
      this.v4.set(side * 0.5, -0.7, 0),
      new Vector3(),
    );
    // Road bar: the palm faces inward, not down as on a flat bar. The forearm
    // takes half of the roll so that the wrist is not wrung.
    const roll = -side * HAND_ROLL;
    const forearm = wrist.clone().sub(elbow).normalize();
    this.aim(arm.upper, elbow.clone().sub(shoulder));
    this.aim(arm.lower, forearm);
    this.rotateAboutAxis(arm.lower, forearm, roll / 2);
    this.aim(arm.hand, HAND_DIR);
    this.rotateAboutAxis(arm.hand, HAND_DIR, roll / 2);
  }

  /** Forward lean (rad) putting the shoulders at 93 % of the arms' reach from the hoods. */
  private leanFor(hip: Vector3): number {
    const reach = (0.93 * (this.armLength(this.arms.l) + this.armLength(this.arms.r))) / 2;
    const dy = this.shoulderRest.y - this.hipRest.y;
    const dz = this.shoulderRest.z - this.hipRest.z;
    const dx = this.shoulderRest.x;
    const missing = (lean: number) => {
      const y = hip.y + dy * Math.cos(lean) - dz * Math.sin(lean);
      const z = hip.z + dy * Math.sin(lean) + dz * Math.cos(lean);
      return Math.hypot(WRIST.x - dx, WRIST.y - y, WRIST.z - z) - reach;
    };
    // The further the torso leans, the closer the shoulders get to the hoods.
    let lo = 0.2;
    let hi = 1.2;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (missing(mid) > 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  private armLength(arm: ArmBones): number {
    return arm.lower.position.length() + arm.hand.position.length();
  }

  /** Moves the pelvis so that the middle of the hip joints is at `hip`. */
  private placePelvis(hip: Vector3) {
    const pelvis = this.bone('pelvis');
    const mid = this.v2
      .copy(this.riderPos(this.legs.l.thigh, this.v3))
      .add(this.riderPos(this.legs.r.thigh, this.v4))
      .multiplyScalar(0.5);
    const delta = this.v3.copy(hip).sub(mid);
    const parentQ = this.riderQuat(pelvis.parent as Object3D, this.q1).invert();
    pelvis.position.add(delta.applyQuaternion(parentQ));
    pelvis.updateMatrix();
  }

  private headEye(): Vector3 {
    const head = this.bone('Head');
    return this.riderPos(head, new Vector3()).add(
      this.eyeLocal.clone().applyQuaternion(this.riderQuat(head, this.q1)),
    );
  }

  // --- building ---

  /** Splits the body into one skinned mesh per garment, sharing the vertices and the skeleton. */
  private dress(scene: Object3D, kit: Kit) {
    const skinned: SkinnedMesh[] = [];
    scene.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh);
    });
    skinned.sort(
      (a, b) =>
        b.geometry.getAttribute('position').count - a.geometry.getAttribute('position').count,
    );
    const body = skinned[0];
    if (!body) throw new Error('Avatar: no skinned body');
    for (const m of skinned.slice(1)) {
      m.frustumCulled = false;
      this.meshes.push(m);
      if (/eye|brow/i.test(m.name)) this.povHidden.push(m);
    }

    // Own copy of the geometry: the cloth is inflated and gets its trim attribute.
    const geometry = body.geometry.clone();
    body.geometry = geometry;
    this.disposables.push(geometry);
    const position = geometry.getAttribute('position');
    const skinIndex = geometry.getAttribute('skinIndex');
    const skinWeight = geometry.getAttribute('skinWeight');
    const index = geometry.getIndex();
    if (!index) throw new Error('Avatar: body without index');
    const bones = body.skeleton.bones;
    const garments: Garment[] = [];
    const kitAttribute = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      let best = 0;
      let weight = -1;
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w > weight) {
          weight = w;
          best = skinIndex.getComponent(i, k);
        }
      }
      const bone = bones[best] as Bone;
      const t = this.alongBone(bone, this.v1.fromBufferAttribute(position, i));
      garments.push(garmentOf(bone.name, t, position.getY(i)));
      const hem = hemDistances(bone.name, t, position.getY(i));
      kitAttribute.set([hem.jersey, hem.shorts, position.getY(i)], i * 3);
    }
    geometry.setAttribute('kit', new BufferAttribute(kitAttribute, 3));
    // Cloth stands a little off the skin (vertex by vertex: it fades out at the edges).
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i++) {
      const off = CLOTH_OFFSET[garments[i] as Garment];
      if (off) {
        position.setXYZ(
          i,
          position.getX(i) + normal.getX(i) * off,
          position.getY(i) + normal.getY(i) * off,
          position.getZ(i) + normal.getZ(i) * off,
        );
      }
    }
    position.needsUpdate = true;

    // One body, one material: the garments come from a mask in UV space.
    const mask = new DataTexture(
      rasterizeGarmentMask(geometry.getAttribute('uv').array, index.array, garments, MASK_SIZE),
      MASK_SIZE,
      MASK_SIZE,
      RGBAFormat,
      UnsignedByteType,
    );
    mask.magFilter = LinearFilter;
    mask.minFilter = LinearMipmapLinearFilter;
    mask.generateMipmaps = true;
    mask.needsUpdate = true;
    const material = createAvatarMaterial(body.material as MeshStandardMaterial, mask, {
      jersey: kit.jersey,
      jerseyTrim: '#f4f4f2',
      shorts: '#151518',
      shortsTrim: '#4a4b50',
      white: '#ececee',
      sole: '#2a2a2d',
      gloves: '#202124',
    });
    this.disposables.push(mask, material);
    body.material = material;
    body.frustumCulled = false;
    this.meshes.push(body);
  }

  /** Position of rest point `p` along `bone`, 0 at its joint and 1 at its first child. */
  private alongBone(bone: Bone, p: Vector3): number {
    const child = bone.children.find((c) => (c as Bone).isBone);
    if (!child) return 0.5;
    const from = this.restPos(bone);
    const axis = this.restPos(child as Bone).sub(from);
    const len2 = axis.lengthSq();
    return len2 < 1e-10 ? 0.5 : clamp01(p.sub(from).dot(axis) / len2);
  }

  /** Fingers wrapped round the hoods, thumb included. */
  private curlFingers() {
    for (const side of ['l', 'r'] as const) {
      // Flexion turns the fingers (along ±X at rest) towards the palm, down.
      const flexion = side === 'l' ? -1 : 1;
      for (const finger of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
        FINGER_CURL.forEach((curl, i) => {
          const b = this.bones.get(`${finger}_0${i + 1}_${side}`);
          if (!b) return;
          // The thumb closes across the palm (about the vertical at rest), the fingers
          // curl down towards it.
          const thumb = finger === 'thumb';
          const amount = thumb ? curl * 0.7 : curl;
          const around = thumb
            ? new Vector3(0, -flexion, flexion * 0.35).normalize()
            : Z.clone().multiplyScalar(flexion);
          const axis = around.applyQuaternion(
            (this.restRider.get(b) as Quaternion).clone().invert(),
          );
          const q = new Quaternion().setFromAxisAngle(axis, amount);
          b.quaternion.multiply(q);
          this.restQ.set(b, b.quaternion.clone());
          b.updateMatrix();
        });
      }
    }
  }

  /** Helmet on the head bone, aligned with the rider frame. */
  private addHelmet(head: Bone) {
    const helmet = new Group();
    const q = (this.restRider.get(head) as Quaternion).clone().invert();
    helmet.quaternion.copy(q);
    helmet.position.copy(new Vector3(0, 0.085, 0.03).applyQuaternion(q));
    const geometry = new SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2 + 0.25);
    const material = new MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.4 });
    const shell = new Mesh(geometry, material);
    shell.scale.set(0.125, 0.125, 0.155);
    helmet.add(shell);
    head.add(helmet);
    this.disposables.push(geometry, material);
    this.povHidden.push(helmet);
  }

  // --- bone maths in the rider frame ---

  private bone(name: string): Bone {
    return this.bones.get(name) as Bone;
  }

  private chain(o: Object3D, out: Matrix4): Matrix4 {
    out.identity();
    for (let p: Object3D | null = o; p && p !== this.root; p = p.parent) out.premultiply(p.matrix);
    return out;
  }

  private riderPos(o: Object3D, out: Vector3): Vector3 {
    return out.setFromMatrixPosition(this.chain(o, this.m));
  }

  private riderQuat(o: Object3D, out: Quaternion): Quaternion {
    out.identity();
    for (let p: Object3D | null = o; p && p !== this.root; p = p.parent)
      out.premultiply(p.quaternion);
    return out;
  }

  private restPos(bone: Bone): Vector3 {
    // Bones keep their rest transform until `pose` runs, so this is exact in the constructor only.
    return this.riderPos(bone, new Vector3());
  }

  private restMid(a: Bone, b: Bone): Vector3 {
    return this.restPos(a).add(this.restPos(b)).multiplyScalar(0.5);
  }

  private setRiderQuat(bone: Bone, q: Quaternion) {
    const parent = this.riderQuat(bone.parent as Object3D, this.q1).invert();
    bone.quaternion.copy(parent.multiply(q));
    bone.updateMatrix();
  }

  /** Turns `bone` (swing only) so that its axis points along `dir`. */
  private aim(bone: Bone, dir: Vector3) {
    const axis = this.aimAxis.get(bone);
    if (!axis) return;
    const q = this.riderQuat(bone, new Quaternion());
    const current = axis.clone().applyQuaternion(q);
    const swing = new Quaternion().setFromUnitVectors(current, dir.clone().normalize());
    this.setRiderQuat(bone, swing.multiply(q));
  }

  private rotateAboutX(bone: Bone, angle: number) {
    this.rotateAboutAxis(bone, X, angle);
  }

  private rotateAboutAxis(bone: Bone, axis: Vector3, angle: number) {
    const q = this.riderQuat(bone, new Quaternion());
    this.setRiderQuat(bone, new Quaternion().setFromAxisAngle(axis, angle).multiply(q));
  }
}

interface LegBones {
  thigh: Bone;
  calf: Bone;
  foot: Bone;
  ball: Bone;
}
interface ArmBones {
  upper: Bone;
  lower: Bone;
  hand: Bone;
}

const legBones = (bone: (n: string) => Bone, s: 'l' | 'r'): LegBones => ({
  thigh: bone(`thigh_${s}`),
  calf: bone(`calf_${s}`),
  foot: bone(`foot_${s}`),
  ball: bone(`ball_${s}`),
});
const armBones = (bone: (n: string) => Bone, s: 'l' | 'r'): ArmBones => ({
  upper: bone(`upperarm_${s}`),
  lower: bone(`lowerarm_${s}`),
  hand: bone(`hand_${s}`),
});
