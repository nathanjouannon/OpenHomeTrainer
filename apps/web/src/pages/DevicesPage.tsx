import type { SensorReading } from '@hrt/devices';
import { useEffect, useState } from 'react';
import { type MessageKey, useT } from '../i18n';
import { navigate } from '../router';
import { deviceHub, ROLES, type Role, useDevices } from '../store/devices';
import { Page } from './common';

const ROLE_LABEL: Record<Role, MessageKey> = {
  trainer: 'devices.trainer',
  heartrate: 'devices.heartrate',
  powermeter: 'devices.powermeter',
};

function useLiveReading(role: Role): SensorReading | null {
  const [r, setR] = useState<SensorReading | null>(null);
  useEffect(() => {
    const id = setInterval(() => setR(deviceHub.lastReading(role)), 250);
    return () => clearInterval(id);
  }, [role]);
  return r;
}

function DeviceCard({ role }: { role: Role }) {
  const t = useT();
  const slot = useDevices()[role];
  const reading = useLiveReading(role);
  const [busy, setBusy] = useState(false);
  const remembered = deviceHub.remembered().find((d) => d.role === role);
  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };
  const connected = slot.device !== null;
  const values = [
    reading?.powerW !== undefined ? `${reading.powerW} W` : null,
    reading?.cadenceRpm !== undefined ? `${Math.round(reading.cadenceRpm)} rpm` : null,
    reading?.heartRateBpm !== undefined ? `${reading.heartRateBpm} bpm` : null,
  ].filter(Boolean);

  return (
    <section className={`device-card status-${slot.status}`}>
      <header>
        <h2>{t(ROLE_LABEL[role])}</h2>
        <span className="status">{t(`devices.status.${slot.status}`)}</span>
      </header>
      <p className="device-name">{slot.device?.name ?? '—'}</p>
      <p className="live">{connected && values.length ? values.join(' · ') : ' '}</p>
      {slot.error && <p className="error">{t(`devices.error.${slot.error}`)}</p>}
      <div className="row">
        {!connected && (
          <>
            {remembered && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => run(() => deviceHub.reconnect(role))}
              >
                {t('devices.reconnect', { name: remembered.name })}
              </button>
            )}
            <button
              type="button"
              className={remembered ? '' : 'primary'}
              disabled={busy || !deviceHub.bluetoothAvailable}
              onClick={() => run(() => deviceHub.connectBluetooth(role))}
            >
              {t('devices.connect')}
            </button>
            {role !== 'powermeter' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => deviceHub.connectSimulated(role))}
              >
                {t('devices.simulated')}
              </button>
            )}
          </>
        )}
        {connected && (
          <button type="button" onClick={() => run(() => deviceHub.disconnect(role))}>
            {t('devices.disconnect')}
          </button>
        )}
        {remembered && (
          <button type="button" className="link" onClick={() => deviceHub.forget(role)}>
            {t('devices.forget')}
          </button>
        )}
      </div>
      {slot.simulated && role === 'trainer' && (
        <p className="muted small">{t('devices.simHint')}</p>
      )}
    </section>
  );
}

export function DevicesPage() {
  const t = useT();
  return (
    <Page title={t('devices.title')}>
      <div className="device-grid">
        {ROLES.map((role) => (
          <DeviceCard key={role} role={role} />
        ))}
      </div>
      <button type="button" className="primary big" onClick={() => navigate('/routes')}>
        {t('devices.continue')} →
      </button>
    </Page>
  );
}
