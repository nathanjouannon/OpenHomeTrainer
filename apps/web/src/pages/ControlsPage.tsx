import {
  ACTION_CATEGORIES,
  type ActionCategory,
  type Binding,
  type BindingType,
  bindingsFor,
  type ControlAction,
  type InputEvent,
  REPEATABLE_ACTIONS,
  withBinding,
  withoutBinding,
} from '@hrt/controls';
import QRCode from 'qrcode';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  attachInputs,
  controlsHub,
  gamepads,
  obcControllers,
  remoteLink,
  zwiftControllers,
} from '../controls/runtime';
import { type MessageKey, useT } from '../i18n';
import {
  createProfile,
  deleteProfile,
  isDefaultProfile,
  saveProfile,
  setActiveProfile,
  useControls,
} from '../store/controls';
import { Page } from './common';

const OBC_NAMES: Record<number, string> = {
  1: 'Shift +',
  2: 'Shift −',
  3: 'Gear',
  48: 'Difficulty +',
  49: 'Difficulty −',
  50: 'Skip interval',
  51: 'Pause',
  52: 'Resume',
  53: 'Lap',
  54: 'Previous interval',
  55: 'U-turn',
  60: 'Cruise',
  64: 'Camera',
  68: 'HUD',
};

const REMOTE_NAMES: Record<string, string> = {
  shiftUp: 'Shift +',
  shiftDown: 'Shift −',
  shiftFrontUp: 'Front +',
  shiftFrontDown: 'Front −',
  ergUp: 'ERG +',
  ergDown: 'ERG −',
  pause: 'Pause',
  cameraNext: 'Camera',
  lap: 'Lap',
  intervalNext: 'Next',
};

const ZWIFT_NAMES: Record<string, string> = {
  plus: '+',
  minus: '−',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  a: 'A',
  b: 'B',
  y: 'Y',
  z: 'Z',
};

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
};

/** Readable name of a control, for the chips of the mapping table. */
export function controlLabel(b: Pick<Binding, 'source' | 'control'>): string {
  const [kind, id = ''] = b.control.split(':');
  if (b.source === 'keyboard' && kind === 'key') {
    return KEY_NAMES[id] ?? (id.length === 1 ? id.toUpperCase() : id);
  }
  if (b.source === 'remote') return REMOTE_NAMES[id] ?? id;
  if (b.source === 'zwift') return ZWIFT_NAMES[id] ?? id;
  if (b.source === 'obc') {
    const name = OBC_NAMES[Number.parseInt(id, 16)];
    return name ? `${id} ${name}` : id;
  }
  return `#${id}`;
}

const SOURCE_ICON = { keyboard: '⌨', gamepad: '🎮', obc: '🚲', zwift: '🟦', remote: '📱' } as const;
const ACTION_KEY = (a: ControlAction) => `controls.action.${a}` as MessageKey;

function useObcControllers() {
  return useSyncExternalStore(
    (cb) => obcControllers.onChange(cb),
    () => obcControllers.list,
  );
}

function useZwiftControllers() {
  return useSyncExternalStore(
    (cb) => zwiftControllers.onChange(cb),
    () => zwiftControllers.list,
  );
}

function useRemote() {
  return useSyncExternalStore(
    (cb) => remoteLink.onChange(cb),
    () => remoteLink.state,
  );
}

/** QR code of an address, drawn as an image (no HTML injection). */
function QrCode({ text }: { text: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 2, width: 220 }).then(
      (url) => alive && setSrc(url),
      () => alive && setSrc(''),
    );
    return () => {
      alive = false;
    };
  }, [text]);
  return src ? <img src={src} width={220} height={220} alt={text} className="qr" /> : null;
}

