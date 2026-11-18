// Ride HUD (lot 1.6), refreshed at 4 Hz from the session state.

import type { Route } from '@hrt/route-engine';
import type { Interval } from '@hrt/workouts';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { formatDelta, formatDuration, formatter, gradeBand } from '../format';
import { useT } from '../i18n';
import { useLocalized } from '../pages/common';
import type { LiveState } from '../ride/ride-session';
import { useSettings } from '../store/settings';
import { ElevationProfile, MiniMap } from './charts';
import { GRADE_MARK, zoneIndex } from './colors';
import { type HudTileId, tilesOfRow } from './tiles';
import { WorkoutGraph } from './WorkoutGraph';

export function useLiveState(state: LiveState, hz = 4): LiveState {
  const [snap, setSnap] = useState<LiveState>(() => ({ ...state }));
  useEffect(() => {
    const id = setInterval(() => setSnap({ ...state }), 1000 / hz);
    return () => clearInterval(id);
  }, [state, hz]);
  return snap;
}

function Tile({
  label,
  value,
  unit,
  sub,
  className = '',
  compact = false,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  className?: string;
  /** Smaller value (the top row). */
  compact?: boolean;
}) {
  return (
    <div className={`tile${compact ? ' tile--s' : ''} ${className}`}>
      <span className="tile__label">{label}</span>
      <span className="tile__value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {sub && <span className="tile__sub">{sub}</span>}
    </div>
  );
}

const BAND_INDEX = { down: 0, flat: 1, g1: 2, g2: 3, g3: 4 } as const;

