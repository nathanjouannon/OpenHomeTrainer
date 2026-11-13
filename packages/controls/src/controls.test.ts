import { describe, expect, it } from 'vitest';
import {
  type ActionSource,
  type ControlAction,
  defaultProfile,
  encodeAppInfo,
  encodeHaptic,
  GamepadTracker,
  type InputEvent,
  InputHub,
  ObcButtonTracker,
  type Profile,
  parseButtonState,
  parseHostMessage,
  parsePhoneMessage,
  parseProfile,
  REMOTE_BUTTONS,
  RemoteButtonTracker,
  type Timers,
  withBinding,
  withoutBinding,
} from './index';

class FakeTimers implements Timers {
  now = 0;
  private id = 0;
  private items = new Map<number, { at: number; fn: () => void; every?: number }>();
  setTimeout(fn: () => void, ms: number) {
    this.items.set(++this.id, { at: this.now + ms, fn });
    return this.id;
  }
  setInterval(fn: () => void, ms: number) {
    this.items.set(++this.id, { at: this.now + ms, fn, every: ms });
    return this.id;
  }
  clearTimeout(h: unknown) {
    this.items.delete(h as number);
  }
  clearInterval(h: unknown) {
    this.items.delete(h as number);
  }
  advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void; every?: number }] | null = null;
      for (const e of this.items) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      const [id, it] = next;
      this.now = it.at;
      if (it.every) it.at += it.every;
      else this.items.delete(id);
      it.fn();
    }
    this.now = end;
  }
}

const ev = (control: string, type: 'press' | 'release', extra: Partial<InputEvent> = {}) =>
  ({ source: 'gamepad', deviceId: 'p0', control, type, ...extra }) satisfies InputEvent;

function setup(bindings: Profile['bindings']) {
  const timers = new FakeTimers();
  const hub = new InputHub({ profile: { id: 't', name: 't', bindings }, timers });
  const log: Array<[ControlAction, ActionSource]> = [];
  for (const a of ['shiftUp', 'pause', 'lap', 'ergUp'] as const) {
    hub.on(a, (s) => log.push([a, s]));
  }
  return { hub, timers, log };
}

describe('InputHub', () => {
  it('fires a press binding once and reports the event as consumed', () => {
    const { hub, log } = setup([
      { source: 'gamepad', control: 'button:5', type: 'press', action: 'shiftUp' },
    ]);
    expect(hub.handle(ev('button:5', 'press'))).toBe(true);
    hub.handle(ev('button:5', 'release'));
    expect(log).toEqual([['shiftUp', 'gamepad']]);
    expect(hub.handle(ev('button:9', 'press'))).toBe(false);
  });

  it('does not consume a key whose action nobody handles', () => {
    const { hub } = setup([
      { source: 'gamepad', control: 'button:1', type: 'press', action: 'cameraNext' },
    ]);
    expect(hub.handle(ev('button:1', 'press'))).toBe(false);
  });

  it('repeats while held, after a delay, and stops on release', () => {
    const { hub, timers, log } = setup([
      { source: 'gamepad', control: 'button:5', type: 'press', action: 'shiftUp', repeatMs: 250 },
    ]);
    hub.handle(ev('button:5', 'press'));
    expect(log).toHaveLength(1);
    timers.advance(399);
    expect(log).toHaveLength(1);
    timers.advance(1 + 250 * 2);
    expect(log).toHaveLength(3);
    hub.handle(ev('button:5', 'release'));
    timers.advance(2000);
    expect(log).toHaveLength(3);
  });

  it('keeps the operating-system key repeat for plain keyboard bindings only', () => {
    const { hub, log } = setup([
      { source: 'keyboard', control: 'key:a', type: 'press', action: 'shiftUp' },
      { source: 'keyboard', control: 'key:b', type: 'press', action: 'ergUp', repeatMs: 250 },
    ]);
    const k = (control: string, repeated = false) =>
      ({ source: 'keyboard', deviceId: 'keyboard', control, type: 'press', repeated }) as const;
    hub.handle(k('key:a'));
    hub.handle(k('key:a', true));
    hub.handle(k('key:b'));
    hub.handle(k('key:b', true));
    expect(log.map((l) => l[0])).toEqual(['shiftUp', 'shiftUp', 'ergUp']);
  });

  it('separates a short press from a long press', () => {
    const { hub, timers, log } = setup([
      { source: 'gamepad', control: 'button:0', type: 'press', action: 'pause' },
      { source: 'gamepad', control: 'button:0', type: 'long_press', action: 'lap' },
    ]);
    hub.handle(ev('button:0', 'press'));
    timers.advance(200);
    hub.handle(ev('button:0', 'release'));
    expect(log).toEqual([['pause', 'gamepad']]);
    hub.handle(ev('button:0', 'press'));
    timers.advance(600);
    expect(log.at(-1)).toEqual(['lap', 'gamepad']);
    hub.handle(ev('button:0', 'release'));
    expect(log).toHaveLength(2);
  });

  it('separates a single tap from a double tap', () => {
    const { hub, timers, log } = setup([
      { source: 'gamepad', control: 'button:0', type: 'press', action: 'pause' },
      { source: 'gamepad', control: 'button:0', type: 'double_press', action: 'lap' },
    ]);
    hub.handle(ev('button:0', 'press'));
    hub.handle(ev('button:0', 'release'));
    expect(log).toHaveLength(0);
    timers.advance(300);
    expect(log).toEqual([['pause', 'gamepad']]);
    hub.handle(ev('button:0', 'press'));
    hub.handle(ev('button:0', 'release'));
    timers.advance(100);
    hub.handle(ev('button:0', 'press'));
    hub.handle(ev('button:0', 'release'));
    timers.advance(1000);
    expect(log).toEqual([
      ['pause', 'gamepad'],
      ['lap', 'gamepad'],
    ]);
  });

  it('captures the next press instead of firing it, and tells every listener', () => {
    const { hub, log } = setup([
      { source: 'gamepad', control: 'button:5', type: 'press', action: 'shiftUp' },
    ]);
    const seen: string[] = [];
    hub.onInput((e) => seen.push(e.control));
    let captured: InputEvent | null = null;
    const stop = hub.capture((e) => {
      captured = e;
    });
    hub.handle(ev('button:5', 'press'));
    expect(captured).toMatchObject({ control: 'button:5' });
    expect(log).toHaveLength(0);
    stop();
    hub.handle(ev('button:5', 'press'));
    expect(log).toHaveLength(1);
    expect(seen).toEqual(['button:5', 'button:5']);
  });

  it('releaseAll stops repeats', () => {
    const { hub, timers, log } = setup([
      { source: 'gamepad', control: 'button:5', type: 'press', action: 'shiftUp', repeatMs: 100 },
    ]);
    hub.handle(ev('button:5', 'press'));
    hub.releaseAll();
    timers.advance(5000);
    expect(log).toHaveLength(1);
  });

  it('dispatch from the interface reaches handlers', () => {
    const { hub, log } = setup([]);
    expect(hub.dispatch('pause')).toBe(true);
    expect(hub.dispatch('camera1')).toBe(false);
    expect(log).toEqual([['pause', 'ui']]);
  });
});

