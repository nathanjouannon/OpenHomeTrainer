// Actions the rider can trigger from any input (docs/15 §4.2). Only the ones
// the game implements today are listed; the hub never knows what they do.

export const ACTION_CATEGORIES = {
  transmission: ['shiftUp', 'shiftDown', 'shiftFrontUp', 'shiftFrontDown'],
  training: [
    'ergToggle',
    'ergUp',
    'ergDown',
    'ergUp10',
    'ergDown10',
    'intervalNext',
    'intervalPrev',
  ],
  ride: ['pause', 'pauseOn', 'resume', 'lap'],
  camera: ['camera1', 'camera2', 'camera3', 'camera4', 'cameraNext', 'cameraPrev', 'cameraFree'],
  interface: ['toggleHud', 'fullscreen'],
  simulation: ['simPowerUp', 'simPowerDown'],
} as const;

export type ActionCategory = keyof typeof ACTION_CATEGORIES;

export type ControlAction = (typeof ACTION_CATEGORIES)[ActionCategory][number];

export const ALL_ACTIONS: readonly ControlAction[] = Object.values(ACTION_CATEGORIES).flat();

export const isControlAction = (v: unknown): v is ControlAction =>
  typeof v === 'string' && (ALL_ACTIONS as readonly string[]).includes(v);

/** Actions that make sense to repeat while a button stays pressed. */
export const REPEATABLE_ACTIONS: ReadonlySet<ControlAction> = new Set([
  'shiftUp',
  'shiftDown',
  'ergUp',
  'ergDown',
  'ergUp10',
  'ergDown10',
  'simPowerUp',
  'simPowerDown',
]);
