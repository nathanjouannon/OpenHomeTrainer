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
import { useEffect, useState, useSyncExternalStore } from 'react';
import { attachInputs, controlsHub, gamepads, obcControllers } from '../controls/runtime';
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
  if (b.source === 'obc') {
    const name = OBC_NAMES[Number.parseInt(id, 16)];
    return name ? `${id} ${name}` : id;
  }
  return `#${id}`;
}

const SOURCE_ICON = { keyboard: '⌨', gamepad: '🎮', obc: '🚲' } as const;
const ACTION_KEY = (a: ControlAction) => `controls.action.${a}` as MessageKey;

function useObcControllers() {
  return useSyncExternalStore(
    (cb) => obcControllers.onChange(cb),
    () => obcControllers.list,
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
      <p className="muted">{t('controls.intro')}</p>

      <section className="settings">
        <h2>{t('controls.profile')}</h2>
        <div className="row">
          <select value={active.id} onChange={(e) => setActiveProfile(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {isDefaultProfile(p.id) ? t('controls.defaultProfile') : p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
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
                onClick={() => {
                  const name = window.prompt(t('controls.newName'), active.name);
                  if (name?.trim()) saveProfile({ ...active, name: name.trim() });
                }}
              >
                {t('controls.rename')}
              </button>
              <button type="button" onClick={() => deleteProfile(active.id)}>
                {t('controls.delete')}
              </button>
            </>
          )}
        </div>
        {!editable && <p className="muted">{t('controls.defaultReadonly')}</p>}
      </section>

      <section className="settings">
        <h2>{t('controls.devices')}</h2>
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
                  <button type="button" onClick={() => void c.buzz('double')}>
                    {t('controls.buzz')}
                  </button>
                </>
              )}{' '}
              <button type="button" onClick={() => obcControllers.forget(c.id)}>
                {t('devices.forget')}
              </button>
            </li>
          ))}
        </ul>
        {pads.length === 0 && <p className="muted">{t('controls.padHint')}</p>}
        <button type="button" onClick={() => void pair()}>
          {t('controls.pairObc')}
        </button>
        <p className="muted">{t('controls.obcHelp')}</p>
        {error && <p className="error">{error}</p>}
        <p>
          <strong>{t('controls.lastInput')} : </strong>
          {last ? `${SOURCE_ICON[last.source]} ${controlLabel(last)}` : '—'}
        </p>
      </section>

      <section className="settings">
        <h2>{t('controls.mapping')}</h2>
        <div className="row">
          <label>
            {t('controls.assignType')}{' '}
            <select
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
          <div key={cat}>
            <h3>{t(`controls.cat.${cat}` as MessageKey)}</h3>
            <table className="controls-table">
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
