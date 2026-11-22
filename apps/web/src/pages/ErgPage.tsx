// ERG page (no road, no 3D world), laid out as in the design "Mode ERG":
// `#/erg` is the block editor, `#/erg/run` the full-screen session.
// Styles: apps/web/src/design/hrt-erg.css (loaded after hrt.css).

import type { Interval } from '@hrt/workouts';
import QRCode from 'qrcode';
import { type ReactNode, useEffect, useMemo, useReducer, useState } from 'react';
import { remoteLink } from '../controls/runtime';
import { formatDuration } from '../format';
import { zoneIndex } from '../hud/colors';
import { type MessageKey, useT } from '../i18n';
import {
  blockError,
  blocksToWorkout,
  blockTooShort,
  DEFAULT_FREE_W,
  ERG_ROUTE_ID,
  type ErgBlock,
  ergDeviation,
  flatErgRoute,
  MAX_ERG_W,
  validBlocks,
  windowIntervals,
  zoomWindow,
} from '../ride/erg-workout';
import { DEFAULT_WORKOUT_FTP_W, ERG_STEP_W } from '../ride/ride-session';
import { useRideController } from '../ride/useRideController';
import { navigate } from '../router';
import { designAttrs } from '../shell/theme';
import { deviceHub, useDevices } from '../store/devices';
import { getSettings, useSettings } from '../store/settings';
import { useRemote } from './ControlsPage';
import { ErgChart } from './ErgChart';

const KEY = 'hrt.erg.draft.v1';
/** Width of the zoomed graph, s. */
const ZOOM_SPAN_S = 600;

interface Draft {
  freeW: number;
  blocks: ErgBlock[];
}

const newId = () => crypto.randomUUID();

const defaultBlock = (kind: ErgBlock['kind'], prev?: ErgBlock): ErgBlock => ({
  id: newId(),
  kind,
  durationS: prev?.durationS ?? 300,
  fromW: prev?.toW ?? DEFAULT_FREE_W,
  toW: kind === 'ramp' ? (prev?.toW ?? DEFAULT_FREE_W) + 50 : (prev?.toW ?? DEFAULT_FREE_W),
});

function loadDraft(): Draft {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Draft> | null;
    if (o && typeof o.freeW === 'number' && Array.isArray(o.blocks)) {
      return {
        freeW: Math.min(MAX_ERG_W, Math.max(0, o.freeW)),
        blocks: o.blocks.filter(
          (b): b is ErgBlock =>
            !!b &&
            typeof b.id === 'string' &&
            (b.kind === 'steady' || b.kind === 'ramp') &&
            [b.durationS, b.fromW, b.toW].every((n) => typeof n === 'number' && Number.isFinite(n)),
        ),
      };
    }
  } catch {
    // Unreadable storage: start from the defaults.
  }
  return { freeW: DEFAULT_FREE_W, blocks: [] };
}

function saveDraft(d: Draft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // The page still works without remembering.
  }
}

/** Icon paths of the design (24×24, stroke). */
const ICONS = {
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M7 4l13 8-13 8z" />,
  check: <path d="M5 12l5 5 9-10" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  spin: <path d="M20 12a8 8 0 1 1-3-6.2" />,
  warn: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" />
      <rect x="14" y="4" width="6" height="6" />
      <rect x="4" y="14" width="6" height="6" />
      <path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2" />
    </>
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
} as const;

function Icon({ name, size }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

/** Whole-number field of the editor (bounds are checked by the page, not clamped). */
function NumInput({
  label,
  unit,
  value,
  onChange,
  error = false,
  width,
  pad = 0,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  error?: boolean;
  width?: number;
  pad?: number;
}) {
  return (
    <div className="input-wrap" style={width ? { width } : undefined}>
      <input
        className={`input${error ? ' is-error' : ''}`}
        inputMode="numeric"
        aria-label={label}
        aria-invalid={error || undefined}
        value={Number.isFinite(value) ? String(value).padStart(pad, '0') : ''}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          onChange(digits === '' ? 0 : Number(digits));
        }}
      />
      <span className="unit">{unit}</span>
    </div>
  );
}

