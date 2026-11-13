import { networkInterfaces } from 'node:os';

/** Private IPv4 addresses of this computer, the ones a phone on the Wi-Fi can reach. */
export function lanAddresses(
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): string[] {
  const found: string[] = [];
  for (const list of Object.values(interfaces)) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal && isPrivate(i.address)) found.push(i.address);
    }
  }
  // Home networks first (192.168.x.x), the common case.
  return found.sort((a, b) => rank(a) - rank(b));
}

export function isPrivate(ip: string): boolean {
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
