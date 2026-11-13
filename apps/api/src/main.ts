import { lanAddresses } from './network';
import { buildServer, DEFAULT_PORT } from './server';

const port = Number(process.env.HRT_API_PORT) || DEFAULT_PORT;
// 0.0.0.0: the phone reaches the relay through the Wi-Fi. It only relays remote
// buttons between rooms, and keeps no data (ADR 0005).
const host = process.env.HRT_API_HOST ?? '0.0.0.0';

const app = await buildServer({ port });
await app.listen({ port, host });
const lan = lanAddresses();
console.log(
  `Relais local : http://localhost:${port}${lan[0] ? `  (téléphone : http://${lan[0]}:${port})` : ''}`,
);