/** Intervals of the blocks, flattened in watts. */
function flattenBlocks(blocks: readonly ErgBlock[]): Interval[] {
  let t = 0;
  return validBlocks(blocks).map((b, index) => {
    const iv = {
      startS: t,
      durationS: Math.round(b.durationS),
      fromW: b.fromW,
      toW: b.kind === 'ramp' ? b.toW : b.fromW,
      label: '',
      index,
    };
    t += iv.durationS;
    return iv;
  });
}

const maxPower = (iv: readonly Interval[]) =>
  Math.max(0, ...iv.map((i) => Math.max(i.fromW, i.toW)));

function BlockRow({
  index,
  block,
  focused,
  onChange,
  onDuplicate,
  onRemove,
}: {
  index: number;
  block: ErgBlock;
  focused: boolean;
  onChange: (p: Partial<ErgBlock>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const err = blockError(block);
  const short = blockTooShort(block);
  const mins = Math.floor(block.durationS / 60);
  const secs = block.durationS % 60;
  const ramp = block.kind === 'ramp';
  const powerErr = err === 'power';
  const durErr = err === 'duration' || short;
  return (
    // biome-ignore lint/a11y/useSemanticElements: rows are laid out by the design grid
    <div
      className={`ergb-row${err ? ' is-error' : ''}${focused ? ' is-focus' : ''}`}
      role="listitem"
    >
      <span className="ergb-num">{index + 1}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: segmented control styled by the design */}
      <div className="ergb-kind" role="group" aria-label={t('erg.col.type')}>
        <button
          type="button"
          aria-pressed={!ramp}
          onClick={() => onChange({ kind: 'steady', toW: block.fromW })}
        >
          {t('erg.steady')}
        </button>
        <button
          type="button"
          aria-pressed={ramp}
          onClick={() =>
            onChange({
              kind: 'ramp',
              toW: block.toW === block.fromW ? block.fromW + 50 : block.toW,
            })
          }
        >
          {t('erg.ramp')}
        </button>
      </div>
      <div className="ergb-dur">
        <NumInput
          label={t('erg.minutes')}
          unit={t('erg.min')}
          value={mins}
          error={durErr}
          onChange={(m) => onChange({ durationS: m * 60 + secs })}
        />
        <NumInput
          label={t('erg.seconds')}
          unit={t('erg.sec')}
          value={secs}
          pad={2}
          error={durErr}
          onChange={(s) => onChange({ durationS: mins * 60 + Math.min(59, s) })}
        />
      </div>
      <div className="ergb-pw">
        {ramp ? (
          <>
            <NumInput
              label={t('erg.fromW')}
              unit={t('erg.fromUnit')}
              value={block.fromW}
              width={160}
              error={powerErr && (block.fromW < 0 || block.fromW > MAX_ERG_W)}
              onChange={(w) => onChange({ fromW: w })}
            />
            <span className="t-2">→</span>
            <NumInput
              label={t('erg.toW')}
              unit={t('erg.toUnit')}
              value={block.toW}
              width={160}
              error={powerErr && (block.toW < 0 || block.toW > MAX_ERG_W)}
              onChange={(w) => onChange({ toW: w })}
            />
          </>
        ) : (
          <NumInput
            label={t('erg.watts')}
            unit="W"
            value={block.fromW}
            width={160}
            error={powerErr}
            onChange={(w) => onChange({ fromW: w, toW: w })}
          />
        )}
      </div>
      <div className="ergb-acts">
        <button
          className="btn btn--secondary btn--icon btn--sm"
          type="button"
          aria-label={t('erg.duplicate')}
          title={t('erg.duplicate')}
          onClick={onDuplicate}
        >
          <Icon name="copy" size={22} />
        </button>
        <button
          className="btn btn--secondary btn--icon btn--sm"
          type="button"
          aria-label={t('erg.remove')}
          title={t('erg.remove')}
          onClick={onRemove}
        >
          <Icon name="trash" size={22} />
        </button>
      </div>
      {err && (
        <div className="field__error ergb-err">
          <Icon name="warn" size={18} /> {err === 'power' ? t('erg.errPower') : t('erg.errMax')}
        </div>
      )}
    </div>
  );
}

export function ErgPage() {
  const t = useT();
  const devices = useDevices();
  const [draft, setDraft] = useState(loadDraft);
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => saveDraft(draft), [draft]);
  const update = (blocks: ErgBlock[]) => setDraft((d) => ({ ...d, blocks }));
  const patch = (id: string, p: Partial<ErgBlock>) =>
    update(draft.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)));

  const playable = validBlocks(draft.blocks);
  const totalS = playable.reduce((a, b) => a + b.durationS, 0);
  const structured = playable.length > 0;
  const hasError = draft.blocks.some((b) => blockError(b) !== null);
  const hasShort = draft.blocks.some(blockTooShort);
  const ftp = getSettings().profile.ftpW ?? DEFAULT_WORKOUT_FTP_W;
  const intervals = useMemo(() => flattenBlocks(draft.blocks), [draft.blocks]);
  const noDevice =
    !deviceHub.hasPowerSource &&
    !Object.values(devices).some((s) => s.status === 'connected' || s.status === 'connecting');
  const setFree = (w: number) =>
    setDraft((d) => ({ ...d, freeW: Math.min(MAX_ERG_W, Math.max(0, Math.round(w))) }));

  const add = (kind: ErgBlock['kind']) => {
    const b = defaultBlock(kind, draft.blocks.at(-1));
    setFocusId(b.id);
    update([...draft.blocks, b]);
  };

  return (
    <main className="page__main">
      <div className="page__head">
        <div className="stack" style={{ gap: 8 }}>
          <span className="t-eyebrow">{t('erg.eyebrow')}</span>
          <h1 className="t-h1">{t('erg.title')}</h1>
        </div>
      </div>
      <p className="t-body" style={{ maxWidth: 1100, marginTop: -12 }}>
        {t('erg.help')}
      </p>

      {noDevice && (
        <div className="banner banner--info" role="status">
          <span className="banner__icon">i</span>
          <div className="banner__body">
            <div className="banner__title">{t('erg.noDevice')}</div>
          </div>
          <a className="btn btn--secondary btn--sm" href="#/devices">
            {t('erg.connect')}
          </a>
        </div>
      )}
      {hasShort && (
        <div className="banner banner--warn" role="status">
          <span className="banner__icon">!</span>
          <div className="banner__body">
            <div className="banner__title">{t('erg.tooShort')}</div>
          </div>
        </div>
      )}

      <div className="ergb-cols">
        <section className="card stack" style={{ gap: 16 }}>
          <div className="row">
            <h2 className="t-h2">{t('erg.blocks')}</h2>
            <span className="spacer" />
            {draft.blocks.length > 0 && <span className="t-small">{t('erg.limits')}</span>}
          </div>

          {draft.blocks.length === 0 ? (
            <div className="ergb-empty">
              <span className="ergb-empty__ic">
                <Icon name="list" />
              </span>
              <h3 className="t-h2" style={{ fontSize: 30 }}>
                {t('erg.emptyTitle')}
              </h3>
              <p className="t-body" style={{ maxWidth: 560 }}>
                {t('erg.emptyText')}
              </p>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  className="btn btn--primary btn--lg"
                  type="button"
                  onClick={() => add('steady')}
                >
                  <Icon name="plus" size={26} /> {t('erg.addSteady')}
                </button>
                <button
                  className="btn btn--secondary btn--lg"
                  type="button"
                  onClick={() => add('ramp')}
                >
                  <Icon name="plus" size={26} /> {t('erg.addRamp')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="ergb-head" aria-hidden="true">
                <span>{t('erg.col.n')}</span>
                <span>{t('erg.col.type')}</span>
                <span>{t('erg.col.duration')}</span>
                <span>{t('erg.col.power')}</span>
                <span style={{ textAlign: 'right' }}>{t('erg.col.actions')}</span>
              </div>
              {/* biome-ignore lint/a11y/useSemanticElements: rows are laid out by the design grid */}
              <div className="stack" style={{ gap: 10 }} role="list">
                {draft.blocks.map((b, i) => (
                  <BlockRow
                    key={b.id}
                    index={i}
                    block={b}
                    focused={b.id === focusId}
                    onChange={(p) => patch(b.id, p)}
                    onDuplicate={() =>
                      update([
                        ...draft.blocks.slice(0, i + 1),
                        { ...b, id: newId() },
                        ...draft.blocks.slice(i + 1),
                      ])
                    }
                    onRemove={() => update(draft.blocks.filter((x) => x.id !== b.id))}
                  />
                ))}
                <div
                  className="ergb-row ergb-planned"
                  aria-disabled="true"
                  style={{ gridTemplateColumns: '52px 1fr auto' }}
                >
                  <span className="ergb-grip" aria-hidden="true">
                    ⋮⋮
                  </span>
                  <span className="t-small">{t('erg.plannedRow')}</span>
                  <span className="badge">{t('erg.planned')}</span>
                </div>
              </div>
            </>
          )}

          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            {draft.blocks.length > 0 && (
              <>
                <button className="btn btn--secondary" type="button" onClick={() => add('steady')}>
                  <Icon name="plus" size={22} /> {t('erg.addSteady')}
                </button>
                <button className="btn btn--secondary" type="button" onClick={() => add('ramp')}>
                  <Icon name="plus" size={22} /> {t('erg.addRamp')}
                </button>
              </>
            )}
            <button
              className="btn btn--ghost ergb-planned"
              type="button"
              aria-disabled="true"
              style={{ border: '2px dashed var(--line-strong)' }}
            >
              <Icon name="copy" size={22} /> {t('erg.repeat')}{' '}
              <span className="badge" style={{ marginLeft: 6 }}>
                {t('erg.planned')}
              </span>
            </button>
            {draft.blocks.length === 0 && <span className="t-hint">{t('erg.plannedHint')}</span>}
          </div>

          {structured && (
            <div className="ergb-preview stack" style={{ gap: 12 }}>
              <div className="row">
                <span className="t-eyebrow">{t('erg.preview')}</span>
                <span className="spacer" />
                <span className="t-small t-0">
                  <b className="num" style={{ fontSize: 24 }}>
                    {formatDuration(totalS)}
                  </b>{' '}
                  · {t('erg.blocksCount', { n: playable.length })}
                </span>
              </div>
              <ErgChart
                intervals={intervals}
                ftpW={ftp}
                totalS={totalS}
                topW={Math.max(ftp * 1.3, maxPower(intervals) * 1.08)}
                width={1080}
                height={250}
                label={t('erg.previewAria')}
                showFtp
                axis
              />
              <div className="ergb-legend">
                {[1, 2, 3, 4, 5, 6].map((z) => (
                  <span
                    key={z}
                    className={`erg-zpill erg-zpill--sm zmark zmark--${z}`}
                    style={{
                      ['--zc' as string]: `var(--z${z})`,
                      fontSize: 15,
                      height: 26,
                      minWidth: 44,
                    }}
                  >
                    Z{z}
                  </span>
                ))}
                <span className="ergb-ftp">
                  <i />
                  {t('erg.ftpLine', { w: ftp })} <span className="t-2">{t('erg.ftpDefault')}</span>
                </span>
              </div>
            </div>
          )}
        </section>

        <div className="stack" style={{ gap: 'var(--sp-5)' }}>
          <section className="card stack" style={{ gap: 16 }}>
            <h2 className="t-h2">{t('erg.free')}</h2>
            <p className="t-body">{t('erg.freeHelp')}</p>
            <div className="field">
              <label className="field__label" htmlFor="erg-free-w">
                {t('erg.freeW')}
              </label>
              <div className="row" style={{ gap: 10 }}>
                <button
                  className="btn btn--secondary btn--icon"
                  type="button"
                  aria-label="−5 W"
                  onClick={() => setFree(draft.freeW - 5)}
                >
                  <Icon name="minus" size={24} />
                </button>
                <div className="input-wrap" style={{ width: 200 }}>
                  <input
                    id="erg-free-w"
                    className="input"
                    inputMode="numeric"
                    style={{ textAlign: 'center', fontSize: 30 }}
                    value={draft.freeW}
                    onChange={(e) => setFree(Number(e.target.value.replace(/\D/g, '')))}
                  />
                  <span className="unit">W</span>
                </div>
                <button
                  className="btn btn--secondary btn--icon"
                  type="button"
                  aria-label="+5 W"
                  onClick={() => setFree(draft.freeW + 5)}
                >
                  <Icon name="plus" size={24} />
                </button>
                <span className="t-hint">{t('erg.freeStep')}</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 28, marginTop: 8 }}>
        <span className="t-hint" style={{ textAlign: 'right' }}>
          {hasError
            ? t('erg.fixFields')
            : structured || draft.blocks.length > 0
              ? t('erg.draftSaved')
              : t('erg.draftFree')}
        </span>
        <button
          className="btn btn--primary btn--xl"
          type="button"
          disabled={hasError}
          onClick={() => navigate('/erg/run')}
        >
          <Icon name="play" size={44} />{' '}
          {structured
            ? t('erg.startSession', { duration: formatDuration(totalS) })
            : t('erg.startFree', { watts: draft.freeW })}
        </button>
      </div>
    </main>
  );
}

