import type { RideHeader } from '@hrt/recorder';
import { useEffect, useState } from 'react';
import { formatDuration, formatter } from '../format';
import { useT } from '../i18n';
import { rideStore } from '../store/rides';
import { useSettings } from '../store/settings';
import { formatDate, Page, useLocalized } from './common';

export function HistoryPage() {
  const t = useT();
  const settings = useSettings();
  const f = formatter(settings.units, settings.language);
  const loc = useLocalized();
  const [rides, setRides] = useState<RideHeader[] | null>(null);

  useEffect(() => {
    void rideStore
      .listHeaders()
      .then(setRides)
      .catch(() => setRides([]));
  }, []);

  return (
    <Page title={t('history.title')}>
      {rides?.length === 0 && <p className="muted">{t('history.empty')}</p>}
      <ul className="ride-list">
        {rides?.map((r) => (
          <li key={r.id}>
            <a href={`#/rides/${r.id}`}>
              <span className="ride-date">{formatDate(r.startedAt, settings.language)}</span>
              <strong>{r.route ? loc(r.route.name) : '—'}</strong>
              <span>
                {f.distance(r.distanceM)} {f.distanceUnit}
              </span>
              <span>{formatDuration(r.durationS)}</span>
              <span>{r.stats ? `${Math.round(r.stats.avgPowerW)} W` : ''}</span>
              <span>
                {r.status === 'recording' ? (
                  <em className="warn-text">{t('history.unfinished')}</em>
                ) : r.bestLapS !== null ? (
                  `${t('hud.lapBest')} ${formatDuration(r.bestLapS)}`
                ) : (
                  ''
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Page>
  );
}
