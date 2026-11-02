import type { Route, WorldManifest } from '@hrt/route-engine';
import { useEffect, useMemo, useState } from 'react';
import { formatDuration, formatter } from '../format';
import { ElevationProfile, MiniMap } from '../hud/charts';
import { useT } from '../i18n';
import { estimateLapTimeS } from '../ride/estimate';
import { navigate } from '../router';
import { deviceHub } from '../store/devices';
import { rideStore } from '../store/rides';
import { CDA_BY_BIKE, useSettings } from '../store/settings';
import { fetchManifest, fetchRoute } from '../world/world-data';
import { Page, useLocalized } from './common';

export const DEFAULT_WORLD_ID = 'world-1';

type GoalKind = 'none' | 'duration' | 'distance' | 'laps';

export function RoutesPage() {
  const t = useT();
  const settings = useSettings();
  const f = formatter(settings.units, settings.language);
  const loc = useLocalized();
  const [manifest, setManifest] = useState<WorldManifest | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [best, setBest] = useState<Record<string, number>>({});
  const [goalKind, setGoalKind] = useState<GoalKind>('none');
  const [goalValue, setGoalValue] = useState(60);

  useEffect(() => {
    let cancelled = false;
    fetchManifest(DEFAULT_WORLD_ID)
      .then(async (m) => {
        const rs = await Promise.all(m.routes.map((r) => fetchRoute(m.id, r.file)));
        if (cancelled) return;
        setManifest(m);
        setRoutes(rs);
        setSelected((s) => s ?? rs[0]?.id ?? null);
      })
      .catch(() => setError(true));
    void rideStore.listHeaders().then((rides) => {
      const map: Record<string, number> = {};
      for (const r of rides) {
        if (r.route && r.bestLapS !== null) {
          map[r.route.id] = Math.min(map[r.route.id] ?? Number.POSITIVE_INFINITY, r.bestLapS);
        }
      }
      setBest(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const p = settings.profile;
  const estimates = useMemo(() => {
    const power = (p.ftpW ?? 200) * 0.75;
    const params = { massKg: p.weightKg, bikeMassKg: p.bikeMassKg, cda: CDA_BY_BIKE[p.bikeType] };
    return Object.fromEntries(routes.map((r) => [r.id, estimateLapTimeS(r, power, params)]));
  }, [routes, p.ftpW, p.weightKg, p.bikeMassKg, p.bikeType]);

  const start = () => {
    if (!manifest || !selected) return;
    const q = new URLSearchParams();
    if (goalKind !== 'none') {
      const value =
        goalKind === 'duration'
          ? goalValue * 60
          : goalKind === 'distance'
            ? goalValue * (settings.units === 'imperial' ? 1609.344 : 1000)
            : goalValue;
      q.set('goal', `${goalKind}:${value}`);
    }
    navigate(`/ride/${manifest.id}/${selected}${q.size ? `?${q}` : ''}`);
  };

  return (
    <Page title={t('routes.title')}>
      {error && <p className="notice warn">{t('routes.missing')}</p>}
      {!error && !manifest && <p className="muted">{t('routes.loading')}</p>}
      {manifest && (
        <>
          <p className="muted">
            <strong>{loc(manifest.name)}</strong> — {loc(manifest.description)}
          </p>
          <div className="route-list">
            {routes.map((r) => {
              const info = manifest.routes.find((m) => m.id === r.id);
              return (
                <button
                  type="button"
                  key={r.id}
                  className={`route-card ${selected === r.id ? 'selected' : ''}`}
                  onClick={() => setSelected(r.id)}
                >
                  <MiniMap route={r} size={110} />
                  <div className="route-info">
                    <h2>{loc(r.meta.name)}</h2>
                    <p className="muted">{info ? t(`profile.${info.profile}`) : ''}</p>
                    <dl>
                      <dt>{t('routes.lap')}</dt>
                      <dd>
                        {f.distance(r.lengthM)} {f.distanceUnit}
                      </dd>
                      <dt>{t('routes.ascent')}</dt>
                      <dd>
                        {f.elevation(r.meta.ascentM)} {f.elevationUnit}
                      </dd>
                      <dt>{t('routes.maxGrade')}</dt>
                      <dd>{f.num(info?.maxGradePercent ?? 0, 1)} %</dd>
                      <dt>{t('routes.estimate')}</dt>
                      <dd>{estimates[r.id] ? formatDuration(estimates[r.id] as number) : '—'}</dd>
                      {best[r.id] !== undefined && (
                        <>
                          <dt>{t('routes.best')}</dt>
                          <dd>{formatDuration(best[r.id] as number)}</dd>
                        </>
                      )}
                    </dl>
                    <ElevationProfile route={r} height={50} showMarker={false} />
                  </div>
                </button>
              );
            })}
          </div>
          <fieldset className="goal">
            <legend>{t('routes.goal')}</legend>
            <select value={goalKind} onChange={(e) => setGoalKind(e.target.value as GoalKind)}>
              <option value="none">{t('routes.goal.none')}</option>
              <option value="duration">{t('routes.goal.duration')}</option>
              <option value="distance">
                {t('routes.goal.distance')} ({f.distanceUnit})
              </option>
              <option value="laps">{t('routes.goal.laps')}</option>
            </select>
            {goalKind !== 'none' && (
              <input
                type="number"
                min={1}
                value={goalValue}
                onChange={(e) => setGoalValue(Math.max(1, Number(e.target.value)))}
              />
            )}
          </fieldset>
          {!deviceHub.hasPowerSource && <p className="muted">{t('routes.noDevice')}</p>}
          <button type="button" className="primary big" disabled={!selected} onClick={start}>
            {t('routes.start')} →
          </button>
        </>
      )}
    </Page>
  );
}
