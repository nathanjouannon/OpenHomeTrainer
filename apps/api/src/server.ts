import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { lanAddresses } from './network';
import { type Role, RoomRelay } from './relay';

export const DEFAULT_PORT = 8787;

const here = dirname(fileURLToPath(import.meta.url));

/** Web pages of the game on this computer may ask the relay for its addresses. */
const isLocalOrigin = (origin: string | undefined) =>
  !!origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);

export async function buildServer(
  opts: { port?: number; relay?: RoomRelay; lan?: () => string[] } = {},
): Promise<FastifyInstance> {
  const port = opts.port ?? DEFAULT_PORT;
  const relay = opts.relay ?? new RoomRelay();
  const lan = opts.lan ?? lanAddresses;
  const app = Fastify({ logger: false });
  await app.register(websocket, { options: { maxPayload: 1024 } });

  app.get('/info', async (req, reply) => {
    const origin = req.headers.origin;
    if (isLocalOrigin(origin)) reply.header('access-control-allow-origin', origin as string);
    return { port, lan: lan() };
  });

  // The companion page is plain HTML: the phone needs nothing but this address.
  const page = readFileSync(join(here, '..', 'public', 'remote.html'), 'utf8');
  app.get('/remote', async (_req, reply) => {
    reply.header('cache-control', 'no-store').type('text/html; charset=utf-8');
    return page;
  });

  app.get<{ Querystring: { room?: string; role?: string } }>(
    '/ws',
    { websocket: true },
    (socket, req) => {
      const role: Role = req.query.role === 'host' ? 'host' : 'remote';
      // A game only talks from this computer; phones come from the local network.
      if (role === 'host' && !isLocalOrigin(req.headers.origin)) {
        socket.close(1008, 'forbidden');
        return;
      }
      const joined = relay.join(req.query.room ?? '', role, {
        send: (data) => {
          if (socket.readyState === socket.OPEN) socket.send(data);
        },
        close: () => socket.close(),
      });
      if (!joined) {
        socket.close(1008, 'refused');
        return;
      }
      socket.on('message', (data: Buffer) => joined.onMessage(data.toString('utf8')));
      socket.on('close', joined.leave);
      socket.on('error', joined.leave);
    },
  );

  return app;
}
