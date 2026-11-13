import { describe, expect, it } from 'vitest';
import { isPrivate, lanAddresses } from './network';
import { RoomRelay } from './relay';

const ROOM = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);

const peer = () => {
  const got: unknown[] = [];
  return { got, send: (d: string) => got.push(JSON.parse(d)), close: () => {} };
};

describe('RoomRelay', () => {
  it('forwards a phone press to the game of its room only', () => {
    const relay = new RoomRelay();
    const game = peer();
    const elsewhere = peer();
    const phone = peer();
    relay.join(ROOM, 'host', game);
    relay.join(OTHER, 'host', elsewhere);
    const p = relay.join(ROOM, 'remote', phone);
    p?.onMessage('{"t":"press","b":"shiftUp"}');
    expect(game.got).toContainEqual({ t: 'press', b: 'shiftUp', r: p?.id });
    expect(elsewhere.got.some((m) => (m as { t: string }).t === 'press')).toBe(false);
  });

  it('forwards the game buzz to the phones', () => {
    const relay = new RoomRelay();
    const game = relay.join(ROOM, 'host', peer());
    const phone = peer();
    relay.join(ROOM, 'remote', phone);
    game?.onMessage('{"t":"buzz"}');
    expect(phone.got).toContainEqual({ t: 'buzz' });
  });

  it('drops malformed or oversized messages and unknown buttons', () => {
    const relay = new RoomRelay();
    const game = peer();
    relay.join(ROOM, 'host', game);
    const p = relay.join(ROOM, 'remote', peer());
    p?.onMessage('{"t":"press","b":"rm -rf"}');
    p?.onMessage('x'.repeat(300));
    p?.onMessage('{"t":"press","b":"pause","r":"spoof"}');
    const presses = game.got.filter((m) => (m as { t: string }).t === 'press') as { r: string }[];
    // The identity comes from the relay, never from the phone.
    expect(presses).toHaveLength(1);
    expect(presses[0]?.r).toBe(p?.id);
  });

  it('tells the game when a phone leaves, and counts peers', () => {
    const relay = new RoomRelay();
    const game = peer();
    relay.join(ROOM, 'host', game);
    const p = relay.join(ROOM, 'remote', peer());
    expect(game.got).toContainEqual({ t: 'peers', remotes: 1 });
    p?.leave();
    expect(game.got).toContainEqual({ t: 'left', r: p?.id });
    expect(game.got).toContainEqual({ t: 'peers', remotes: 0 });
  });

  it('refuses bad room ids and too many rooms, and frees empty rooms', () => {
    const relay = new RoomRelay({ maxRooms: 1 });
    expect(relay.join('short', 'host', peer())).toBeNull();
    const a = relay.join(ROOM, 'host', peer());
    expect(relay.join(OTHER, 'host', peer())).toBeNull();
    a?.leave();
    expect(relay.roomCount).toBe(0);
    expect(relay.join(OTHER, 'host', peer())).not.toBeNull();
  });
});

describe('network', () => {
  it('keeps private IPv4 only, home networks first', () => {
    expect(isPrivate('192.168.1.20')).toBe(true);
    expect(isPrivate('172.20.0.1')).toBe(true);
    expect(isPrivate('172.40.0.1')).toBe(false);
    expect(isPrivate('8.8.8.8')).toBe(false);
    const mk = (address: string, internal = false) => ({
      address,
      family: 'IPv4' as const,
      internal,
      netmask: '',
      mac: '',
      cidr: null,
    });
    expect(
      lanAddresses({
        a: [mk('10.0.0.5'), mk('127.0.0.1', true)],
        b: [mk('192.168.1.9'), mk('8.8.8.8')],
      }),
    ).toEqual(['192.168.1.9', '10.0.0.5']);
  });
});
