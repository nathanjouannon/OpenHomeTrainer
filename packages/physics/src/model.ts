// Cycling physics model (see docs/04-moteur-physique.md).
// Pure and deterministic: same inputs always give the same outputs.

export const GRAVITY_MS2 = 9.81;
export const SEA_LEVEL_AIR_DENSITY = 1.225;
/** Floor speed used for the propulsive force, to avoid dividing by zero. */
export const MIN_PROPULSION_SPEED_MS = 0.5;
/** Safety cap (90 km/h). */
export const MAX_SPEED_MS = 25;
/** Fixed simulation step (20 Hz). */
export const DEFAULT_DT_S = 0.05;

export interface RiderParams {
  massKg: number;
  bikeMassKg: number;
  /** Drag area Cd·A, in m². */
  cda: number;
  /** Rolling resistance coefficient. */
  crr: number;
  drivetrainEfficiency: number;
  /** Extra mass accounting for wheel inertia (only affects acceleration). */
  wheelInertiaKg: number;
}

export interface PhysicsInput {
  powerW: number;
  gradePercent: number;
  airDensity: number;
  /** Drag reduction from drafting, 0 (alone) to ~0.4 (in a bunch). */
  draftFactor: number;
  /** Headwind is positive, tailwind negative. */
  windSpeedMs?: number;
}

export const DEFAULT_RIDER_PARAMS: Readonly<RiderParams> = {
  massKg: 75,
  bikeMassKg: 8,
  cda: 0.32,
  crr: 0.004,
  drivetrainEfficiency: 0.97,
  wheelInertiaKg: 1.5,
};

export const airDensityAtAltitude = (altitudeM: number): number =>
  SEA_LEVEL_AIR_DENSITY * Math.exp(-altitudeM / 8500);

/** Sum of the forces opposing motion at speed `speedMs` (gravity, rolling, aero), in N. */
export function resistiveForceN(speedMs: number, input: PhysicsInput, params: RiderParams): number {
  const mass = params.massKg + params.bikeMassKg;
  const theta = Math.atan(input.gradePercent / 100);
  const gravity = mass * GRAVITY_MS2 * Math.sin(theta);
  const rolling = params.crr * mass * GRAVITY_MS2 * Math.cos(theta);
  const airSpeed = speedMs + (input.windSpeedMs ?? 0);
  const aero =
    0.5 * input.airDensity * params.cda * (1 - input.draftFactor) * airSpeed * Math.abs(airSpeed);
  return gravity + rolling + aero;
}

/** Net acceleration at the given speed, in m/s². */
export function accelerationMs2(speedMs: number, input: PhysicsInput, params: RiderParams): number {
  const propulsion =
    (params.drivetrainEfficiency * Math.max(0, input.powerW)) /
    Math.max(speedMs, MIN_PROPULSION_SPEED_MS);
  const effectiveMass = params.massKg + params.bikeMassKg + params.wheelInertiaKg;
  return (propulsion - resistiveForceN(speedMs, input, params)) / effectiveMass;
}

/** Advances the speed by one step (semi-implicit Euler). Never negative, capped at MAX_SPEED_MS. */
export function step(
  speedMs: number,
  input: PhysicsInput,
  params: RiderParams,
  dt: number = DEFAULT_DT_S,
): number {
  const next = speedMs + accelerationMs2(speedMs, input, params) * dt;
  return Math.min(MAX_SPEED_MS, Math.max(0, next));
}

export interface PhysicsState {
  speedMs: number;
  distanceM: number;
}

/** Advances speed and distance by one step. */
export function simulateStep(
  state: PhysicsState,
  input: PhysicsInput,
  params: RiderParams,
  dt: number = DEFAULT_DT_S,
): PhysicsState {
  const speedMs = step(state.speedMs, input, params, dt);
  return { speedMs, distanceM: state.distanceM + speedMs * dt };
}

/**
 * Reference solver: steady-state speed where propulsion equals resistance,
 * found by bisection. Independent from the integrator, used to validate it.
 */
export function steadyStateSpeed(input: PhysicsInput, params: RiderParams): number {
  const propulsivePower = params.drivetrainEfficiency * Math.max(0, input.powerW);
  // Net force is strictly decreasing with speed, so bisection is safe.
  const netForce = (v: number) => propulsivePower / v - resistiveForceN(v, input, params);
  let lo = 1e-9;
  let hi = 200;
  if (netForce(lo) <= 0) return 0;
  if (netForce(hi) >= 0) return hi;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (netForce(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
