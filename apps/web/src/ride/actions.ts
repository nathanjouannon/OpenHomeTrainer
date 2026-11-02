// Every ride action goes through this dispatcher, even from the keyboard,
// so that the controls hub of phase 2 (gamepad, phone, OpenBikeControl) plugs
// in without rework (docs/ROADMAP.md, "ce qu'on prépare tôt").

export type RideAction =
  | 'pause'
  | 'shiftUp'
  | 'shiftDown'
  | 'camera1'
  | 'camera2'
  | 'camera3'
  | 'camera4'
  | 'cameraNext'
  | 'toggleHud'
  | 'lap'
  | 'fullscreen'
  | 'simPowerUp'
  | 'simPowerDown';

/** Default keyboard map (docs/09 §5). Keys are `KeyboardEvent.key`, lower-cased. */
export const DEFAULT_KEYMAP: Readonly<Record<string, RideAction>> = {
  ' ': 'pause',
  a: 'shiftDown',
  z: 'shiftUp',
  '-': 'shiftDown',
  '+': 'shiftUp',
  '=': 'shiftUp',
  '1': 'camera1',
  '2': 'camera2',
  '3': 'camera3',
  '4': 'camera4',
  c: 'cameraNext',
  h: 'toggleHud',
  l: 'lap',
  f: 'fullscreen',
  arrowup: 'simPowerUp',
  arrowdown: 'simPowerDown',
};

export type ActionSource = 'keyboard' | 'ui' | 'test';

export class ActionDispatcher {
  private readonly handlers = new Map<RideAction, Set<(source: ActionSource) => void>>();

  on(action: RideAction, handler: (source: ActionSource) => void): () => void {
    const set = this.handlers.get(action) ?? new Set();
    set.add(handler);
    this.handlers.set(action, set);
    return () => set.delete(handler);
  }

  dispatch(action: RideAction, source: ActionSource = 'ui'): boolean {
    const set = this.handlers.get(action);
    if (!set || set.size === 0) return false;
    for (const h of set) h(source);
    return true;
  }

  /** Listens to the keyboard; returns the function that stops listening. */
  bindKeyboard(target: Window, keymap: Readonly<Record<string, RideAction>> = DEFAULT_KEYMAP) {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
        return;
      }
      const action = keymap[e.key.toLowerCase()];
      if (action && this.dispatch(action, 'keyboard')) e.preventDefault();
    };
    target.addEventListener('keydown', onKey);
    return () => target.removeEventListener('keydown', onKey);
  }
}
