import { type ControlAction, isControlAction } from './actions';
import type { Binding, BindingType, InputSource, Profile } from './events';

const SOURCES: readonly InputSource[] = ['keyboard', 'gamepad', 'obc', 'zwift', 'remote'];
const TYPES: readonly BindingType[] = ['press', 'long_press', 'double_press'];
const SHIFT_REPEAT_MS = 250;

const k = (control: string, action: ControlAction): Binding => ({
  source: 'keyboard',
  control: `key:${control}`,
  type: 'press',
  action,
});

/** Same table as the keyboard of phase 1 (docs/09 §5), plus clickers and media keys. */
const KEYBOARD: Binding[] = [
  k(' ', 'pause'),
  k('a', 'shiftDown'),
  k('z', 'shiftUp'),
  k('-', 'shiftDown'),
  k('+', 'shiftUp'),
  k('=', 'shiftUp'),
  k('q', 'shiftFrontDown'),
  k('s', 'shiftFrontUp'),
  k('1', 'camera1'),
  k('2', 'camera2'),
  k('3', 'camera3'),
  k('4', 'camera4'),
  k('c', 'cameraNext'),
  k('g', 'cameraFree'),
  k('h', 'toggleHud'),
  k('l', 'lap'),
  k('e', 'ergToggle'),
  k('n', 'intervalNext'),
  k('b', 'intervalPrev'),
  k(']', 'ergUp'),
  k('[', 'ergDown'),
  k('f', 'fullscreen'),
  k('arrowup', 'simPowerUp'),
  k('arrowdown', 'simPowerDown'),
  // Presentation clickers and remotes paired with the system arrive as keys.
  k('pagedown', 'shiftUp'),
  k('pageup', 'shiftDown'),
  k('mediatracknext', 'shiftUp'),
  k('mediatrackprevious', 'shiftDown'),
  k('mediaplaypause', 'pause'),
];

const pad = (index: number, action: ControlAction, repeat = false): Binding => ({
  source: 'gamepad',
  control: `button:${index}`,
  type: 'press',
  action,
  ...(repeat ? { repeatMs: SHIFT_REPEAT_MS } : {}),
});

/** Standard gamepad layout (Xbox, PlayStation, 8BitDo in standard mode). */
const GAMEPAD: Binding[] = [
  pad(5, 'shiftUp', true), // RB
  pad(4, 'shiftDown', true), // LB
  pad(7, 'shiftFrontUp'), // RT
  pad(6, 'shiftFrontDown'), // LT
  pad(12, 'ergUp', true), // d-pad up
  pad(13, 'ergDown', true), // d-pad down
  pad(15, 'cameraNext'), // d-pad right
  pad(14, 'cameraPrev'), // d-pad left
  pad(0, 'pause'), // A / cross
  pad(1, 'lap'), // B / circle
  pad(2, 'intervalNext'), // X / square
  pad(3, 'ergToggle'), // Y / triangle
  pad(9, 'pause'), // start
  pad(8, 'toggleHud'), // back
];

const obc = (id: number, action: ControlAction, repeat = false): Binding => ({
  source: 'obc',
  control: `button:0x${id.toString(16).padStart(2, '0')}`,
  type: 'press',
  action,
  ...(repeat ? { repeatMs: SHIFT_REPEAT_MS } : {}),
});

/** Standard OpenBikeControl button ids (spec PROTOCOL.md). */
const OBC: Binding[] = [
  obc(0x01, 'shiftUp'),
  obc(0x02, 'shiftDown'),
  obc(0x30, 'ergUp'),
  obc(0x31, 'ergDown'),
  obc(0x32, 'intervalNext'),
  obc(0x36, 'intervalPrev'),
  obc(0x33, 'pauseOn'),
  obc(0x34, 'resume'),
  obc(0x35, 'lap'),
  obc(0x3c, 'ergToggle'),
  obc(0x40, 'cameraNext'),
  obc(0x44, 'toggleHud'),
];

