// Ride HUD (lot 1.6), refreshed at 4 Hz from the session state.

import type { Route } from '@hrt/route-engine';
import { useEffect, useState } from 'react';
import { formatDuration, formatter, gradeBand } from '../format';
import { useT } from '../i18n';
import type { LiveState } from '../ride/ride-session';
import { useSettings } from '../store/settings';
import { ElevationProfile, MiniMap } from './charts';

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
}: {
  state: LiveState;
  route: Route;
  weightKg: number;
}) {
  const t = useT();
  const settings = useSettings();
  const f = formatter(settings.units, settings.language);
  const s = useLiveState(state);
  const band = gradeBand(s.gradePercent);
  return (
    <div className={`ride-hud hud-${settings.hudSize}`}>
      <div className="hud-top">
        <div className="hud-strip">
          <Tile label={t('hud.time')} value={formatDuration(s.timeS)} />
          <Tile
            label={t('hud.distance')}
            value={f.distance(s.distanceM, 2)}
            unit={f.distanceUnit}
          />
          <Tile
            label={t('hud.ascent')}
            value={`+${f.elevation(s.ascentM)}`}
            unit={f.elevationUnit}
          />
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
        </div>
        <MiniMap route={route} lapDistanceM={s.lapDistanceM} />
      </div>
      <div className="hud-bottom">
        <div className="hud-tiles">
          <Tile
            className="tile-power"
            label={t('hud.power')}
            value={String(Math.round(s.powerW))}
            unit="W"
            sub={`3 s : ${Math.round(s.power3sW)} W`}
          />
          <Tile label={t('hud.wkg')} value={f.num(s.power3sW / weightKg, 1)} />
          <Tile label={t('hud.cadence')} value={String(Math.round(s.cadenceRpm))} unit="rpm" />
          <Tile
            label={t('hud.hr')}
            value={s.heartRateBpm === null ? '—' : String(Math.round(s.heartRateBpm))}
            unit="bpm"
          />
          <Tile label={t('hud.speed')} value={f.speed(s.speedMs)} unit={f.speedUnit} />
          {s.gearIndex !== null && (
            <div className="tile tile-gear">
              <span className="tile-label">{t('hud.gear')}</span>
              <span className="tile-value">{s.gearLabel}</span>
              <span className="gear-bar" aria-hidden>
                {Array.from({ length: s.gearCount }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed list of gear slots
                  <i key={i} className={i <= (s.gearIndex ?? 0) ? 'on' : ''} />
                ))}
              </span>
            </div>
          )}
        </div>
        <div className="hud-profile">
          <ElevationProfile route={route} lapDistanceM={s.lapDistanceM} />
          <div className={`grade grade-${band}`}>
            <span className="tile-label">{t('hud.grade')}</span>
            <span className="grade-value">{f.num(s.gradePercent, 1)} %</span>
          </div>
        </div>
      </div>
    </div>
  );
}
