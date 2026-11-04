// Build of the rigged rider (lot 2.10): the Quaternius « Superhero » body is
// much bulkier than a road cyclist, so its measurements are changed at load,
// skeleton and mesh together: narrower shoulders and hips (the joints move),
// slimmer torso, arms and legs. Pure maths on rest-pose vertices; the caller
// moves the bones and recomputes the inverse bind matrices.

import { Vector3 } from 'three';

/** Measurements, as shares or metres. 1 and 0 leave the model as it is. */
export interface Shape {
  /** The shoulder joints (upper arm roots) move towards the spine by this much (m). */
  shoulderShift: number;
  /** The hip joints (thigh roots) move towards the middle by this much (m). */
  hipShift: number;
  /** Width (x) and depth (z) shares of the torso bones, about the spine. */
  torso: Record<string, { x: number; z: number }>;
  /** Share of the cross-section kept by the limb and neck bones, about the bone axis. */
  limbs: Record<string, number>;
}

/** A slim road cyclist from the Superhero body. */
export const CYCLIST_SHAPE: Shape = {
  shoulderShift: 0.04,
  hipShift: 0.026,
  torso: {
    pelvis: { x: 0.88, z: 0.92 },
    spine_01: { x: 0.8, z: 0.86 },
    spine_02: { x: 0.75, z: 0.84 },
    spine_03: { x: 0.75, z: 0.84 },
  },
  limbs: { thigh: 0.84, calf: 0.87, upperarm: 0.8, lowerarm: 0.86, neck_01: 0.88 },
};

const ARM_PARTS = /^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/;
const LEG_PARTS = /^(thigh|calf|foot|ball)/;

/** `thigh_l` → part `thigh`, side +1 (left, +X). */
export function splitBoneName(name: string): { part: string; side: 1 | -1 | 0 } {
  const m = /^(.*)_([lr])$/.exec(name);
  if (!m) return { part: name, side: 0 };
  return { part: m[1] as string, side: m[2] === 'l' ? 1 : -1 };
}

/** How far (m) the bone and everything below it move along X towards the middle. */
export function boneShift(name: string, shape: Shape): number {
  const { part, side } = splitBoneName(name);
  if (side === 0) return 0;
  if (part === 'clavicle') return shape.shoulderShift / 2;
  if (ARM_PARTS.test(part)) return shape.shoulderShift;
  if (LEG_PARTS.test(part)) return shape.hipShift;
  return 0;
}

/** Segment of a bone at rest (joint to next joint), in the rider frame. */
export interface BoneSegment {
  from: Vector3;
  to: Vector3;
}

const delta = new Vector3();
const axis = new Vector3();
const moved = new Vector3();

/** The vertex `p` as moved by one bone's share of the reshaping. */
function viaBone(name: string, p: Vector3, seg: BoneSegment, shape: Shape, out: Vector3): Vector3 {
  const { side } = splitBoneName(name);
  const { part } = splitBoneName(name);
  out.copy(p);
  const torso = shape.torso[name];
  if (torso) {
    out.x *= torso.x;
    out.z = seg.from.z + (p.z - seg.from.z) * torso.z;
    return out;
  }
  const radial = shape.limbs[part];
  if (radial !== undefined) {
    axis.subVectors(seg.to, seg.from);
    const len2 = axis.lengthSq();
    if (len2 > 1e-10) {
      axis.divideScalar(Math.sqrt(len2));
      delta.subVectors(p, seg.from);
      const along = delta.dot(axis);
      // Cross-section scaled about the axis, position along the bone kept.
      out
        .copy(seg.from)
        .addScaledVector(axis, along)
        .addScaledVector(delta.addScaledVector(axis, -along), radial);
    }
  }
  out.x -= side * boneShift(name, shape);
  return out;
}

/**
 * New rest position of a vertex weighted over several bones: the positions
 * given by each bone are blended by the weights (like the skinning itself), so
 * there is no step where the influence of one bone gives way to the next.
 */
export function reshapeVertex(
  p: Vector3,
  influences: readonly { bone: string; weight: number }[],
  segments: ReadonlyMap<string, BoneSegment>,
  shape: Shape,
  out: Vector3,
): Vector3 {
  let total = 0;
  out.set(0, 0, 0);
  for (const { bone, weight } of influences) {
    const seg = segments.get(bone);
    if (weight <= 0 || !seg) continue;
    out.addScaledVector(viaBone(bone, p, seg, shape, moved), weight);
    total += weight;
  }
  return total > 0 ? out.divideScalar(total) : out.copy(p);
}
