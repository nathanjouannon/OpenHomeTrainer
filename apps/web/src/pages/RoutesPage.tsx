import type { RideHeader } from '@hrt/recorder';
import {
  parseRouteId,
  REVERSE_SUFFIX,
  type Route,
  type WorldManifest,
  withSegments,
} from '@hrt/route-engine';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { formatDuration, formatter } from '../format';
import { ElevationProfile, MiniMap } from '../hud/charts';
import { useT } from '../i18n';
import { estimateLapTimeS } from '../ride/estimate';
import { BEST_LAP_GHOST, bestLapRide } from '../ride/ghost';
import { navigate, parseHash } from '../router';
import { deviceHub } from '../store/devices';
import { rideStore } from '../store/rides';
import { getSegmentBest } from '../store/segments';
import { CDA_BY_BIKE, useSettings } from '../store/settings';
import { useWorkouts } from '../store/workouts';
import { fetchManifest, fetchRoute } from '../world/world-data';
import { formatDate, Page, useLocalized } from './common';

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
  const [reverse, setReverse] = useState(false);
  const [rides, setRides] = useState<RideHeader[]>([]);
  const [ghostId, setGhostId] = useState('');
  const [goalKind, setGoalKind] = useState<GoalKind>('none');
  const [goalValue, setGoalValue] = useState(60);
  const workouts = useWorkouts();
  const [workoutId, setWorkoutId] = useState(
    () => parseHash(window.location.hash).query.get('workout') ?? '',
  );

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
      setRides(rides);
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
    return Object.fromEntries(
      routes.flatMap((r) => {
        const rev = r.reversed();
        return [
          [r.id, estimateLapTimeS(r, power, params)],
          [rev.id, estimateLapTimeS(rev, power, params)],
        ];
      }),
    );
  }, [routes, p.ftpW, p.weightKg, p.bikeMassKg, p.bikeType]);

  const reversedRoutes = useMemo(() => routes.map((r) => r.reversed()), [routes]);
  const shownRoutes = reverse ? reversedRoutes : routes;
  const selectedRoute = useMemo(() => {
    const r = shownRoutes.find((x) => parseRouteId(x.id).baseId === selected);
    return r ? withSegments(r) : null;
  }, [shownRoutes, selected]);

  // Ghosts (lot 3.6): earlier rides of the route as ridden (same direction).
  const ghostRides = useMemo(
    () =>
      selectedRoute
        ? rides
            .filter(
              (r) =>
                r.status === 'finished' &&
                r.route?.id === selectedRoute.id &&
                r.distanceM >= 50 &&
                r.durationS > 0,
            )
            .slice(0, 10)
        : [],
    [rides, selectedRoute],
  );
  const bestRide = useMemo(
    () => (selectedRoute ? bestLapRide(rides, selectedRoute.id) : null),
    [rides, selectedRoute],
  );
  // A ghost belongs to one route and direction.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the route or direction changes
  useEffect(() => setGhostId(''), [selected, reverse]);

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
    if (workoutId) q.set('workout', workoutId);
    if (ghostId) q.set('ghost', ghostId);
    navigate(
      `/ride/${manifest.id}/${selected}${reverse ? REVERSE_SUFFIX : ''}${q.size ? `?${q}` : ''}`,
    );
  };

  const seg = (on: boolean, label: string, onClick: () => void) => (
    <button type="button" aria-pressed={on} style={{ flex: 1 }} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <Page
      title={t('routes.title')}
      eyebrow={t('routes.step')}
      actions={
        <a className="btn btn--ghost" href="#/devices">
          {t('nav.devices')}
        </a>
      }
    >
      {error && (
        <div className="card" style={{ borderColor: 'var(--err)', background: 'var(--err-soft)' }}>
          <div className="row" style={{ gap: 16 }}>
            <span className="banner__icon" style={{ '--bc': 'var(--err)' } as CSSProperties}>
              ✕
            </span>
            <p className="t-small t-0">{t('routes.missing')}</p>
          </div>
        </div>
      )}
      {!error && !manifest && (
        <div className="grid grid--2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card card--skeleton" style={{ height: 250 }}>
              <div className="sk" style={{ height: 36, width: '60%' }} />
            </div>
          ))}
        </div>
      )}
      {manifest && (
        <div className="row" style={{ gap: 32, alignItems: 'flex-start' }}>
          <div className="stack" style={{ flex: 1, gap: 24 }}>
            <p className="t-small">
              <b className="t-0">{loc(manifest.name)}</b> — {loc(manifest.description)}
            </p>
            <div className="grid grid--2" style={{ gap: 24 }}>
              {shownRoutes.map((r) => {
                const baseId = parseRouteId(r.id).baseId;
                const info = manifest.routes.find((m) => m.id === baseId);
                return (
                  <button
                    type="button"
                    key={r.id}
                    className={`card card--link route-card${selected === baseId ? ' is-selected' : ''}`}
                    style={{
                      padding: 0,
                      overflow: 'hidden',
                      textAlign: 'left',
                      color: 'inherit',
                      font: 'inherit',
                    }}
                    onClick={() => setSelected(baseId)}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '170px minmax(0, 1fr)' }}>
                      <div
                        className="route-thumb"
                        style={{
                          background: 'var(--bg-2)',
                          padding: 14,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <MiniMap route={r} size={140} />
                      </div>
                      <div className="stack" style={{ gap: 8, padding: '18px 20px', minWidth: 0 }}>
                        <div
                          className="card__head"
                          style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}
                        >
                          <h3 className="t-h2" style={{ fontSize: 26 }}>
                            {loc(r.meta.name)}
                          </h3>
                          {info && (
                            <span className="badge badge--info">
                              {t(`profile.${info.profile}`)}
                            </span>
                          )}
                        </div>
                        <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
                          <span className="t-small">
                            <b className="num t-0" style={{ fontSize: 26 }}>
                              {f.distance(r.lengthM)} {f.distanceUnit}
                            </b>{' '}
                            {t('routes.lap')}
                          </span>
                          <span className="t-small">
                            <b className="num t-0" style={{ fontSize: 26 }}>
                              +{f.elevation(r.meta.ascentM)} {f.elevationUnit}
                            </b>
                          </span>
                          <span className="t-small">
                            {t('routes.maxGrade')}{' '}
                            <b className="num t-0" style={{ fontSize: 26 }}>
                              {f.num(info?.maxGradePercent ?? 0, 1)} %
                            </b>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '0 20px 8px' }}>
                      <ElevationProfile route={r} height={60} showMarker={false} />
                    </div>
                    <div
                      className="row"
                      style={{ padding: '10px 20px 18px', justifyContent: 'space-between' }}
                    >
                      <span className="t-small">
                        {t('routes.estimate')}{' '}
                        <b className="num t-0" style={{ fontSize: 24 }}>
                          {estimates[r.id] ? formatDuration(estimates[r.id] as number) : '—'}
                        </b>
                      </span>
                      <span className="t-small">
                        {t('routes.best')}{' '}
                        <b className="num t-0" style={{ fontSize: 24 }}>
                          {best[r.id] !== undefined ? formatDuration(best[r.id] as number) : '—'}
                        </b>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <aside
            className="card stack"
            style={{ width: 620, gap: 22, alignSelf: 'flex-start', flex: 'none' }}
          >
            <h2 className="t-h2">{t('routes.options')}</h2>
            <div className="field">
              <span className="field__label">{t('routes.direction')}</span>
              {/* biome-ignore lint/a11y/useSemanticElements: a segmented control, not a form group */}
              <div className="seg" role="group" aria-label={t('routes.direction')}>
                {seg(!reverse, t('routes.direction.forward'), () => setReverse(false))}
                {seg(reverse, t('routes.direction.reverse'), () => setReverse(true))}
              </div>
              <span className="field__hint">{t('routes.directionHint')}</span>
            </div>
            {selectedRoute && selectedRoute.meta.segments.length > 0 && (
              <div className="field">
                <span className="field__label">{t('routes.segments')}</span>
                <table className="tbl" style={{ fontSize: 18 }}>
                  <tbody>
                    {selectedRoute.meta.segments.map((sg) => {
                      const pb = getSegmentBest(selectedRoute.id, sg.id);
                      return (
                        <tr key={sg.id}>
                          <td>{loc(sg.name)}</td>
                          {pb === null ? (
                            <td className="r t-hint">{t('routes.segmentNone')}</td>
                          ) : (
                            <td className="num r">{formatDuration(pb)}</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {(bestRide || ghostRides.length > 0) && (
              <div className="field">
                <label className="field__label" htmlFor="ghost">
                  {t('routes.ghost')}
                </label>
                <select
                  id="ghost"
                  className="input"
                  value={ghostId}
                  onChange={(e) => setGhostId(e.target.value)}
                >
                  <option value="">{t('routes.ghost.none')}</option>
                  {bestRide?.bestLapS != null && (
                    <option value={BEST_LAP_GHOST}>
                      {t('routes.ghost.best', { time: formatDuration(bestRide.bestLapS) })}
                    </option>
                  )}
                  {ghostRides.map((r) => (
                    <option key={r.id} value={r.id}>
                      {t('routes.ghost.ride', {
                        date: formatDate(r.startedAt, settings.language),
                        time: formatDuration(r.durationS),
                      })}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label className="field__label" htmlFor="workout">
                {t('routes.workout')}
              </label>
              <select
                id="workout"
                className="input"
                value={workoutId}
                onChange={(e) => setWorkoutId(e.target.value)}
              >
                <option value="">{t('routes.workout.none')}</option>
                {workouts.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="field__label">{t('routes.goal')}</span>
              {/* biome-ignore lint/a11y/useSemanticElements: a segmented control, not a form group */}
              <div className="seg" role="group" aria-label={t('routes.goal')}>
                {seg(goalKind === 'none', t('routes.goal.none'), () => setGoalKind('none'))}
                {seg(goalKind === 'duration', t('routes.goal.duration'), () =>
                  setGoalKind('duration'),
                )}
                {seg(goalKind === 'distance', t('routes.goal.distance'), () =>
                  setGoalKind('distance'),
                )}
                {seg(goalKind === 'laps', t('routes.goal.laps'), () => setGoalKind('laps'))}
              </div>
              {goalKind !== 'none' && (
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={goalValue}
                  onChange={(e) => setGoalValue(Math.max(1, Number(e.target.value)))}
                />
              )}
              {goalKind === 'distance' && <span className="field__hint">{f.distanceUnit}</span>}
            </div>
            {!deviceHub.hasPowerSource && (
              <span className="field__hint">{t('routes.noDevice')}</span>
            )}
            <button
              type="button"
              className="btn btn--primary btn--lg"
              disabled={!selected}
              onClick={start}
            >
              {t('routes.start')} →
            </button>
          </aside>
        </div>
      )}
    </Page>
  );
}
