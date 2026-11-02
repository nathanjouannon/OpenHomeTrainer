import type { RideHeader } from '@hrt/recorder';
import { useEffect, useState } from 'react';
import { formatDuration, formatter } from '../format';
import { useT } from '../i18n';
import { navigate } from '../router';
import { deviceHub, ROLES, useDevices } from '../store/devices';
import { rideStore } from '../store/rides';
import { useSettings } from '../store/settings';
import { formatDate, useLocalized } from './common';

export function HomePage() {
  const t = useT();
  const settings = useSettings();
  const f = formatter(settings.units, settings.language);
  const loc = useLocalized();
  const slots = useDevices();
  const [rides, setRides] = useState<RideHeader[] | null>(null);

  useEffect(() => {
    void rideStore
      .listHeaders()
      .then(setRides)
      .catch(() => setRides([]));
  }, []);

  const last = rides?.find((r) => r.status === 'finished');
  const unfinished = rides?.find((r) => r.status === 'recording');
  const connected = ROLES.filter((r) => slots[r].status === 'connected');

  return (
    <main className="page home">
      <header className="hero">
        <h1>HomeRealTrainer</h1>
        <p className="muted">{t('app.tagline')}</p>
      </header>
      {!deviceHub.bluetoothAvailable && <p className="notice warn">{t('home.noBluetooth')}</p>}
      {unfinished && (
        <p className="notice">
          {t('home.unfinished')} <a href={`#/rides/${unfinished.id}`}>{t('home.recover')}</a>
        </p>
      )}
      <button
        type="button"
        className="primary big"
        onClick={() => navigate(deviceHub.hasPowerSource ? '/routes' : '/devices')}
      >
        {t('home.ride')}
      </button>
      <nav className="cards">
        <a href="#/devices">
          <strong>{t('home.devices')}</strong>
          <span>
            {connected.length
              ? connected.map((r) => slots[r].device?.name).join(', ')
              : t('devices.status.disconnected')}
          </span>
        </a>
        <a href="#/rides">
          <strong>{t('home.history')}</strong>
          <span>
            {last
              ? `${t('home.lastRide')} : ${formatDate(last.startedAt, settings.language)} · ${last.route ? loc(last.route.name) : ''} · ${f.distance(last.distanceM)} ${f.distanceUnit} · ${formatDuration(last.durationS)}`
              : t('home.noRide')}
          </span>
        </a>
        <a href="#/settings">
          <strong>{t('home.settings')}</strong>
          <span>
            {settings.profile.weightKg} kg · FTP {settings.profile.ftpW ?? '?'} W ·{' '}
            {Math.round(settings.difficulty * 100)} %
          </span>
        </a>
      </nav>
      <details className="dev-tools">
        <summary>{t('home.devTools')}</summary>
        <ul>
          <li>
            <a href="#/ble">Spike Bluetooth (FTMS, journal des trames)</a>
          </li>
          <li>
            <a href="#/3d">Spike 3D (mesure des FPS)</a>
          </li>
        </ul>
      </details>
    </main>
  );
}
