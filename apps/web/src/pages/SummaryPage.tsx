import {
  encodeRideFit,
  finalizeRide,
  fitFileName,
  type RideHeader,
  type RideSample,
} from '@hrt/recorder';
import { useEffect, useState } from 'react';
import { formatDuration, formatter } from '../format';
import { LineChart } from '../hud/charts';
import { type MessageKey, useT } from '../i18n';
import { navigate } from '../router';
import { rideStore } from '../store/rides';
import { useSettings } from '../store/settings';
import { downloadBlob, formatDate, Page, useLocalized } from './common';

export function SummaryPage({ rideId }: { rideId: string }) {
  const t = useT();
  const settings = useSettings();
  const f = formatter(settings.units, settings.language);
  const loc = useLocalized();
  const [ride, setRide] = useState<
    { header: RideHeader; samples: RideSample[] } | null | 'missing'
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const header = await rideStore.getHeader(rideId);
      if (!header) {
        if (!cancelled) setRide('missing');
        return;
      }
      const samples = await rideStore.getSamples(rideId);
      if (!cancelled) setRide({ header, samples });
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  if (ride === null) {
    return (
      <Page title={t('summary.title')}>
        <div className="grid grid--4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="stat card--skeleton">
              <div className="sk" style={{ height: 20, width: '40%' }} />
              <div className="sk" style={{ height: 54 }} />
            </div>
          ))}
        </div>
      </Page>
    );
  }
  if (ride === 'missing') {
    return (
      <Page title={t('summary.title')} back="#/rides">
        <div className="banner banner--err">
          <span className="banner__icon">✕</span>
          <div className="banner__body">
            <div className="banner__title">{t('summary.notFound')}</div>
          </div>
          <a className="btn btn--secondary" href="#/rides">
            {t('nav.history')}
          </a>
        </div>
      </Page>
    );
  }
  const { header, samples } = ride;

  /** A ride left unfinished (crash, tab closed) is finalized from its saved samples. */
  const recover = async () => {
    const finished = finalizeRide(header, samples, Date.now());
    await rideStore.putHeader(finished);
    setRide({ header: finished, samples });
  };

  if (header.status !== 'finished' || !header.stats) {
    return (
      <Page title={t('summary.title')} back="#/rides">
        <div className="banner">
          <span className="banner__icon">i</span>
          <div className="banner__body">
            <div className="banner__title">{t('home.unfinishedTitle')}</div>
            <div className="banner__text">
              {formatDate(header.startedAt, settings.language)} · {formatDuration(header.durationS)}{' '}
              · {f.distance(header.distanceM)} {f.distanceUnit}
            </div>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => void recover()}>
            {t('history.recover')}
          </button>
        </div>
      </Page>
    );
  }

  const s = header.stats;
  const exportFit = () => {
    const bytes = encodeRideFit(header, samples);
    downloadBlob(bytes, fitFileName(header), 'application/vnd.ant.fit');
  };
  const remove = async () => {
    await rideStore.deleteRide(header.id);
    navigate('/rides');
  };
  const items: [MessageKey, string][] = [
    ['summary.duration', formatDuration(s.durationS)],
    ['summary.distance', `${f.distance(s.distanceM, 2)} ${f.distanceUnit}`],
    ['summary.ascent', `${f.elevation(s.ascentM)} ${f.elevationUnit}`],
    ['summary.avgSpeed', `${f.speed(s.avgSpeedMs)} ${f.speedUnit}`],
    ['summary.avgPower', `${Math.round(s.avgPowerW)} W`],
    ['summary.np', `${Math.round(s.npW)} W`],
    ['summary.maxPower', `${Math.round(s.maxPowerW)} W`],
    ['summary.avgCadence', `${Math.round(s.avgCadenceRpm)} rpm`],
    ['summary.avgHr', s.avgHeartRateBpm === null ? '—' : `${Math.round(s.avgHeartRateBpm)} bpm`],
    ['summary.maxHr', s.maxHeartRateBpm === null ? '—' : `${s.maxHeartRateBpm} bpm`],
    ['summary.work', `${Math.round(s.workKj)} kJ`],
    ['summary.tss', s.tss === null ? '—' : String(Math.round(s.tss))],
  ];
  const bestIndex = header.laps.reduce<number | null>((best, lap, i) => {
    if (lap.trigger !== 'loop') return best;
    if (best === null) return i;
    const b = header.laps[best];
    return b && lap.endS - lap.startS < b.endS - b.startS ? i : best;
  }, null);

  return (
    <Page title={t('summary.title')} back="#/rides">
      <p className="t-body">
        {formatDate(header.startedAt, settings.language)} ·{' '}
        {header.route ? loc(header.route.name) : ''}
      </p>
      <div className="grid grid--4">
        {items.map(([k, v]) => {
          const [value, ...unit] = v.split(' ');
          return (
            <div className="stat" key={k}>
              <span className="stat__label">{t(k)}</span>
              <span className="stat__value">
                {value}
                {unit.length > 0 && <small>{unit.join(' ')}</small>}
              </span>
            </div>
          );
        })}
      </div>
      <section className="card stack">
        <LineChart
          values={samples.map((x) => x.altitudeM)}
          className="chart-elevation"
          fill
          height={80}
        />
        <LineChart values={samples.map((x) => x.powerW)} className="chart-power" height={110} />
        {s.avgHeartRateBpm !== null && (
          <LineChart
            values={samples.map((x) => x.heartRateBpm ?? 0)}
            className="chart-hr"
            height={80}
          />
        )}
      </section>
      {(header.segments?.length ?? 0) > 0 && (
        <section className="card stack">
          <h2 className="t-h2">{t('summary.segments')}</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('summary.segment')}</th>
                <th>{t('summary.lap')}</th>
                <th>{t('summary.time')}</th>
                <th>{t('summary.distance')}</th>
                <th>{t('summary.avgPower')}</th>
                <th>{t('summary.segmentPrevious')}</th>
              </tr>
            </thead>
            <tbody>
              {header.segments?.map((x) => (
                <tr key={`${x.segmentId}-${x.lap}`}>
                  <td>{loc(x.name)}</td>
                  <td>{x.lap}</td>
                  <td className={`num${x.isPb ? ' pb' : ''}`}>
                    {formatDuration(x.durationS)}
                    {x.isPb && <small> {t('summary.segmentPb')}</small>}
                  </td>
                  <td>
                    {f.distance(x.lengthM, 2)} {f.distanceUnit}
                  </td>
                  <td>{x.avgPowerW === null ? '—' : `${x.avgPowerW} W`}</td>
                  <td>{x.previousBestS === null ? '—' : formatDuration(x.previousBestS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {header.laps.length > 0 && (
        <section className="card stack">
          <h2 className="t-h2">{t('summary.laps')}</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('summary.lap')}</th>
                <th>{t('summary.time')}</th>
                <th>{t('summary.distance')}</th>
                <th>{t('summary.avgPower')}</th>
                <th>{t('summary.np')}</th>
                <th>{t('summary.avgHr')}</th>
                <th>{t('summary.ascent')}</th>
              </tr>
            </thead>
            <tbody>
              {header.laps.map((lap, i) => (
                <tr key={lap.index} className={i === bestIndex ? 'is-best' : ''}>
                  <td>
                    {lap.index}
                    {lap.trigger !== 'loop' && (
                      <small> ({t(`summary.trigger.${lap.trigger}`)})</small>
                    )}
                  </td>
                  <td>{formatDuration(lap.endS - lap.startS)}</td>
                  <td>
                    {f.distance(lap.stats.distanceM, 2)} {f.distanceUnit}
                  </td>
                  <td>{Math.round(lap.stats.avgPowerW)} W</td>
                  <td>{Math.round(lap.stats.npW)} W</td>
                  <td>
                    {lap.stats.avgHeartRateBpm === null
                      ? '—'
                      : Math.round(lap.stats.avgHeartRateBpm)}
                  </td>
                  <td>
                    {f.elevation(lap.stats.ascentM)} {f.elevationUnit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <div className="row">
        <button type="button" className="btn btn--primary btn--lg" onClick={exportFit}>
          {t('summary.export')}
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
        >
          {confirmDelete ? t('summary.deleteConfirm') : t('summary.delete')}
        </button>
      </div>
    </Page>
  );
}