describe('profiles', () => {
  it('default profile has no input bound twice', () => {
    const keys = defaultProfile().bindings.map((b) => `${b.source}|${b.control}|${b.type}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a new binding replaces the one on the same input', () => {
    const p = withBinding(defaultProfile(), {
      source: 'keyboard',
      control: 'key:a',
      type: 'press',
      action: 'lap',
    });
    const a = p.bindings.filter((b) => b.control === 'key:a');
    expect(a).toHaveLength(1);
    expect(a[0]?.action).toBe('lap');
    expect(withoutBinding(p, a[0] as never).bindings.some((b) => b.control === 'key:a')).toBe(
      false,
    );
  });

  it('parseProfile drops malformed bindings and survives a round trip', () => {
    const p = defaultProfile();
    expect(parseProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
    const bad = parseProfile({
      id: 'x',
      name: 'x',
      bindings: [
        { source: 'nope' },
        null,
        { source: 'obc', control: 'button:0x01', type: 'press', action: 'zzz' },
      ],
    });
    expect(bad?.bindings).toEqual([]);
    expect(parseProfile('x')).toBeNull();
  });
});

describe('OpenBikeControl', () => {
  it('decodes button state messages', () => {
    expect(parseButtonState([0x01, 0x01, 0x01, 0x02, 0x00])).toEqual([
      { id: 1, state: 1 },
      { id: 2, state: 0 },
    ]);
    expect(parseButtonState([0x04, 0x01])).toBeNull();
  });

  it('turns notifications into presses and releases, once per change', () => {
    const t = new ObcButtonTracker('dev');
    expect(t.update([0x01, 0x01, 0x01])).toEqual([
      { source: 'obc', deviceId: 'dev', control: 'button:0x01', type: 'press' },
    ]);
    expect(t.update([0x01, 0x01, 0x01])).toEqual([]);
    expect(t.update([0x01, 0x01, 0x00])[0]).toMatchObject({ type: 'release' });
    expect(t.update([0x01, 0x03, 0x05])[0]).toMatchObject({ type: 'press', value: 5 });
  });

  it('keeps the shift and drops the difficulty sent with it', () => {
    const t = new ObcButtonTracker('dev');
    const out = t.update([0x01, 0x01, 0x01, 0x30, 0x01, 0x14, 0x01]);
    expect(out.map((e) => e.control)).toEqual(['button:0x01', 'button:0x14']);
    // Releasing the dropped one produces a release the hub ignores (nothing held).
    const rel = t.update([0x01, 0x01, 0x00, 0x30, 0x00, 0x14, 0x00]);
    expect(rel.every((e) => e.type === 'release')).toBe(true);
  });

  it('difficulty alone is kept; reset releases what is held', () => {
    const t = new ObcButtonTracker('dev');
    expect(t.update([0x01, 0x30, 0x01])).toHaveLength(1);
    expect(t.reset()).toEqual([
      { source: 'obc', deviceId: 'dev', control: 'button:0x30', type: 'release' },
    ]);
  });

  it('encodes App Information like the spec example', () => {
    const bytes = encodeAppInfo('zwift', '1.52.0', [0x01, 0x02, 0x10, 0x14]);
    expect([...bytes]).toEqual([
      0x04, 0x01, 0x05, 0x7a, 0x77, 0x69, 0x66, 0x74, 0x06, 0x31, 0x2e, 0x35, 0x32, 0x2e, 0x30,
      0x04, 0x01, 0x02, 0x10, 0x14,
    ]);
  });

  it('encodes haptic commands like the spec examples', () => {
    expect([...encodeHaptic('short')]).toEqual([0x03, 0x01, 0x00, 0x00]);
    expect([...encodeHaptic('double', 200, 128)]).toEqual([0x03, 0x02, 0x14, 0x80]);
    expect([...encodeHaptic('success', 0, 255)]).toEqual([0x03, 0x05, 0x00, 0xff]);
    expect([...encodeHaptic('stop')]).toEqual([0x03, 0x00, 0x00, 0x00]);
  });
});

describe('GamepadTracker', () => {
  const pad = (...down: boolean[]) => ({
    id: 'Xbox',
    index: 0,
    buttons: down.map((pressed) => ({ pressed, value: pressed ? 1 : 0 })),
  });
  it('reports changes between polls, triggers included', () => {
    const t = new GamepadTracker();
    expect(t.poll([pad(false, false)])).toEqual([]);
    expect(t.poll([pad(false, true)])).toEqual([
      { source: 'gamepad', deviceId: '0:Xbox', control: 'button:1', type: 'press' },
    ]);
    expect(t.poll([pad(false, true)])).toEqual([]);
    expect(t.poll([pad(false, false)])[0]).toMatchObject({ type: 'release' });
    expect(
      t.poll([{ id: 'Xbox', index: 0, buttons: [{ pressed: false, value: 0.8 }] }])[0],
    ).toMatchObject({ control: 'button:0', type: 'press' });
  });
  it('releases what a disconnected pad held, with the same device id', () => {
    const t = new GamepadTracker();
    t.poll([pad(true)]);
    expect(t.poll([])).toEqual([
      { source: 'gamepad', deviceId: '0:Xbox', control: 'button:0', type: 'release' },
    ]);
  });
});

describe('smartphone remote (lot 3.10)', () => {
  it('reads only well-formed phone messages', () => {
    expect(parsePhoneMessage('{"t":"press","b":"shiftUp"}')).toEqual({ t: 'press', b: 'shiftUp' });
    expect(parsePhoneMessage('{"t":"press","b":"format"}')).toBeNull();
    expect(parsePhoneMessage('{"t":"buzz"}')).toBeNull();
    expect(parsePhoneMessage('nope')).toBeNull();
    expect(parsePhoneMessage('[1]')).toBeNull();
  });

  it('every remote button has an action in the default profile', () => {
    const p = defaultProfile();
    for (const b of REMOTE_BUTTONS) {
      expect(p.bindings.some((x) => x.source === 'remote' && x.control === `button:${b}`)).toBe(
        true,
      );
    }
  });

  it('turns a phone press into the bound action and releases it when the phone leaves', () => {
    const hub = new InputHub({ profile: defaultProfile() });
    const seen: string[] = [];
    hub.on('shiftUp', (s) => seen.push(s));
    const tracker = new RemoteButtonTracker();
    for (const e of tracker.update({ t: 'press', b: 'shiftUp', r: 'a' })) hub.handle(e);
    expect(seen).toEqual(['remote']);
    expect(tracker.update({ t: 'press', b: 'shiftUp', r: 'a' })).toEqual([]);
    const released = tracker.update({ t: 'left', r: 'a' });
    expect(released).toHaveLength(1);
    expect(released[0]?.type).toBe('release');
    expect(tracker.reset()).toEqual([]);
  });

  it('parses what the relay sends to the game', () => {
    expect(parseHostMessage('{"t":"left","r":"x"}')).toEqual({ t: 'left', r: 'x' });
    expect(parseHostMessage('{"t":"press","b":"pause"}')).toBeNull();
    expect(parseHostMessage('{"t":"peers","remotes":2}')).toEqual({ t: 'peers', remotes: 2 });
  });
});
