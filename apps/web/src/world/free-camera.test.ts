import { describe, expect, it } from 'vitest';
import {
  type CameraPose,
  clampPitch,
  directionToAngles,
  FREE_CAMERA_CLEARANCE_M,
  keepAboveGround,
  moveKeysFromCodes,
  movePose,
  parsePoseParam,
  poseReport,
  poseToParam,
  poseUrl,
  sceneToWorld,
  viewDirection,
  worldToScene,
  wrapYaw,
} from './free-camera';

const pose: CameraPose = { x: 100, y: 200, z: 300, yawDeg: 0, pitchDeg: 0 };

describe('free camera maths', () => {
  it('converts between scene and world frames', () => {
    const s = worldToScene(pose, 50);
    expect(s).toEqual({ x: 100, y: 250, z: -200 });
    expect(sceneToWorld(s.x, s.y, s.z, 50)).toEqual({ x: 100, y: 200, z: 300 });
  });

  it('looks north at yaw 0 and east at yaw 90', () => {
    const n = viewDirection(0, 0);
    expect(n.z).toBeCloseTo(-1); // scene -z is world north
    const e = viewDirection(90, 0);
    expect(e.x).toBeCloseTo(1);
  });

  it('round-trips angles and directions', () => {
    const a = directionToAngles(viewDirection(215, -30));
    expect(a.yawDeg).toBeCloseTo(215);
    expect(a.pitchDeg).toBeCloseTo(-30);
  });

  it('wraps yaw and clamps pitch', () => {
    expect(wrapYaw(-10)).toBeCloseTo(350);
    expect(wrapYaw(370)).toBeCloseTo(10);
    expect(clampPitch(120)).toBe(89);
  });

  it('moves along the heading, ignoring pitch', () => {
    const north = movePose({ ...pose, pitchDeg: 60 }, { forward: 1, right: 0, up: 0 }, 10, 1);
    expect(north.y).toBeCloseTo(210);
    expect(north.z).toBe(300);
    const east = movePose({ ...pose, yawDeg: 90 }, { forward: 1, right: 0, up: 0 }, 10, 1);
    expect(east.x).toBeCloseTo(110);
    // Right of a north-facing camera is east.
    const right = movePose(pose, { forward: 0, right: 1, up: 0 }, 10, 1);
    expect(right.x).toBeCloseTo(110);
    expect(movePose(pose, { forward: 0, right: 0, up: -1 }, 10, 1).z).toBe(290);
  });

  it('reads keys by physical position', () => {
    expect(moveKeysFromCodes(new Set(['KeyW', 'KeyA', 'Space']))).toEqual({
      forward: 1,
      right: -1,
      up: 1,
    });
    expect(moveKeysFromCodes(new Set(['KeyW', 'KeyS']))).toEqual({ forward: 0, right: 0, up: 0 });
  });
});

describe('pose in text', () => {
  it('round-trips through the URL parameter', () => {
    const p = { x: 12.3, y: -45.6, z: 789, yawDeg: 270.5, pitchDeg: -12.5 };
    expect(parsePoseParam(poseToParam(p))).toEqual(p);
    expect(parsePoseParam('1,2,3')).toBeNull();
    expect(parsePoseParam('a,b,c,d,e')).toBeNull();
    expect(parsePoseParam(null)).toBeNull();
  });

  it('builds a replay link that keeps the ride and drops the offset', () => {
    const url = poseUrl(
      'http://localhost:5173/#/ride/world-1/boucle-du-lac?goal=laps:1&at=500',
      pose,
    );
    expect(url).toBe(
      'http://localhost:5173/#/ride/world-1/boucle-du-lac?goal=laps%3A1&camera=free&cam=100.0,200.0,300.0,0.0,0.0',
    );
  });

  it('reports position, setup and link', () => {
    const text = poseReport(
      pose,
      { worldId: 'world-1', routeId: 'r', quality: 'high', backend: 'WebGPU' },
      'http://x/#/ride/world-1/r',
    );
    expect(text.split('\n')).toHaveLength(3);
    expect(text).toContain('x=100.0 y=200.0 z=300.0');
    expect(text).toContain('WebGPU');
  });
});

describe('keepAboveGround', () => {
  it('lifts the camera out of the ground, leaves it alone above', () => {
    const low = { ...pose, z: 485.9 };
    expect(keepAboveGround(low, 491.3).z).toBeCloseTo(491.3 + FREE_CAMERA_CLEARANCE_M, 6);
    expect(keepAboveGround(low, 480)).toBe(low);
  });
});
