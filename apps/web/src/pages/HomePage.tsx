import type { RideHeader } from '@hrt/recorder';
import { useEffect, useState } from 'react';
import { formatDuration, formatter } from '../format';
import { useT } from '../i18n';
import { navigate } from '../router';
import { Icon, type IconName } from '../shell/icons';
import { deviceHub, ROLES, useDevices } from '../store/devices';
import { rideStore } from '../store/rides';
import { useSettings } from '../store/settings';
import { isBuiltin, useWorkouts } from '../store/workouts';
import { formatDate, useLocalized } from './common';
import { HomeAnimation } from './HomeAnimation';

function HomeCard({
  href,
  icon,
  title,
  children,
}: {
  href: string;
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <a className="card card--link" href={href} style={{ minHeight: 260 }}>
      <div className="card__head">
        <span className="card__icon">
          <Icon name={icon} size={30} />
        </span>
      </div>
      <h2 className="t-h2" style={{ marginTop: 8 }}>
        {title}
      </h2>
      <div className="stack" style={{ gap: 8 }}>
        {children}
      </div>
    </a>
  );
}

export function HomePage() {
  const t = useT();
  const settings = useSettings();
  const f = formatter(settings.units, settings.language);
  const loc = useLocalized();
  const slots = useDevices();
  const workouts = useWorkouts();
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
  const builtin = workouts.filter((w) => isBuiltin(w.id)).length;

  return (
    <main className="page__main">
      {!deviceHub.bluetoothAvailable && (
        <div className="banner banner--warn">
          <span className="banner__icon">!</span>
          <div className="banner__body">
            <div className="banner__text t-0">{t('home.noBluetooth')}</div>
          </div>
        </div>
      )}
      {unfinished && (
        <div className="banner">
          <span className="banner__icon">i</span>
          <div className="banner__body">
            <div className="banner__title">{t('home.unfinishedTitle')}</div>
            <div className="banner__text">{t('home.unfinished')}</div>
          </div>
          <a className="btn btn--secondary" href={`#/rides/${unfinished.id}`}>
            {t('home.recover')}
          </a>
        </div>
      )}
      <section className="row" style={{ gap: 64, alignItems: 'center', padding: '12px 0' }}>
        <div className="stack" style={{ gap: 20, flex: 1 }}>
          <span className="t-eyebrow">HomeRealTrainer</span>
          <h1 className="t-display" style={{ fontSize: 88, maxWidth: 1000 }}>
            {t('app.tagline')}
          </h1>
        </div>
        <div className="stack" style={{ alignItems: 'center', gap: 16 }}>
          <button
            type="button"
            className="btn btn--primary btn--xl"
            // biome-ignore lint/a11y/noAutofocus: the main action is the first focus target for keyboard and gamepad
            autoFocus
            onClick={() => navigate(deviceHub.hasPowerSource ? '/routes' : '/devices')}
          >
            <Icon name="play" size={44} /> {t('home.ride')}
          </button>
          <span className="t-hint">
            {t('home.ready')} · {t('home.rideHint')}
          </span>
        </div>
      </section>
      <section className="grid grid--5">
        <HomeCard href="#/devices" icon="devices" title={t('home.devices')}>
          {connected.length ? (
            connected.map((r) => (
              <div className="row" style={{ gap: 10 }} key={r}>
                <span className="dot dot--ok" />
                <span className="t-small t-0">{slots[r].device?.name}</span>
              </div>
            ))
          ) : (
            <div className="row" style={{ gap: 10 }}>
              <span className="dot" />
              <span className="t-small t-0">{t('devices.status.disconnected')}</span>
            </div>
          )}
        </HomeCard>
        <HomeCard href="#/workouts" icon="workouts" title={t('home.workouts')}>
          <span className="t-small t-0">
            {t('home.workoutsCount', { builtin, mine: workouts.length - builtin })}
          </span>
          <span className="t-hint">{t('home.workoutsHint')}</span>
        </HomeCard>
        <HomeCard href="#/controls" icon="controls" title={t('home.controls')}>
          <span className="t-small t-0">{t('home.controlsNames')}</span>
          <span className="t-hint">{t('home.controlsHint')}</span>
        </HomeCard>
        <HomeCard href="#/rides" icon="history" title={t('home.history')}>
          {last ? (
            <>
              <span className="t-small t-0">
                {formatDate(last.startedAt, settings.language)}
                {last.route ? ` · ${loc(last.route.name)}` : ''}
              </span>
              <span className="t-hint">
                {formatDuration(last.durationS)} · {f.distance(last.distanceM)} {f.distanceUnit}
              </span>
            </>
          ) : (
            <span className="t-small t-0">{t('home.noRide')}</span>
          )}
        </HomeCard>
        <HomeCard href="#/settings" icon="settings" title={t('home.settings')}>
          <span className="t-small t-0">
            {t('home.settingsLine', {
              lang: settings.language === 'fr' ? 'Français' : 'English',
              units: settings.units === 'metric' ? 'km' : 'mi',
              hud: settings.hudSize,
            })}
          </span>
          <span className="t-hint">
            {t('home.difficultyLine', { pct: Math.round(settings.difficulty * 100) })} · FTP{' '}
            {settings.profile.ftpW ?? '?'} W
          </span>
        </HomeCard>
      </section>
      <HomeAnimation />
    </main>
  );
}
