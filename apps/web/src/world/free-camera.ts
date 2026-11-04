// Free camera (dev mode): pose maths, keyboard movement, and the text that
// goes with a screenshot so that a problem can be found again exactly.
//
// Coordinates are those of the world data (route frame): x east, y north,
// z altitude in metres. The scene frame is (x, z - base, -y), see `toScene`.
// Yaw is a compass bearing in degrees (0 = north, 90 = east); pitch is in
// degrees, positive looking up.

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
}

export const FREE_CAMERA_FOV = 62;
export const PITCH_LIMIT_DEG = 89;
export const FREE_SPEED_RANGE_MS = [1, 2000] as const;
export const FREE_SPEED_DEFAULT_MS = 20;

const DEG = Math.PI / 180;

export const wrapYaw = (deg: number) => ((deg % 360) + 360) % 360;
export const clampPitch = (deg: number) =>
  Math.max(-PITCH_LIMIT_DEG, Math.min(PITCH_LIMIT_DEG, deg));

/** Scene position to world position. */
export const sceneToWorld = (sx: number, sy: number, sz: number, base: number) => ({
  x: sx,
  y: -sz,
  z: sy + base,
});

/** World position to scene position. */
export const worldToScene = (pose: Pick<CameraPose, 'x' | 'y' | 'z'>, base: number) => ({
  x: pose.x,
  y: pose.z - base,
  z: -pose.y,
});

/** Unit view direction in the scene frame. */
export function viewDirection(yawDeg: number, pitchDeg: number) {
  const yaw = yawDeg * DEG;
  const pitch = pitchDeg * DEG;
  return {
    x: Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}

/** Yaw and pitch of a scene-frame view direction. */
export function directionToAngles(d: { x: number; y: number; z: number }) {
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  return {
    yawDeg: wrapYaw(Math.atan2(d.x, -d.z) / DEG),
    pitchDeg: clampPitch(Math.asin(d.y / len) / DEG),
  };
}

export interface MoveKeys {
  forward: number;
  right: number;
  up: number;
}

/** Moves `pose` for `dtS` seconds: horizontal along the view, vertical along the world's up. */
export function movePose(
  pose: CameraPose,
  keys: MoveKeys,
  speedMs: number,
  dtS: number,
): CameraPose {
  const yaw = pose.yawDeg * DEG;
  // Forward on the ground plane (pitch ignored, like a walk): world x east, y north.
  const fx = Math.sin(yaw);
  const fy = Math.cos(yaw);
  const step = speedMs * dtS;
  return {
    ...pose,
    x: pose.x + (fx * keys.forward + fy * keys.right) * step,
    y: pose.y + (fy * keys.forward - fx * keys.right) * step,
    z: pose.z + keys.up * step,
  };
}

/** Keys by physical position (`KeyboardEvent.code`): ZQSD on AZERTY, WASD on QWERTY. */
export function moveKeysFromCodes(down: ReadonlySet<string>): MoveKeys {
  const axis = (plus: string[], minus: string[]) =>
    (plus.some((c) => down.has(c)) ? 1 : 0) - (minus.some((c) => down.has(c)) ? 1 : 0);
  return {
    forward: axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']),
    right: axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']),
    up: axis(['Space'], ['ShiftLeft', 'ShiftRight']),
  };
}

/** Codes the free camera uses (and keeps away from the ride shortcuts). */
export const FREE_CAMERA_CODES: readonly string[] = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight',
];

export const clampSpeed = (ms: number) =>
  Math.max(FREE_SPEED_RANGE_MS[0], Math.min(FREE_SPEED_RANGE_MS[1], ms));

const r = (v: number, digits: number) => v.toFixed(digits);

/** URL value, `x,y,z,yaw,pitch`: what `?cam=` takes. */
export function poseToParam(p: CameraPose): string {
  return [r(p.x, 1), r(p.y, 1), r(p.z, 1), r(p.yawDeg, 1), r(p.pitchDeg, 1)].join(',');
}

export function parsePoseParam(raw: string | null): CameraPose | null {
  if (!raw) return null;
  const v = raw.split(',').map(Number);
  if (v.length !== 5 || v.some((n) => !Number.isFinite(n))) return null;
  const [x = 0, y = 0, z = 0, yaw = 0, pitch = 0] = v;
  return { x, y, z, yawDeg: wrapYaw(yaw), pitchDeg: clampPitch(pitch) };
}

export interface PoseContext {
  worldId: string;
  routeId: string;
  quality: string;
  backend: string | null;
}

/** The link that puts the free camera back at `pose`, from the current page URL. */
export function poseUrl(href: string, pose: CameraPose): string {
  const [base = '', hash = ''] = href.split('#');
  const [path = '', search = ''] = hash.split('?');
  const query = new URLSearchParams(search);
  query.delete('at');
  query.set('camera', 'free');
  query.set('cam', poseToParam(pose));
  return `${base}#${path}?${query.toString().replace(/%2C/g, ',')}`;
}

/** Text to paste next to a screenshot: readable first line, replay link second. */
export function poseReport(pose: CameraPose, ctx: PoseContext, href: string): string {
  const where = `x=${r(pose.x, 1)} y=${r(pose.y, 1)} z=${r(pose.z, 1)} m · cap ${r(pose.yawDeg, 1)}° · pitch ${r(pose.pitchDeg, 1)}° · fov ${FREE_CAMERA_FOV}°`;
  const setup = `${ctx.worldId}/${ctx.routeId} · qualité ${ctx.quality}${ctx.backend ? ` · ${ctx.backend}` : ''}`;
  return `${where}\n${setup}\n${poseUrl(href, pose)}`;
}
