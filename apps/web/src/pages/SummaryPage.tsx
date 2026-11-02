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

  if (ride === null) return <Page title={t('summary.title')}>…</Page>;
  if (ride === 'missing') {
    return (
      <Page title={t('summary.title')} back="#/rides">
        <p>{t('summary.notFound')}</p>
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
        <p className="notice">{t('home.unfinished')}</p>
        <p>
          {formatDate(header.startedAt, settings.language)} · {formatDuration(header.durationS)} ·{' '}
          {f.distance(header.distanceM)} {f.distanceUnit}
        </p>
        <button type="button" className="primary" onClick={() => void recover()}>
          {t('history.recover')}
        </button>
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
      <p className="muted">
        {formatDate(header.startedAt, settings.language)} ·{' '}
        {header.route ? loc(header.route.name) : ''}
      </p>
      <dl className="stats-grid">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>{t(k)}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <section className="charts">
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
      {header.laps.length > 0 && (
        <section>
          <h2>{t('summary.laps')}</h2>
          <table className="laps">
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
                <tr key={lap.index} className={i === bestIndex ? 'best' : ''}>
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
        <button type="button" className="primary" onClick={exportFit}>
          {t('summary.export')}
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
        >
          {confirmDelete ? t('summary.deleteConfirm') : t('summary.delete')}
        </button>
      </div>
    </Page>
  );
}
