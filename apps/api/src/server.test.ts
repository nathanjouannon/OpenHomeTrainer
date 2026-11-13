import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { buildServer } from './server';

const ROOM = 'c'.repeat(32);
let base = '';
let close: () => Promise<unknown>;

beforeAll(async () => {
  const app = await buildServer({ lan: () => ['192.168.1.9'] });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = () => app.close();
});
afterAll(() => close());

const open = (url: string, origin?: string) =>
  new Promise<{ ws: WebSocket; msgs: unknown[]; code: Promise<number> }>((resolve) => {
    const ws = new WebSocket(url, origin ? { origin } : undefined);
    const msgs: unknown[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
    const code = new Promise<number>((r) => ws.on('close', (c) => r(c)));
    ws.on('open', () => resolve({ ws, msgs, code }));
    ws.on('error', () => resolve({ ws, msgs, code }));
  });

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('server', () => {
  it('answers /info with the LAN addresses for local pages only', async () => {
    const ok = await fetch(`http://${base}/info`, { headers: { origin: 'http://localhost:5173' } });
    expect(await ok.json()).toMatchObject({ lan: ['192.168.1.9'] });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const other = await fetch(`http://${base}/info`, {
      headers: { origin: 'http://evil.example' },
    });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('serves the companion page', async () => {
    const res = await fetch(`http://${base}/remote?r=${ROOM}`);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('data-b="shiftUp"');
  });

  it('relays a phone press to the game over real sockets', async () => {
    const game = await open(`ws://${base}/ws?role=host&room=${ROOM}`, 'http://localhost:5173');
    const phone = await open(`ws://${base}/ws?role=remote&room=${ROOM}`);
    phone.ws.send('{"t":"press","b":"pause"}');
    await wait();
    expect(game.msgs).toContainEqual(expect.objectContaining({ t: 'press', b: 'pause' }));
    game.ws.send('{"t":"buzz"}');
    await wait();
    expect(phone.msgs).toContainEqual({ t: 'buzz' });
    game.ws.close();
    phone.ws.close();
  });

  it('refuses a game that does not come from this computer, and bad rooms', async () => {
    const stranger = await open(`ws://${base}/ws?role=host&room=${ROOM}`, 'http://evil.example');
    expect(await stranger.code).toBe(1008);
    const bad = await open(`ws://${base}/ws?role=remote&room=nope`);
    expect(await bad.code).toBe(1008);
  });
});
