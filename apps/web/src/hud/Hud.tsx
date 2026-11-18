// Ride HUD (lot 1.6), refreshed at 4 Hz from the session state.

import type { Route } from '@hrt/route-engine';
import type { Interval } from '@hrt/workouts';
import { useEffect, useState } from 'react';
import { formatDelta, formatDuration, formatter, gradeBand } from '../format';
import { useT } from '../i18n';
import { useLocalized } from '../pages/common';
import type { LiveState } from '../ride/ride-session';
import { useSettings } from '../store/settings';
import { ElevationProfile, MiniMap } from './charts';
import { GRADE_MARK } from './colors';
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
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={`tile ${className}`}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">
        {value}
        {unit && <small> {unit}</small>}
      </span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

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
  const cb = settings.colorMode !== 'default';
  const renderTile = (id: HudTileId) => {
    switch (id) {
      case 'time':
        return <Tile key={id} label={t('hud.time')} value={formatDuration(s.timeS)} />;
      case 'distance':
        return (
          <Tile
            key={id}
            label={t('hud.distance')}
            value={f.distance(s.distanceM, 2)}
            unit={f.distanceUnit}
          />
        );
      case 'ascent':
        return (
          <Tile
            key={id}
            label={t('hud.ascent')}
            value={`+${f.elevation(s.ascentM)}`}
            unit={f.elevationUnit}
          />
        );
      case 'power':
        return (
          <Tile
            key={id}
            className="tile-power"
            label={t('hud.power')}
            value={String(Math.round(s.powerW))}
            unit="W"
            sub={`3 s : ${Math.round(s.power3sW)} W`}
          />
        );
      case 'wkg':
        return <Tile key={id} label={t('hud.wkg')} value={f.num(s.power3sW / weightKg, 1)} />;
      case 'cadence':
        return (
          <Tile
            key={id}
            label={t('hud.cadence')}
            value={String(Math.round(s.cadenceRpm))}
            unit="rpm"
          />
        );
      case 'hr':
        return (
          <Tile
            key={id}
            label={t('hud.hr')}
            value={s.heartRateBpm === null ? '—' : String(Math.round(s.heartRateBpm))}
            unit="bpm"
          />
        );
      case 'speed':
        return (
          <Tile key={id} label={t('hud.speed')} value={f.speed(s.speedMs)} unit={f.speedUnit} />
        );
      case 'gear':
        return s.gearIndex === null ? null : (
          <div key={id} className="tile tile-gear">
            <span className="tile-label">{t('hud.gear')}</span>
            <span className="tile-value">{s.gearLabel}</span>
            <span className="gear-bar" aria-hidden>
              {Array.from({ length: s.gearCount }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed list of gear slots
                <i key={i} className={i <= (s.gearIndex ?? 0) ? 'on' : ''} />
              ))}
            </span>
          </div>
        );
    }
  };
  return (
    <div className={`ride-hud hud-${settings.hudSize} cb-${settings.colorMode}`}>
      <div className="hud-top">
        <div className="hud-strip">
          {tilesOfRow(settings.hudTiles, 'top').map(renderTile)}
          {route.loop && (
            <Tile
              className="tile-lap"
              label={`${t('hud.lap')} ${s.lap}`}
              value={formatDuration(s.lapTimeS)}
              sub={[
                s.lastLapS !== null ? `${t('hud.lapLast')} ${formatDuration(s.lastLapS)}` : null,
                s.bestLapS !== null ? `${t('hud.lapBest')} ${formatDuration(s.bestLapS)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          )}
          {s.ghost && (
            <Tile
              className={`tile-ghost ${s.ghost.gapM >= 0 ? 'ghost-ahead' : 'ghost-behind'}`}
              label={
                s.ghost.kind === 'bestLap'
                  ? t('hud.ghostBest')
                  : t('hud.ghostRide', { date: s.ghost.label })
              }
              value={s.ghost.gapS === null ? '—' : formatDelta(s.ghost.gapS)}
              sub={`${f.elevation(Math.abs(s.ghost.gapM))} ${f.elevationUnit} ${
                s.ghost.gapM >= 0 ? t('hud.ghostAhead') : t('hud.ghostBehind')
              }`}
            />
          )}
        </div>
        <MiniMap route={route} lapDistanceM={s.lapDistanceM} />
      </div>
      {s.segment && (
        <div className="segment-banner">
          <span className="tile-label">
            {loc(s.segment.name)} · {f.distance(s.segment.remainingM, 2)} {f.distanceUnit}{' '}
            {t('hud.segmentLeft')}
          </span>
          <span className="segment-time">{formatDuration(s.segment.elapsedS)}</span>
          {s.segment.pbS !== null && (
            <span className="tile-sub">
              {t('hud.segmentPb')} {formatDuration(s.segment.pbS)}
              {s.segment.deltaS !== null && (
                <b className={s.segment.deltaS <= 0 ? 'delta-good' : 'delta-bad'}>
                  {' '}
                  {formatDelta(s.segment.deltaS)}
                </b>
              )}
            </span>
          )}
        </div>
      )}
      {s.workout && (
        <div className="workout-banner">
          <div className="workout-now">
            <span className="tile-label">
              {s.workout.name} · {s.workout.index + 1}/{s.workout.count}
            </span>
            <span className="workout-target">
              {s.workout.finished ? t('hud.workoutDone') : `${s.ergTargetW ?? s.workout.targetW} W`}
              {!s.workout.finished && <small> {s.workout.label}</small>}
            </span>
            {s.workout.offsetW !== 0 && (
              <span className="tile-sub">
                {s.workout.offsetW > 0 ? '+' : ''}
                {s.workout.offsetW} W
              </span>
            )}
          </div>
          <div className="workout-time">
            <span className="tile-value">{formatDuration(s.workout.remainingS)}</span>
            {s.workout.next && (
              <span className="tile-sub">
                {t('hud.next')} : {s.workout.next.targetW + s.workout.offsetW} W ·{' '}
                {s.workout.next.label}
              </span>
            )}
          </div>
          <div className="workout-graph-wrap">
            <WorkoutGraph
              intervals={workoutIntervals}
              ftpW={ftpW}
              elapsedS={s.workout.elapsedS}
              adjustW={s.workout.offsetW}
              height={56}
            />
          </div>
        </div>
      )}
      <div className="hud-bottom">
        <div className="hud-tiles">
          {s.ergTargetW !== null && (
            <Tile
              className={`tile-erg${s.ergState && s.ergState !== 'active' ? ' tile-erg-hold' : ''}`}
              label={t('hud.erg')}
              value={String(s.ergTargetW)}
              unit="W"
              sub={
                s.ergState === 'spiral'
                  ? t('hud.ergSpiral')
                  : s.ergState === 'stopped'
                    ? t('hud.ergStopped')
                    : s.ergCommandW !== null && s.ergCommandW !== s.ergTargetW
                      ? `→ ${s.ergCommandW} W`
                      : undefined
              }
            />
          )}
          {tilesOfRow(settings.hudTiles, 'bottom').map(renderTile)}
        </div>
        <div className="hud-profile">
          <ElevationProfile route={route} lapDistanceM={s.lapDistanceM} />
          <div className={`grade grade-${band}`}>
            <span className="tile-label">{t('hud.grade')}</span>
            <span className="grade-value">
              {f.num(s.gradePercent, 1)} %{cb && GRADE_MARK[band] && ` ${GRADE_MARK[band]}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