function RemoteSection() {
  const t = useT();
  const remote = useRemote();
  const [chosen, setChosen] = useState(0);
  const on = remote.status !== 'off';
  const base = remote.urls[Math.min(chosen, remote.urls.length - 1)];
  const phoneUrl = base ? remoteLink.phoneUrl(base) : null;
  return (
    <section className="card stack">
      <h2 className="t-h2">{t('controls.remote')}</h2>
      <p className="t-small">{t('controls.remoteHelp')}</p>
      <label className="switch">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => remoteLink.setEnabled(e.target.checked)}
        />{' '}
        {t('controls.remoteEnable')}
      </label>
      {on && (
        <>
          <p>
            <strong>{t('controls.remoteStatus')} : </strong>
            {t(`controls.remote.${remote.status}` as MessageKey)}
            {remote.phones > 0 && ` (${remote.phones})`}
          </p>
          {remote.status === 'unavailable' && (
            <p className="t-small">
              {t('controls.remoteStart')} <code>pnpm --filter @hrt/api dev</code>
            </p>
          )}
          {phoneUrl && (
            <div className="row">
              <QrCode text={phoneUrl} />
              <div>
                <p>{t('controls.remoteScan')}</p>
                <p>
                  <code>{phoneUrl}</code>
                </p>
                {remote.urls.length > 1 && (
                  <label>
                    {t('controls.remoteNetwork')}{' '}
                    <select
                      className="input"
                      style={{ width: 'auto' }}
                      value={chosen}
                      onChange={(e) => setChosen(Number(e.target.value))}
                    >
                      {remote.urls.map((u, i) => (
                        <option key={u} value={i}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p className="t-small">{t('controls.remoteWifi')}</p>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => remoteLink.regenerate()}
                >
                  {t('controls.remoteRegenerate')}
                </button>
              </div>
            </div>
          )}
          {remote.status !== 'unavailable' && remote.status !== 'connecting' && !phoneUrl && (
            <p className="t-small">{t('controls.remoteNoNetwork')}</p>
          )}
        </>
      )}
    </section>
  );
}

function useGamepads() {
  return useSyncExternalStore(
    (cb) => gamepads.onChange(cb),
    () => gamepads.pads,
  );
}

export function ControlsPage() {
  const t = useT();
  const { profiles, active } = useControls();
  const editable = !isDefaultProfile(active.id);
  const obc = useObcControllers();
  const zwift = useZwiftControllers();
  const pads = useGamepads();
  const [assigning, setAssigning] = useState<ControlAction | null>(null);
  const [assignType, setAssignType] = useState<BindingType>('press');
  const [last, setLast] = useState<InputEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The screen listens to the keyboard and pads so the live display works.
  useEffect(() => attachInputs(), []);
  useEffect(
    () =>
      controlsHub.onInput((e) => {
        if (e.type === 'press' && !e.repeated) setLast(e);
      }),
    [],
  );

  // "Press the button to assign": the next press is the new binding.
  useEffect(() => {
    if (!assigning) return;
    const stop = controlsHub.capture((e) => {
      const binding: Binding = {
        source: e.source,
        control: e.control,
        type: assignType,
        action: assigning,
        ...(e.source !== 'keyboard' && assignType === 'press' && REPEATABLE_ACTIONS.has(assigning)
          ? { repeatMs: 250 }
          : {}),
      };
      saveProfile(withBinding(active, binding));
      setAssigning(null);
    });
    const timeout = setTimeout(() => setAssigning(null), 10_000);
    return () => {
      stop();
      clearTimeout(timeout);
    };
  }, [assigning, assignType, active]);

  const pair = async () => {
    setError(null);
    try {
      await obcControllers.pair();
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (name === 'NotFoundError') return; // picker closed
      setError(
        (e as Error).message === 'bluetooth-unavailable'
          ? t('controls.noBluetooth')
          : t('controls.pairFailed'),
      );
    }
  };

  return (
    <Page title={t('controls.title')}>
      <p className="t-small">{t('controls.intro')}</p>

      <section className="card stack">
        <h2 className="t-h2">{t('controls.profile')}</h2>
        <div className="row">
          <select
            className="input"
            style={{ width: 'auto' }}
            value={active.id}
            onChange={(e) => setActiveProfile(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {isDefaultProfile(p.id) ? t('controls.defaultProfile') : p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => {
              const name = window.prompt(t('controls.newName'), t('controls.newNameDefault'));
              if (name !== null) createProfile(name);
            }}
          >
            {t('controls.duplicate')}
          </button>
          {editable && (
            <>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => {
                  const name = window.prompt(t('controls.newName'), active.name);
                  if (name?.trim()) saveProfile({ ...active, name: name.trim() });
                }}
              >
                {t('controls.rename')}
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => deleteProfile(active.id)}
              >
                {t('controls.delete')}
              </button>
            </>
          )}
        </div>
        {!editable && <p className="t-small">{t('controls.defaultReadonly')}</p>}
      </section>

      <section className="card stack">
        <h2 className="t-h2">{t('controls.devices')}</h2>
        <ul className="plain">
          <li>⌨ {t('controls.keyboard')}</li>
          {pads.map((p) => (
            <li key={`${p.index}:${p.id}`}>🎮 {p.id}</li>
          ))}
          {obc.map((c) => (
            <li key={c.id}>
              🚲 {c.name} · {t(`devices.status.${c.status}` as MessageKey)}
              {c.status === 'connected' && c.hasHaptic && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => void c.buzz('double')}
                  >
                    {t('controls.buzz')}
                  </button>
                </>
              )}{' '}
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => obcControllers.forget(c.id)}
              >
                {t('devices.forget')}
              </button>
            </li>
          ))}
          {zwift.map((c) => (
            <li key={c.id}>
              🟦 {c.name} · {t(`devices.status.${c.status}` as MessageKey)}
              {c.battery !== null && <> · {c.battery} %</>}
            </li>
          ))}
        </ul>
        {pads.length === 0 && <p className="t-small">{t('controls.padHint')}</p>}
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => void pair()}>
          {t('controls.pairObc')}
        </button>
        <p className="t-small">{t('controls.obcHelp')}</p>
        <p className="t-small">{t('controls.zwiftWhere')}</p>
        {error && <div className="field__error">✕ {error}</div>}
        <p>
          <strong>{t('controls.lastInput')} : </strong>
          {last ? `${SOURCE_ICON[last.source]} ${controlLabel(last)}` : '—'}
        </p>
      </section>

      <RemoteSection />

      <section className="card stack">
        <h2 className="t-h2">{t('controls.mapping')}</h2>
        <div className="row">
          <label>
            {t('controls.assignType')}{' '}
            <select
              className="input"
              style={{ width: 'auto' }}
              value={assignType}
              onChange={(e) => setAssignType(e.target.value as BindingType)}
            >
              <option value="press">{t('controls.type.press')}</option>
              <option value="long_press">{t('controls.type.long_press')}</option>
              <option value="double_press">{t('controls.type.double_press')}</option>
            </select>
          </label>
        </div>
        {(Object.keys(ACTION_CATEGORIES) as ActionCategory[]).map((cat) => (
          <div key={cat} className="stack" style={{ gap: 8 }}>
            <h3 className="t-h3">{t(`controls.cat.${cat}` as MessageKey)}</h3>
            <table className="tbl tbl--map">
              <tbody>
                {ACTION_CATEGORIES[cat].map((action) => (
                  <tr key={action}>
                    <th scope="row">{t(ACTION_KEY(action))}</th>
                    <td>
                      {bindingsFor(active, action).map((b) => (
                        <span
                          key={`${b.source}|${b.control}|${b.type}`}
                          className="chip"
                          title={t(`controls.type.${b.type}` as MessageKey)}
                        >
                          {SOURCE_ICON[b.source]} {controlLabel(b)}
                          {b.type === 'long_press' && ' ⏱'}
                          {b.type === 'double_press' && ' ×2'}
                          {editable && (
                            <button
                              type="button"
                              aria-label={t('controls.remove')}
                              onClick={() => saveProfile(withoutBinding(active, b))}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </td>
                    <td>
                      {editable && (
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          disabled={assigning !== null && assigning !== action}
                          onClick={() => setAssigning(assigning === action ? null : action)}
                        >
                          {assigning === action ? t('controls.pressNow') : t('controls.assign')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </Page>
  );
}