export function Hud({
  state,
  route,
  weightKg,
  workoutIntervals = [],
  ftpW = 200,
}: {
  state: LiveState;
  route: Route;
  weightKg: number;
  workoutIntervals?: readonly Interval[];
  ftpW?: number;
}) {
  const t = useT();
  const loc = useLocalized();
  const settings = useSettings();
  const f = formatter(settings.units, settings.language);
  const s = useLiveState(state);
  const band = gradeBand(s.gradePercent);
  const renderTile = (id: HudTileId) => {
    switch (id) {
      case 'time':
        return (
          <Tile
            key={id}
            compact
            className="tile--w11"
            label={t('hud.time')}
            value={formatDuration(s.timeS)}
          />
        );
      case 'distance':
        return (
          <Tile
            key={id}
            compact
            className="tile--w11"
            label={t('hud.distance')}
            value={f.distance(s.distanceM, 2)}
            unit={f.distanceUnit}
          />
        );
      case 'ascent':
        return (
          <Tile
            key={id}
            compact
            className="tile--w11"
            label={t('hud.ascent')}
            value={`+${f.elevation(s.ascentM)}`}
            unit={f.elevationUnit}
          />
        );
      case 'power': {
        const z = zoneIndex(s.powerW, ftpW);
        return (
          <div
            key={id}
            className="tile tile--power"
            style={{ '--zc': `var(--z${z})` } as CSSProperties}
          >
            <div className="row-p">
              <span className="tile__label">{t('hud.power')}</span>
              <span className={`zone zone--${z}`} style={{ fontSize: '1.1em' }}>
                Z{z}
              </span>
            </div>
            <span className="tile__value">
              {Math.round(s.powerW)}
              <small>W</small>
            </span>
            <span className="tile__sub">
              {t('hud.avg3s')} <b>{Math.round(s.power3sW)}</b> W
            </span>
            <div className="zonebar" />
          </div>
        );
      }
      case 'wkg':
        return (
          <Tile
            key={id}
            className="tile--w10"
            label={t('hud.wkg')}
            value={f.num(s.power3sW / weightKg, 2)}
          />
        );
      case 'cadence':
        return (
          <Tile
            key={id}
            className="tile--w10"
            label={t('hud.cadence')}
            value={String(Math.round(s.cadenceRpm))}
            unit="rpm"
          />
        );
      case 'hr':
        return (
          <Tile
            key={id}
            className="tile--w10"
            label={t('hud.hr')}
            value={s.heartRateBpm === null ? '—' : String(Math.round(s.heartRateBpm))}
            unit="bpm"
          />
        );
      case 'speed':
        return (
          <Tile
            key={id}
            className="tile--w13"
            label={t('hud.speed')}
            value={f.speed(s.speedMs)}
            unit={f.speedUnit}
          />
        );
      case 'gear':
        return s.gearIndex === null ? null : (
          <div key={id} className="tile tile--gear tile--w13">
            <span className="tile__label">{t('hud.gear')}</span>
            <span className="tile__value">{s.gearLabel}</span>
            <span className="gears" aria-hidden>
              {Array.from({ length: s.gearCount }, (_, i) => (
                <i
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed list of gear slots
                  key={i}
                  className={i === s.gearIndex ? 'on' : ''}
                  style={{ height: `${35 + (65 * i) / Math.max(1, s.gearCount - 1)}%` }}
                />
              ))}
            </span>
          </div>
        );
    }
  };
  const ghostAhead = s.ghost ? s.ghost.gapM >= 0 : true;
  const bandIdx = BAND_INDEX[band];
  return (
    <div className="hud">
      <div className="hud__top">
        <div className="hud__col">
          <div className="hud__rowt">
            {tilesOfRow(settings.hudTiles, 'top').map(renderTile)}
            {route.loop && (
              <Tile
                compact
                className="tile--lap"
                label={`${t('hud.lap')} ${s.lap}`}
                value={formatDuration(s.lapTimeS)}
                sub={
                  <>
                    {s.lastLapS !== null && (
                      <>
                        {t('hud.lapLast')} <b>{formatDuration(s.lastLapS)}</b>
                      </>
                    )}
                    {s.lastLapS !== null && s.bestLapS !== null && ' · '}
                    {s.bestLapS !== null && (
                      <>
                        {t('hud.lapBest')} <b>{formatDuration(s.bestLapS)}</b>
                      </>
                    )}
                  </>
                }
              />
            )}
            {s.ghost && (
              <div className="tile tile--s tile--ghost">
                <span className="tile__label">
                  {s.ghost.kind === 'bestLap'
                    ? t('hud.ghostBest')
                    : t('hud.ghostRide', { date: s.ghost.label })}
                </span>
                <span className={`tile__value ${ghostAhead ? 'ahead' : 'behind'}`}>
                  {s.ghost.gapS === null ? '—' : formatDelta(s.ghost.gapS)}
                </span>
                <span className="tile__sub">
                  {ghostAhead ? t('hud.ghostAhead') : t('hud.ghostBehind')} ·{' '}
                  {f.elevation(Math.abs(s.ghost.gapM))} {f.elevationUnit}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="hud__col hud__col--c">
          {s.workout && (
            <div
              className="sess"
              style={{ '--zc': `var(--z${zoneIndex(s.workout.targetW, ftpW)})` } as CSSProperties}
            >
              <div className="sess__head">
                <span className="sess__name">{s.workout.name}</span>
                <span className="tile__sub">
                  {t('hud.interval')}{' '}
                  <b>
                    {s.workout.index + 1}/{s.workout.count}
                  </b>
                </span>
              </div>
              <div className="sess__main">
                {s.workout.finished ? (
                  <span className="sess__target" style={{ fontSize: '2.4em' }}>
                    {t('hud.workoutDone')}
                  </span>
                ) : (
                  <>
                    <span className="sess__target">
                      {s.ergTargetW ?? s.workout.targetW}
                      <small>W</small>
                    </span>
                    <div className="stack" style={{ gap: '.4em', alignItems: 'flex-start' }}>
                      <span className="pill">{s.workout.label}</span>
                      {s.workout.offsetW !== 0 && (
                        <span className="adj">
                          {s.workout.offsetW > 0 ? '+' : ''}
                          {s.workout.offsetW} W
                        </span>
                      )}
                    </div>
                    <span className="sess__time">{formatDuration(s.workout.remainingS)}</span>
                  </>
                )}
              </div>
              {s.workout.next && !s.workout.finished && (
                <span className="sess__next">
                  {t('hud.next')} : {s.workout.next.targetW + s.workout.offsetW} W ·{' '}
                  {s.workout.next.label}
                </span>
              )}
              <WorkoutGraph
                intervals={workoutIntervals}
                ftpW={ftpW}
                elapsedS={s.workout.elapsedS}
                adjustW={s.workout.offsetW}
                height={56}
              />
            </div>
          )}
          {s.segment && (
            <div className="segb">
              <span className="segb__name">
                {loc(s.segment.name)}
                <br />
                <span className="segb__lab">
                  {t('hud.segmentLeft')} {f.distance(s.segment.remainingM, 2)} {f.distanceUnit}
                  {s.segment.pbS !== null &&
                    ` · ${t('hud.segmentPb')} ${formatDuration(s.segment.pbS)}`}
                </span>
              </span>
              <span className="segb__big">{formatDuration(s.segment.elapsedS)}</span>
              {s.segment.deltaS !== null && (
                <span className={`segb__big ${s.segment.deltaS <= 0 ? 'up' : 'down'}`}>
                  {formatDelta(s.segment.deltaS)}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="hud__col hud__col--r">
          <div className="map">
            <span className="tile__label">{t('hud.map')}</span>
            <MiniMap route={route} lapDistanceM={s.lapDistanceM} />
          </div>
        </div>
      </div>
      <div className="hud__bottom">
        <div className="hud__rowb">
          <div className={`grade band-${bandIdx}`}>
            <span className="tile__label">{t('hud.grade')}</span>
            <span className="tile__value">
              {f.num(s.gradePercent, 1)}
              <small>%</small>
              <span className="grade__mark" data-mark={GRADE_MARK[band] || '―'} />
            </span>
          </div>
          <div className="profile">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="tile__label">
                {route.loop ? `${t('hud.lap')} ${s.lap} · ` : ''}
                {t('hud.profile')}
              </span>
              <span className="tile__sub">
                <b>
                  {f.distance(s.lapDistanceM, 1)} / {f.distance(route.lengthM, 1)} {f.distanceUnit}
                </b>
              </span>
            </div>
            <ElevationProfile route={route} lapDistanceM={s.lapDistanceM} height={90} />
          </div>
        </div>
        <div className="hud__rowb">
          {s.ergTargetW !== null && (
            <div
              className={`tile tile--erg${s.ergState && s.ergState !== 'active' ? ' is-wait' : ''}`}
            >
              <span className="tile__label">{t('hud.erg')}</span>
              <span className="tile__value">
                {s.ergTargetW}
                <small>W</small>
              </span>
              <span className="tile__sub">
                {s.ergState === 'spiral'
                  ? t('hud.ergSpiral')
                  : s.ergState === 'stopped'
                    ? t('hud.ergStopped')
                    : s.ergCommandW !== null && s.ergCommandW !== s.ergTargetW
                      ? `→ ${s.ergCommandW} W`
                      : t('hud.ergActive')}
              </span>
            </div>
          )}
          {tilesOfRow(settings.hudTiles, 'bottom').map(renderTile)}
        </div>
      </div>
    </div>
  );
}