/** QR code of an address, drawn as an image (no HTML injection). */
function ErgQr({ text }: { text: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 0, width: 360 }).then(
      (url) => alive && setSrc(url),
      () => alive && setSrc(''),
    );
    return () => {
      alive = false;
    };
  }, [text]);
  return (
    <div className="erg-qr">
      {src && (
        <img src={src} alt={text} style={{ width: '100%', height: '100%', display: 'block' }} />
      )}
    </div>
  );
}

/** Phone link of the free ERG (states `off`, `search`, `notfound`, `wait`, `ok`). */
function PhoneLink() {
  const t = useT();
  const remote = useRemote();
  const [chosen, setChosen] = useState(0);
  const base = remote.urls[Math.min(chosen, remote.urls.length - 1)];
  const phoneUrl = base ? remoteLink.phoneUrl(base) : null;

  if (remote.status === 'off') {
    return (
      <div className="erg-link" data-state="off">
        <span className="erg-link__ic">
          <Icon name="phone" />
        </span>
        <span className="erg-link__t">{t('erg.link.offTitle')}</span>
        <span className="erg-link__s">{t('erg.link.offSub')}</span>
        <button
          className="erg-btn erg-btn--primary"
          type="button"
          style={{ alignSelf: 'center' }}
          onClick={() => remoteLink.setEnabled(true)}
        >
          <Icon name="qr" /> {t('erg.link.enable')}
        </button>
      </div>
    );
  }
  if (remote.status === 'unavailable') {
    return (
      <div className="erg-link" data-state="notfound">
        <span className="erg-link__ic">
          <Icon name="warn" />
        </span>
        <span className="erg-link__t">{t('erg.link.notFound')}</span>
        <button
          className="erg-btn"
          type="button"
          style={{ alignSelf: 'center' }}
          onClick={() => {
            remoteLink.setEnabled(false);
            remoteLink.setEnabled(true);
          }}
        >
          <Icon name="spin" /> {t('erg.link.retry')}
        </button>
      </div>
    );
  }
  if (remote.status === 'connecting' || !phoneUrl) {
    return (
      <div className="erg-link" data-state="search">
        <span className="erg-link__ic">
          <Icon name="spin" />
        </span>
        <span className="erg-link__t">{t('erg.link.searchTitle')}</span>
        <span className="erg-link__s">{t('erg.link.searchSub')}</span>
      </div>
    );
  }
  const connected = remote.status === 'connected';
  return (
    <div className="erg-link" data-state={connected ? 'ok' : 'wait'}>
      <ErgQr text={phoneUrl} />
      <div className="erg-link__txt">
        {connected ? (
          <>
            <span className="erg-link__t">{t('erg.link.scan')}</span>
            <span className="erg-link__count">
              <span className="dot" />
              {t('erg.link.phones', { n: remote.phones })}
            </span>
          </>
        ) : (
          <>
            <span className="erg-link__t">{t('erg.link.waitTitle')}</span>
            <span className="erg-link__s">{t('erg.link.waitSub')}</span>
          </>
        )}
        {remote.urls.length > 1 && (
          <select
            aria-label={t('erg.link.address')}
            value={chosen}
            onChange={(e) => setChosen(Number(e.target.value))}
          >
            {remote.urls.map((u, i) => (
              <option key={u} value={i}>
                {u.replace(/^https?:\/\//, '')}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

type AlertKind = 'spiral' | 'mute' | 'reconnect';

function ErgAlert({ kind }: { kind: AlertKind }) {
  const t = useT();
  const key = `erg.alert.${kind}` as MessageKey;
  const sub = `erg.alert.${kind}Sub` as MessageKey;
  return (
    <div
      className={`erg-alert${kind === 'reconnect' ? ' erg-alert--info erg-alert--spin' : ''}`}
      role="status"
    >
      <Icon name={kind === 'mute' ? 'warn' : 'spin'} />
      <span>
        {t(key)}
        <small>{t(sub)}</small>
      </span>
    </div>
  );
}

function Metric({
  label,
  sub,
  value,
  unit,
  dim,
  tone,
  children,
}: {
  label: string;
  sub?: string;
  value: number;
  unit: string;
  dim: boolean;
  tone?: 'high' | 'low';
  children?: ReactNode;
}) {
  return (
    <section
      className={`erg-metric${dim ? ' is-dim' : ''}${tone ? ` is-${tone}` : ''}`}
      aria-label={label}
    >
      <span className="erg-metric__label">
        {label}
        {sub && <span style={{ fontWeight: 500, letterSpacing: '.08em' }}> · {sub}</span>}
      </span>
      <div className="erg-metric__row">
        <span className="erg-metric__value">{value}</span>
        <span className="erg-metric__unit">{unit}</span>
      </div>
      <div className="erg-metric__foot">{children}</div>
    </section>
  );
}

const zoneStyle = (z: number) => ({ ['--zc' as string]: `var(--z${z})` });

/** Full-screen session. */
export function ErgRunPage() {
  const t = useT();
  const settings = useSettings();
  const devices = useDevices();
  // Built once: a new workout object would make the controller start a new session.
  const [{ draft, workout }] = useState(() => {
    const d = loadDraft();
    const valid = d.blocks.every((b) => blockError(b) === null);
    return { draft: d, workout: valid ? blocksToWorkout(d.blocks, t('erg.sessionName')) : null };
  });
  const route = useMemo(flatErgRoute, []);
  const ride = useRideController(route, ERG_ROUTE_ID, null, workout, null);
  const { session } = ride;
  const free = workout === null;
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Free ERG starts at the chosen power and keeps its target if a button turns ERG off.
  const [lastTarget, setLastTarget] = useState(draft.freeW);
  useEffect(() => {
    if (free) session.setErg(draft.freeW);
  }, [session, free, draft.freeW]);
  useEffect(() => {
    const id = setInterval(() => {
      const s = session.state;
      if (free) {
        if (s.ergTargetW !== null) setLastTarget(s.ergTargetW);
        else session.setErg(lastTarget);
      }
      tick();
    }, 250);
    return () => clearInterval(id);
  }, [session, free, lastTarget]);
  useEffect(() => session.on((e) => e.type === 'workoutDone' && setDone(true)), [session]);
  // The phone link is needed in free mode only.
  useEffect(() => {
    if (free) remoteLink.resume();
  }, [free]);
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setConfirming(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  const s = session.state;
  const ftp = getSettings().profile.ftpW ?? DEFAULT_WORKOUT_FTP_W;
  const w = s.workout;
  const intervals = session.workoutIntervals;
  const totalS = w?.totalS ?? 0;
  const topW = Math.max(ftp * 1.2, maxPower(intervals) * 1.08 + Math.max(0, w?.offsetW ?? 0));
  const [zoomFrom, zoomTo] = w ? zoomWindow(w.elapsedS, w.totalS, ZOOM_SPAN_S) : [0, 0];
  const zoomed = useMemo(
    () => windowIntervals(intervals, zoomFrom, zoomTo),
    [intervals, zoomFrom, zoomTo],
  );
  const finished = done || w?.finished === true;

  const finish = async () => {
    const header = await ride.finish();
    navigate(`/rides/${header.id}`);
  };
  const discard = async () => {
    await ride.discard();
    navigate('/erg');
  };

  const target = s.ergTargetW;
  const reconnecting = devices.trainer.status === 'reconnecting';
  const alert: AlertKind | null = s.paused
    ? null
    : reconnecting
      ? 'reconnect'
      : s.powerStale
        ? 'mute'
        : s.ergState === 'spiral' || s.ergState === 'stopped'
          ? 'spiral'
          : null;
  const dim = s.paused || alert !== null;
  const dev =
    !dim && !finished && target !== null && target > 0 ? ergDeviation(s.power3sW, target) : null;
  const tone = dev && dev.kind !== 'ok' ? dev.kind : undefined;
  const current = w ? intervals[w.index] : undefined;
  const currentZone = current ? zoneIndex((current.fromW + current.toW) / 2, ftp) : 1;

  return (
    <div
      className="hrt erg"
      {...designAttrs(settings, 'dark')}
      style={{ width: '100vw', height: '100vh' }}
    >
      <header className="erg__top">
        <div className="erg__id">
          <span className="erg__name">{w ? w.name : t('erg.freeTitle')}</span>
          <span className="erg__clock num">
            {formatDuration(s.timeS)}
            {w && <i> / {formatDuration(w.totalS)}</i>}
          </span>
        </div>
        <span className="erg__spacer" />
        {s.heartRateBpm !== null && (
          <div className="erg__hr" title="FC">
            <b>♥</b>
            {s.heartRateBpm}
            <small>bpm</small>
          </div>
        )}
        <div className="erg__actions">
          <button className="erg-btn" type="button" onClick={() => session.togglePause()}>
            <Icon name={s.paused ? 'play' : 'pause'} />{' '}
            {s.paused ? t('erg.resume') : t('erg.pause')}
          </button>
          <button className="erg-btn erg-btn--primary" type="button" onClick={() => void finish()}>
            <Icon name="check" /> {t('erg.finish')}
          </button>
          <button
            className="erg-btn erg-btn--danger"
            type="button"
            onClick={() => setConfirming(true)}
          >
            <Icon name="close" /> {t('erg.discard')}
          </button>
        </div>
      </header>

      <main className="erg__main">
        <Metric
          label={t('erg.power')}
          sub={t('erg.avg3')}
          value={Math.round(s.power3sW)}
          unit="W"
          dim={dim}
          tone={tone}
        >
          <span className="erg-target" style={alert === 'spiral' ? { opacity: 0.55 } : undefined}>
            <small>{t('erg.target')}</small>
            {finished || target === null ? '—' : target}
            {!finished && target !== null && (
              <small style={{ marginLeft: '.15em', marginRight: 0 }}>W</small>
            )}
            {w && w.offsetW !== 0 && !finished && (
              <span className="erg-offset">
                ({w.offsetW > 0 ? '+' : ''}
                {w.offsetW})
              </span>
            )}
            {alert === 'spiral' && (
              <small style={{ marginLeft: '.4em', color: 'var(--warn)' }}>
                · {t('erg.waiting')}
              </small>
            )}
          </span>
          {dev && (
            <>
              <span className={`erg-dev erg-dev--${dev.kind}`}>
                <span aria-hidden="true">
                  {dev.kind === 'high' ? '▲' : dev.kind === 'low' ? '▼' : '✓'}
                </span>
                {dev.kind !== 'ok' && (
                  <span className="num">
                    {dev.diffW > 0 ? '+' : ''}
                    {dev.diffW} W
                  </span>
                )}
                <b>
                  {dev.kind === 'high'
                    ? t('erg.devHigh')
                    : dev.kind === 'low'
                      ? t('erg.devLow')
                      : t('erg.devOk')}
                </b>
              </span>
              <div
                className="erg-gauge"
                style={{ ['--pos' as string]: `${dev.gaugePct}%` }}
                role="img"
                aria-label={t('erg.devOk')}
              >
                <i />
                <s>+</s>
              </div>
            </>
          )}
        </Metric>
        <Metric
          label={t('erg.cadence')}
          value={Math.round(s.cadenceRpm)}
          unit={t('erg.rpm')}
          dim={dim}
        />
        {alert && <ErgAlert kind={alert} />}
      </main>

      <section className="erg__bottom">
        {w ? (
          <>
            {finished ? (
              <div className="erg-status erg-status--done" role="status">
                <Icon name="check" />
                <span>{t('erg.done')}</span>
              </div>
            ) : (
              <div className="erg-status">
                {current && (
                  <span
                    className={`erg-zpill zmark zmark--${currentZone}`}
                    style={zoneStyle(currentZone)}
                  >
                    Z{currentZone}
                  </span>
                )}
                <span className="erg-status__kind">
                  {current && current.fromW !== current.toW
                    ? t('erg.rampLabel', { from: current.fromW, to: current.toW })
                    : t('erg.steady')}
                </span>
                <span className="erg-status__time">{formatDuration(w.remainingS)}</span>
                {w.next && (
                  <div className="erg-status__next">
                    {t('erg.next')}{' '}
                    <span
                      className={`erg-zpill erg-zpill--sm zmark zmark--${zoneIndex(w.next.targetW, ftp)}`}
                      style={zoneStyle(zoneIndex(w.next.targetW, ftp))}
                    >
                      Z{zoneIndex(w.next.targetW, ftp)}
                    </span>
                    <b>{w.next.targetW} W</b>
                  </div>
                )}
              </div>
            )}
            <div className="erg-zoom">
              <ErgChart
                intervals={zoomed}
                ftpW={ftp}
                totalS={zoomTo - zoomFrom}
                topW={topW}
                elapsedS={w.elapsedS - zoomFrom}
                width={1848}
                height={144}
                adjustW={w.offsetW}
                label={t('erg.zoomAria')}
              />
              <span className="erg-zoom__cap">{t('erg.zoomCap')}</span>
            </div>
            <div className="erg-overview">
              <ErgChart
                intervals={intervals}
                ftpW={ftp}
                totalS={totalS}
                topW={topW}
                elapsedS={w.elapsedS}
                width={1848}
                height={57}
                adjustW={w.offsetW}
                label={t('erg.overviewAria')}
              />
            </div>
          </>
        ) : (
          <div className="erg-free">
            <div className="erg-adjust">
              <div className="erg-adjust__row">
                {[-2 * ERG_STEP_W, -ERG_STEP_W, ERG_STEP_W, 2 * ERG_STEP_W].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`erg-adjust__btn erg-adjust__btn--${d < 0 ? 'minus' : 'plus'}`}
                    onClick={() => session.adjustErg(d)}
                  >
                    {d > 0 ? '+' : '−'}
                    {Math.abs(d)}
                    <small>W</small>
                  </button>
                ))}
              </div>
              <div className="erg-adjust__hint">
                <span className="kbd kbd--pad">−</span>
                <span className="kbd kbd--pad">+</span>
                {t('erg.zwiftHint')}
              </div>
            </div>
            <PhoneLink />
          </div>
        )}
      </section>

      {s.paused && (
        <div className="erg-veil" role="status">
          <div>
            <div className="erg-veil__t">{t('erg.pauseTitle')}</div>
            <div className="erg-veil__s">
              {t('erg.pauseHint')} <b className="kbd">Espace</b>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="erg-confirm" role="alertdialog" aria-modal="true">
          <div className="erg-confirm__card">
            <div className="erg-confirm__t">{t('erg.confirmTitle')}</div>
            <div className="erg-confirm__s">{t('erg.confirmText')}</div>
            <div className="erg-confirm__acts">
              <button
                className="erg-btn"
                type="button"
                ref={(el) => el?.focus()}
                onClick={() => setConfirming(false)}
              >
                {t('erg.cancel')}
              </button>
              <button
                className="erg-btn erg-btn--danger"
                type="button"
                onClick={() => void discard()}
              >
                {t('erg.discard')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
