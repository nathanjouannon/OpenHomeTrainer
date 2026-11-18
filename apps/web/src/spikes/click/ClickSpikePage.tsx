// Lot 3.11 spike: look at what a Zwift Click exposes over Web Bluetooth, without
// going through Zwift. Diagnostic only: it lists services and characteristics,
// subscribes to every notification and logs the raw bytes, and can send the
// plain "RideOn" greeting the community documents. It does NOT try to get past
// any unlock or encryption (docs/11 §4: no circumvention of an authentication).
// UUIDs and the greeting come from community notes, from memory: unverified.

import { useRef, useState } from 'react';

const ZWIFT_COMPANY_ID = 0x094a;
// Candidates, to confirm on the real device (the listing below shows what is there).
const ZWIFT_PLAY_SERVICE = '00000001-19ca-4651-86e5-fa29dcdd09d1';
// 0xFC82: suspected service of the newer Zwift controllers (from memory, unverified).
const ZWIFT_V2_SERVICE = '0000fc82-0000-1000-8000-00805f9b34fb';
const KNOWN_SERVICES = [
  ZWIFT_PLAY_SERVICE,
  ZWIFT_V2_SERVICE,
  'battery_service',
  'device_information',
  'generic_access',
];
const RIDE_ON = new TextEncoder().encode('RideOn');

const hex = (dv: DataView) =>
  [...new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');

/** Button message seen on the Click: 0x23 0x08 <varint>, a bit at 0 means pressed. */
function pressedBits(dv: DataView): number[] | null {
  if (dv.byteLength < 3 || dv.getUint8(0) !== 0x23 || dv.getUint8(1) !== 0x08) return null;
  let value = 0;
  for (let i = 2, shift = 0; i < dv.byteLength; i++, shift += 7) {
    const b = dv.getUint8(i);
    value += (b & 0x7f) * 2 ** shift;
    if (!(b & 0x80)) break;
  }
  const mask = ~value >>> 0;
  return Array.from({ length: 32 }, (_, bit) => bit).filter((bit) => (mask >>> bit) & 1);
}

const stamp = () => new Date().toISOString().slice(11, 23);
const bluetoothAvailable = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export function ClickSpikePage() {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const chars = useRef<BluetoothRemoteGATTCharacteristic[]>([]);
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const lastPressed = useRef('');

  const log = (s: string) => setLines((l) => [...l.slice(-399), `${stamp()}  ${s}`]);

  const connect = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Zwift' },
          { manufacturerData: [{ companyIdentifier: ZWIFT_COMPANY_ID }] },
        ],
        optionalServices: KNOWN_SERVICES,
      });
      deviceRef.current = device;
      device.addEventListener('gattserverdisconnected', () => {
        setConnected(false);
        log('déconnecté par l’appareil');
      });
      log(`appareil : ${device.name ?? '?'} (${device.id})`);
      const server = await device.gatt?.connect();
      if (!server) throw new Error('pas de serveur GATT');
      setConnected(true);
      chars.current = [];
      for (const service of await server.getPrimaryServices()) {
        log(`service ${service.uuid}`);
        for (const c of await service.getCharacteristics()) {
          const p = c.properties;
          const props = (['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'] as const)
            .filter((k) => p[k])
            .join(',');
          log(`  caractéristique ${c.uuid} [${props}]`);
          if (p.read) {
            try {
              log(`    lecture : ${hex(await c.readValue())}`);
            } catch (e) {
              log(`    lecture refusée : ${(e as Error).message}`);
            }
          }
          if (p.notify || p.indicate) {
            c.addEventListener('characteristicvaluechanged', () => {
              if (!c.value) return;
              const bits = pressedBits(c.value);
              if (!bits) {
                log(`<< ${c.uuid.slice(0, 8)}  ${hex(c.value)}`);
                return;
              }
              // The Click repeats the same state about every 100 ms: log changes only.
              const key = bits.join(',');
              if (key === lastPressed.current) return;
              lastPressed.current = key;
              log(
                bits.length
                  ? `BOUTON appuyé : bit(s) ${key}  (${hex(c.value)})`
                  : `BOUTON relâché  (${hex(c.value)})`,
              );
            });
            try {
              await c.startNotifications();
              chars.current.push(c);
              log('    abonné');
            } catch (e) {
              log(`    abonnement refusé : ${(e as Error).message}`);
            }
          }
        }
      }
      log('prêt : appuie sur les boutons du Click et observe les messages');
    } catch (e) {
      log(`échec : ${(e as Error).message}`);
    }
  };

  const greet = async () => {
    const server = deviceRef.current?.gatt;
    if (!server?.connected) return;
    try {
      let sent = false;
      for (const service of await server.getPrimaryServices()) {
        for (const c of await service.getCharacteristics()) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            await c.writeValueWithoutResponse(RIDE_ON);
            log(`>> RideOn envoyé à ${c.uuid}`);
            sent = true;
          }
        }
      }
      if (!sent) log('aucune caractéristique en écriture : rien à envoyer');
    } catch (e) {
      log(`RideOn impossible : ${(e as Error).message}`);
    }
  };

  const disconnect = () => deviceRef.current?.gatt?.disconnect();

  if (!bluetoothAvailable) {
    return <p className="page">Web Bluetooth indisponible : utiliser Chrome ou Edge.</p>;
  }

  return (
    <main className="page">
      <h1>Spike Zwift Click (lot 3.11)</h1>
      <p className="muted">
        Diagnostic seulement. Allume le Click (appuie sur un bouton), ferme Zwift et BikeControl
        s’ils sont ouverts (un seul appareil peut s’y connecter), puis connecte.
      </p>
      <p>
        <button type="button" onClick={connect} disabled={connected}>
          Connecter
        </button>{' '}
        <button type="button" onClick={greet} disabled={!connected}>
          Envoyer « RideOn »
        </button>{' '}
        <button type="button" onClick={disconnect} disabled={!connected}>
          Déconnecter
        </button>{' '}
        <button type="button" onClick={() => navigator.clipboard.writeText(lines.join('\n'))}>
          Copier le journal
        </button>
      </p>
      <pre style={{ maxHeight: '60vh', overflow: 'auto', fontSize: 12 }}>{lines.join('\n')}</pre>
    </main>
  );
}
