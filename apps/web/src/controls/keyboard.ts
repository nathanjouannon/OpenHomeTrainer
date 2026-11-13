import type { InputEvent, InputHub } from '@hrt/controls';

const isTyping = (el: HTMLElement | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');

/** Sends keyboard events to the hub; returns the function that stops listening. */
export function bindKeyboard(hub: InputHub, target: Window): () => void {
  const toEvent = (e: KeyboardEvent, type: InputEvent['type']): InputEvent => ({
    source: 'keyboard',
    deviceId: 'keyboard',
    control: `key:${e.key.toLowerCase()}`,
    type,
    ...(e.repeat ? { repeated: true } : {}),
  });
  const onDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e.target as HTMLElement | null)) return;
    if (hub.handle(toEvent(e, 'press'))) e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => {
    if (isTyping(e.target as HTMLElement | null)) return;
    hub.handle(toEvent(e, 'release'));
  };
  // Keys released while the page had no focus never send their keyup.
  const onBlur = () => hub.releaseAll();
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
    target.removeEventListener('blur', onBlur);
    hub.releaseAll();
  };
}
