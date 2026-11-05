// Geometry shared by the procedural rider and the rigged avatar (lot 2.10).
// Rider frame: +Z forward, +Y up, +X to the rider's left; the origin is on
// the ground between the wheels.

import { Vector3 } from 'three';
import {
  BAR_WIDTH,
  BOTTOM_BRACKET,
  COCKPIT,
  CRANK_LENGTH,
  SADDLE_TOP,
  WHEEL_RADIUS,
} from './bike-geometry';

export const WHEEL_R = WHEEL_RADIUS;
export const CRANK_L = CRANK_LENGTH;
/** Bottom bracket. */
export const BB = new Vector3(0, BOTTOM_BRACKET.y, BOTTOM_BRACKET.z);
/**
 * Hip joints of the avatar, seated (middle point): above the top of the saddle
 * (the pelvis rests on it) and a little ahead of its middle, where the sit
 * bones are.
 */
export const SEAT = { y: SADDLE_TOP.y + 0.06, z: SADDLE_TOP.z + 0.01 } as const;
/** Hip joints of the procedural rider, seated: a little lower and further back than `SEAT`. */
export const HIP_Y = SEAT.y - 0.04;
export const HIP_Z = SEAT.z - 0.05;
/**
 * Where the wrists rest on the hoods (per side, multiplied by ±1 on X): over
 * the lever body, just behind the top of the hoods.
 */
export const WRIST = new Vector3(
  BAR_WIDTH / 1.78,
  COCKPIT.hoodTop.y + 0.02,
  COCKPIT.hoodTop.z - 0.102,
);
/** Direction of the hands (wrist → knuckles) on the hoods. */
export const HAND_DIR = new Vector3(0, -0.28, 1).normalize();

/** Pedal axle of one crank (`side` 1: left, -1: right) at `crankAngle`. */
export function pedalPosition(side: 1 | -1, crankAngle: number, out: Vector3): Vector3 {
  const angle = crankAngle + (side === 1 ? 0 : Math.PI);
  return out.set(side * 0.1, BB.y - Math.cos(angle) * CRANK_L, BB.z - Math.sin(angle) * CRANK_L);
}

const along = new Vector3();
const bend = new Vector3();

/**
 * Middle joint (knee, elbow) of a two-bone chain from `root` to `end`, with
 * bone lengths `l1` and `l2`, bent towards `pole`. The chain is stretched
 * straight when `end` is out of reach.
 */
export function solveTwoBone(
  root: Vector3,
  end: Vector3,
  l1: number,
  l2: number,
  pole: Vector3,
  out: Vector3,
): Vector3 {
  along.subVectors(end, root);
  const dist = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, along.length()));
  along.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // Part of the pole perpendicular to the chain.
  bend.copy(pole).addScaledVector(along, -pole.dot(along));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(along, -along.z);
  bend.normalize();
  return out.copy(root).addScaledVector(along, a).addScaledVector(bend, h);
}
