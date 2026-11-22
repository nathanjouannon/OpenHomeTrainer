import { type ReactNode, useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useLocation } from '../router';
import { ROLES, useDevices } from '../store/devices';
import { useSettings } from '../store/settings';
import { Icon, type IconName, Logo } from './icons';
import { designAttrs, useSystemTheme } from './theme';

interface NavEntry {
  page: string;
  href: string;
  icon: IconName;
  label:
    | 'nav.home'
    | 'nav.devices'
    | 'nav.routes'
    | 'nav.workouts'
    | 'nav.erg'
    | 'nav.controls'
    | 'nav.history'
    | 'nav.settings';
}

const NAV: NavEntry[] = [
  { page: '', href: '#/', icon: 'home', label: 'nav.home' },
  { page: 'devices', href: '#/devices', icon: 'devices', label: 'nav.devices' },
  { page: 'routes', href: '#/routes', icon: 'routes', label: 'nav.routes' },
  { page: 'workouts', href: '#/workouts', icon: 'workouts', label: 'nav.workouts' },
  { page: 'erg', href: '#/erg', icon: 'workouts', label: 'nav.erg' },
  { page: 'controls', href: '#/controls', icon: 'controls', label: 'nav.controls' },
  { page: 'rides', href: '#/rides', icon: 'history', label: 'nav.history' },
  { page: 'settings', href: '#/settings', icon: 'settings', label: 'nav.settings' },
];

/** Live values of the connected devices, shown as chips in the top bar. */
function DeviceChips() {
  const slots = useDevices();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  const t = useT();
  const labels = {
    trainer: 'Trainer',
    heartrate: t('chip.heartrate'),
    powermeter: t('chip.power'),
  };
  return (
    <div className="topbar__right">
      {ROLES.filter((r) => slots[r].device).map((r) => {
        const last = slots[r].last;
        const value = r === 'heartrate' ? last?.heartRateBpm : last?.powerW;
        const unit = r === 'heartrate' ? '' : ' W';
        return (
          <span className="chip" key={r}>
            <span className={`dot dot--${slots[r].status === 'connected' ? 'ok' : 'warn'}`} />
            {labels[r]}
            {value !== undefined && (
              <span className="num">
                {value}
                {unit}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Frame of every page outside the ride: top bar, content, key help bar. */
/** The design is drawn for 1920 px: scale it down on smaller windows so nothing overflows. */
const fitScale = () => Math.min(1.25, Math.max(0.5, window.innerWidth / 1920));

function useFitScale(): number {
  const [scale, setScale] = useState(fitScale);
  useEffect(() => {
    const on = () => setScale(fitScale());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return scale;
}

export function Shell({ children }: { children: ReactNode }) {
  const scale = useFitScale();
  const t = useT();
  const settings = useSettings();
  const theme = useSystemTheme();
  const { page } = useLocation();
  return (
    <div
      className="hrt page"
      {...designAttrs(settings, theme)}
      style={{ zoom: scale, minHeight: `${100 / scale}vh` }}
    >
      <header className="topbar">
        <a href="#/" aria-label={t('nav.home')}>
          <Logo size="sm" />
        </a>
        <nav className="nav" aria-label="Navigation">
          {NAV.map((n) => (
            <a
              key={n.page}
              className="nav__item"
              href={n.href}
              aria-current={page === n.page ? 'page' : undefined}
            >
              <Icon name={n.icon} />
              {t(n.label)}
            </a>
          ))}
        </nav>
        <DeviceChips />
      </header>
      {children}
    </div>
  );
}
