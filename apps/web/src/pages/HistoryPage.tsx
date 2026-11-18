import type { RideHeader } from '@hrt/recorder';
import { encodeRideFit, fitFileName } from '@hrt/recorder';
import { useEffect, useState } from 'react';
import { formatDuration, formatter } from '../format';
import { useT } from '../i18n';
import { rideStore } from '../store/rides';
import { useSettings } from '../store/settings';
import { makeZip } from '../zip';
import { downloadBlob, formatDate, Page, useLocalized } from './common';

const PAGE_SIZE = 10;

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

  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const pageCount = Math.max(1, Math.ceil((rides?.length ?? 0) / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const shown = rides?.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE) ?? [];
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const togglePage = () =>
    setPicked((cur) => {
      const next = new Set(cur);
      for (const r of shown) allShown ? next.delete(r.id) : next.add(r.id);
      return next;
    });
  const exportZip = async () => {
    setBusy(true);
    try {
      const entries = [];
      for (const r of rides ?? []) {
        if (!picked.has(r.id) || r.status !== 'finished') continue;
        const samples = await rideStore.getSamples(r.id);
        entries.push({ name: fitFileName(r), data: encodeRideFit(r, samples) });
      }
      if (entries.length)
        downloadBlob(
          makeZip(entries) as Uint8Array<ArrayBuffer>,
          'hrt-rides.zip',
          'application/zip',
        );
    } finally {
      setBusy(false);
    }
  };
  const removePicked = async () => {
    setBusy(true);
    try {
      for (const id of picked) await rideStore.deleteRide(id);
      setRides((cur) => cur?.filter((r) => !picked.has(r.id)) ?? cur);
      setPicked(new Set());
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title={t('history.title')} eyebrow={rides ? `${rides.length}` : undefined}>
      {rides === null && (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card card--skeleton" style={{ height: 88 }}>
              <div className="sk" style={{ height: 28, width: '50%' }} />
            </div>
          ))}
        </div>
      )}
      {rides?.length === 0 && (
        <div className="empty">
          <h2 className="t-h2">{t('history.empty')}</h2>
          <a className="btn btn--primary" href="#/routes">
            {t('home.ride')}
          </a>
        </div>
      )}
      {picked.size > 0 && (
        <div className="banner">
          <div className="banner__body">
            <div className="banner__title">{t('history.selected', { n: picked.size })}</div>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={() => void exportZip()}
          >
            {t('history.exportZip')}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy}
            onClick={() => (confirm ? void removePicked() : setConfirm(true))}
          >
            {confirm ? t('summary.deleteConfirm') : t('summary.delete')}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setPicked(new Set());
              setConfirm(false);
            }}
          >
            {t('workouts.cancel')}
          </button>
        </div>
      )}
      {rides && rides.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 64 }}>
                  <label className="check">
                    <input
                      type="checkbox"
                      aria-label={t('history.selectPage')}
                      checked={allShown}
                      onChange={togglePage}
                    />
                  </label>
                </th>
                <th>{t('summary.date')}</th>
                <th>{t('summary.route')}</th>
                <th className="r">{t('summary.duration')}</th>
                <th className="r">{t('summary.distance')}</th>
                <th className="r">{t('summary.avgPower')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <label className="check">
                      <input
                        type="checkbox"
                        aria-label={formatDate(r.startedAt, settings.language)}
                        checked={picked.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </label>
                  </td>
                  <td>{formatDate(r.startedAt, settings.language)}</td>
                  <td>
                    <a className="row-link t-0" href={`#/rides/${r.id}`}>
                      <b>{r.route ? loc(r.route.name) : '—'}</b>
                    </a>
                  </td>
                  <td className="num">{formatDuration(r.durationS)}</td>
                  <td className="num">
                    {f.distance(r.distanceM)} {f.distanceUnit}
                  </td>
                  <td className="num">{r.stats ? `${Math.round(r.stats.avgPowerW)} W` : ''}</td>
                  <td className="r">
                    {r.status === 'recording' ? (
                      <a className="btn btn--secondary btn--sm" href={`#/rides/${r.id}`}>
                        {t('history.recover')}
                      </a>
                    ) : r.bestLapS !== null ? (
                      <span className="badge badge--accent">
                        {t('hud.lapBest')} {formatDuration(r.bestLapS)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageCount > 1 && (
            <div className="row" style={{ justifyContent: 'center', padding: 16 }}>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                aria-label={t('history.prev')}
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                ←
              </button>
              <span className="num t-0" style={{ fontSize: 24 }}>
                {current + 1} / {pageCount}
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                aria-label={t('history.next')}
                disabled={current >= pageCount - 1}
                onClick={() => setPage(current + 1)}
              >
                →
              </button>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