/** OpenBikeControl button ids the game announces in App Information. */
export const OBC_SUPPORTED_BUTTONS: readonly number[] = [
  0x01, 0x02, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x3c, 0x40, 0x44,
];

const zw = (button: string, action: ControlAction, repeat = false): Binding => ({
  source: 'zwift',
  control: `button:${button}`,
  type: 'press',
  action,
  ...(repeat ? { repeatMs: SHIFT_REPEAT_MS } : {}),
});

/** Zwift Click v2 pair (docs/15 §1.4): right unit shifts up, left unit shifts down. */
const ZWIFT: Binding[] = [
  zw('plus', 'shiftUp', true),
  zw('minus', 'shiftDown', true),
  zw('up', 'ergUp', true),
  zw('down', 'ergDown', true),
  zw('right', 'cameraNext'),
  zw('left', 'cameraPrev'),
  zw('a', 'pause'),
  zw('b', 'lap'),
  zw('y', 'intervalNext'),
  zw('z', 'ergToggle'),
];

const rem = (button: string, action: ControlAction, repeat = false): Binding => ({
  source: 'remote',
  control: `button:${button}`,
  type: 'press',
  action,
  ...(repeat ? { repeatMs: SHIFT_REPEAT_MS } : {}),
});

/** Buttons of the smartphone companion page (lot 3.10); the names match REMOTE_BUTTONS. */
const REMOTE: Binding[] = [
  rem('shiftUp', 'shiftUp', true),
  rem('shiftDown', 'shiftDown', true),
  rem('shiftFrontUp', 'shiftFrontUp'),
  rem('shiftFrontDown', 'shiftFrontDown'),
  rem('ergUp', 'ergUp', true),
  rem('ergDown', 'ergDown', true),
  rem('pause', 'pause'),
  rem('cameraNext', 'cameraNext'),
  rem('lap', 'lap'),
  rem('intervalNext', 'intervalNext'),
];

export const DEFAULT_PROFILE_ID = 'default';

export function defaultProfile(): Profile {
  return {
    id: DEFAULT_PROFILE_ID,
    name: 'Default',
    bindings: [...KEYBOARD, ...GAMEPAD, ...OBC, ...ZWIFT, ...REMOTE].map((b) => ({ ...b })),
  };
}

export const sameInput = (a: Binding, b: Binding) =>
  a.source === b.source && a.control === b.control && a.type === b.type;

/** Adds a binding; the same input (source, control, type) can only do one action. */
export function withBinding(profile: Profile, binding: Binding): Profile {
  return {
    ...profile,
    bindings: [...profile.bindings.filter((b) => !sameInput(b, binding)), binding],
  };
}

export function withoutBinding(profile: Profile, binding: Binding): Profile {
  return { ...profile, bindings: profile.bindings.filter((b) => !sameInput(b, binding)) };
}

export const bindingsFor = (profile: Profile, action: ControlAction): Binding[] =>
  profile.bindings.filter((b) => b.action === action);

/** Reads a profile from untrusted JSON; drops malformed bindings. */
export function parseProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || !Array.isArray(o.bindings)) {
    return null;
  }
  const bindings: Binding[] = [];
  for (const b of o.bindings as unknown[]) {
    if (!b || typeof b !== 'object') continue;
    const x = b as Record<string, unknown>;
    if (
      !SOURCES.includes(x.source as InputSource) ||
      typeof x.control !== 'string' ||
      !TYPES.includes(x.type as BindingType) ||
      !isControlAction(x.action)
    ) {
      continue;
    }
    const repeatMs =
      typeof x.repeatMs === 'number' && x.repeatMs >= 50 && x.repeatMs <= 2000
        ? x.repeatMs
        : undefined;
    bindings.push({
      source: x.source as InputSource,
      control: x.control,
      type: x.type as BindingType,
      action: x.action,
      ...(repeatMs ? { repeatMs } : {}),
    });
  }
  return { id: o.id, name: o.name, bindings };
}
