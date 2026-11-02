/** Serializable rider state, reused later for ghosts and multiplayer. */
export interface RiderState {
  /** Simulation time since the start of the ride, in seconds. */
  timeS: number;
  /** Total distance ridden, in meters (keeps growing across laps). */
  distanceM: number;
  speedMs: number;
  powerW: number;
  cadenceRpm: number;
  heartRateBpm: number | null;
  /** Simulated (real) grade at the rider position, in percent. */
  gradePercent: number;
}

export const initialRiderState = (): RiderState => ({
  timeS: 0,
  distanceM: 0,
  speedMs: 0,
  powerW: 0,
  cadenceRpm: 0,
  heartRateBpm: null,
  gradePercent: 0,
});
