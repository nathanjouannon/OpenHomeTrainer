// The one hub of the application and the physical inputs feeding it.

import { InputHub } from '@hrt/controls';
import { getControls, onControlsChange } from '../store/controls';
import { GamepadPoller } from './gamepad';
import { bindKeyboard } from './keyboard';
import { createObcRegistry } from './obc-device';
import { RemoteLink } from './remote';
import { createZwiftRegistry } from './zwift-device';

export const controlsHub = new InputHub({ profile: getControls().active });

// The active profile can change on the mapping screen at any time.
let lastProfile = getControls().active;
onControlsChange(() => {
  const next = getControls().active;
  if (next !== lastProfile) {
    lastProfile = next;
    controlsHub.setProfile(next);
  }
});

export const gamepads = new GamepadPoller(controlsHub);
export const obcControllers = createObcRegistry(controlsHub);
export const zwiftControllers = createZwiftRegistry(controlsHub);
export const remoteLink = new RemoteLink(controlsHub);

let users = 0;
let stop: (() => void) | null = null;

/**
 * Starts listening to the keyboard and the gamepads. Counted: every screen
 * that needs inputs calls it and the listening stops when the last one leaves.
 */
export function attachInputs(): () => void {
  if (users++ === 0 && typeof window !== 'undefined') {
    const offKeys = bindKeyboard(controlsHub, window);
    gamepads.start();
    remoteLink.resume();
    stop = () => {
      offKeys();
      gamepads.stop();
    };
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--users === 0) {
      stop?.();
      stop = null;
    }
  };
}
