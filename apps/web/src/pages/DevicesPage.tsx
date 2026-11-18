import type { DeviceStatus, SensorReading } from '@hrt/devices';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { zwiftControllers } from '../controls/runtime';
import { type MessageKey, useT } from '../i18n';
import { navigate } from '../router';
import { Icon } from '../shell/icons';
import { deviceHub, ROLES, type Role, useDevices } from '../store/devices';
import { Page } from './common';

const ROLE_LABEL: Record<Role, MessageKey> = {
  trainer: 'devices.trainer',
  heartrate: 'devices.heartrate',
  powermeter: 'devices.powermeter',
};

const STATUS_DOT: Record<DeviceStatus, string> = {
  connected: 'dot--ok',
  connecting: 'dot--info dot--pulse',
  reconnecting: 'dot--warn dot--pulse',
  disconnected: '',
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

  const dot = STATUS_DOT[slot.status];
  const big = reading?.powerW ?? reading?.heartRateBpm;
  const bigUnit = reading?.powerW !== undefined ? 'W' : 'bpm';
  return (
    <section className="card stack" style={{ gap: 14 }}>
      <div className="card__head">
        <div className="row" style={{ gap: 14 }}>
          <span className="card__icon">
            <Icon name="devices" size={30} />
          </span>
          <h2 className="t-h2" style={{ fontSize: 28 }}>
            {t(ROLE_LABEL[role])}
          </h2>
        </div>
        <span className="chip">
          <span className={`dot ${dot}`} />
          {t(`devices.status.${slot.status}`)}
        </span>
      </div>
      <span className={slot.device ? 't-small t-0' : 't-hint'}>{slot.device?.name ?? '—'}</span>
      {connected && big !== undefined ? (
        <div className="num" style={{ font: '700 64px/1 var(--font-num)' }}>
          {big}
          <small style={{ font: '600 20px var(--font-ui)', color: 'var(--text-1)', marginLeft: 8 }}>
            {bigUnit}
          </small>
          {values.length > 1 && (
            <span className="t-small" style={{ marginLeft: 16 }}>
              {values.slice(1).join(' · ')}
            </span>
          )}
        </div>
      ) : (
        <div style={{ height: 64 }} />
      )}
      {slot.error && (
        <div className="field__error">
          <span aria-hidden="true">✕</span> {t(`devices.error.${slot.error}`)}
        </div>
      )}
      {slot.simulated && role === 'trainer' && (
        <span className="t-small">{t('devices.simHint')}</span>
      )}
      <div className="row" style={{ marginTop: 'auto', flexWrap: 'wrap' }}>
        {!connected && (
          <>
            {remembered && (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={busy}
                onClick={() => run(() => deviceHub.reconnect(role))}
              >
                {t('devices.reconnect', { name: remembered.name })}
              </button>
            )}
            <button
              type="button"
              className={`btn btn--sm ${remembered ? 'btn--secondary' : 'btn--primary'}`}
              disabled={busy || !deviceHub.bluetoothAvailable}
              onClick={() => run(() => deviceHub.connectBluetooth(role))}
            >
              {t('devices.connect')}
            </button>
            {role !== 'powermeter' && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={busy}
                onClick={() => run(() => deviceHub.connectSimulated(role))}
              >
                {t('devices.simulated')}
              </button>
            )}
          </>
        )}
        {connected && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => run(() => deviceHub.disconnect(role))}
          >
            {t('devices.disconnect')}
          </button>
        )}
        {remembered && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => deviceHub.forget(role)}
          >
            {t('devices.forget')}
          </button>
        )}
      </div>
    </section>
  );
}

function useZwift() {
  return useSyncExternalStore(
    (cb) => zwiftControllers.onChange(cb),
    () => zwiftControllers.list,
  );
}

/** Zwift Click controllers (lot 3.11): same connect, disconnect and forget as the sensors. */
function ZwiftCard() {
  const t = useT();
  const clicks = useZwift();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    fn()
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === 'NotFoundError') return; // picker closed
        setError(
          (e as Error).message === 'bluetooth-unavailable'
            ? t('controls.noBluetooth')
            : t('controls.pairFailed'),
        );
      })
      .finally(() => setBusy(false));
  };
  const anyConnected = clicks.some((c) => c.status === 'connected');

  return (
    <section className="card stack" style={{ gap: 14 }}>
      <div className="card__head">
        <div className="row" style={{ gap: 14 }}>
          <span className="card__icon">
            <Icon name="controls" size={30} />
          </span>
          <h2 className="t-h2" style={{ fontSize: 28 }}>
            {t('devices.zwift')}
          </h2>
        </div>
        <span className="chip">
          <span className={`dot ${anyConnected ? 'dot--ok' : ''}`} />
          {t(`devices.status.${anyConnected ? 'connected' : 'disconnected'}`)}
        </span>
      </div>
      {clicks.length === 0 && <span className="t-hint">—</span>}
      {clicks.map((c) => (
        <div className="stack" style={{ gap: 10 }} key={c.id}>
          <span className="t-small t-0">
            {c.name} · {t(`devices.status.${c.status}`)}
          </span>
          {c.battery !== null && (
            <div className="row" style={{ gap: 12 }}>
              <div className="bar" style={{ flex: 1 }}>
                <i style={{ width: `${c.battery}%`, background: 'var(--ok)' }} />
              </div>
              <span className="num t-0" style={{ fontSize: 24 }}>
                {c.battery} %
              </span>
            </div>
          )}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {c.status === 'disconnected' ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={busy}
                onClick={() => run(() => c.connect())}
              >
                {t('devices.reconnect', { name: c.name })}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => c.disconnect()}
              >
                {t('devices.disconnect')}
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => zwiftControllers.forget(c.id)}
            >
              {t('devices.forget')}
            </button>
          </div>
        </div>
      ))}
      {error && (
        <div className="field__error">
          <span aria-hidden="true">✕</span> {error}
        </div>
      )}
      <div className="row" style={{ marginTop: 'auto' }}>
        <button
          type="button"
          className={`btn btn--sm ${clicks.length ? 'btn--secondary' : 'btn--primary'}`}
          disabled={busy || !deviceHub.bluetoothAvailable}
          onClick={() => run(() => zwiftControllers.pair())}
        >
          {t('devices.connect')}
        </button>
      </div>
      <span className="t-hint">{t('controls.zwiftHelp')}</span>
    </section>
  );
}

export function DevicesPage() {
  const t = useT();
  const slots = useDevices();
  const count = ROLES.filter((r) => slots[r].status === 'connected').length;
  return (
    <Page
      title={t('devices.title')}
      eyebrow={t('devices.step')}
      actions={
        <span className="chip">
          <span className={`dot ${count ? 'dot--ok' : ''}`} />
          {t('devices.connectedCount', { n: count })}
        </span>
      }
    >
      <div className="grid grid--3">
        {ROLES.map((role) => (
          <DeviceCard key={role} role={role} />
        ))}
        <ZwiftCard />
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => navigate('/routes')}
        >
          {t('devices.continue')} →
        </button>
      </div>
    </Page>
  );
}
