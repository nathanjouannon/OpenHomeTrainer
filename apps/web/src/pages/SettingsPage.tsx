import {
  CASSETTE_SPEEDS,
  CASSETTES,
  type CassetteSpeeds,
  MAX_CHAINRINGS,
  MAX_COGS,
  parseTeeth,
  physicalRatio,
  ROAD_CHAINRINGS,
} from '@hrt/drivetrain';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { errorLog } from '../error-log';
import { COLOR_MODES } from '../hud/colors';
import {
  DEFAULT_HUD_TILES,
  type HudTileId,
  moveHudTile,
  orderedForEditing,
  toggleHudTile,
} from '../hud/tiles';
import { useT } from '../i18n';
import {
  type BikeType,
  QUALITY_SETTINGS,
  type Settings,
  updateProfile,
  updateSettings,
  useSettings,
} from '../store/settings';
import { RENDERER_PREFERENCES } from '../world/renderer-options';
import { downloadBlob, Page } from './common';

function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="setting">
      <span className="stack" style={{ gap: 4 }}>
        <span className="field__label" style={{ fontSize: 20 }}>
          {label}
        </span>
        {help && <span className="field__hint">{help}</span>}
      </span>
      {children}
    </label>
  );
}

/** On/off setting drawn as a switch. */
function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="setting">
      <span className="field__label" style={{ fontSize: 20 }}>
        {label}
      </span>
      <label className="switch" style={{ justifySelf: 'start' }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    </div>
  );
}

/** Group of exclusive choices drawn as a segmented control. */
function Segmented<T extends string>({
  label,
  help,
  value,
  options,
  stacked,
  onChange,
}: {
  label: string;
  help?: string;
  value: T;
  options: { value: T; label: string }[];
  stacked?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="setting">
      <span className="stack" style={{ gap: 4 }}>
        <span className="field__label" style={{ fontSize: 20 }}>
          {label}
        </span>
        {help && <span className="field__hint">{help}</span>}
      </span>
      {/* biome-ignore lint/a11y/useSemanticElements: a segmented control, not a form group */}
      <div
        className={`seg${stacked ? ' seg--stack' : ''}`}
        role="group"
        aria-label={label}
        style={{ justifySelf: 'start' }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Teeth list typed as text; the setting is only updated while the text is valid. */
function TeethInput({
  value,
  maxCount,
  disabled,
  onValid,
}: {
  value: readonly number[];
  maxCount: number;
  disabled?: boolean;
  onValid: (teeth: number[]) => void;
}) {
  const [text, setText] = useState(value.join(', '));
  const invalid = parseTeeth(text, maxCount) === null;
  return (
    <input
      type="text"
      value={text}
      disabled={disabled}
      aria-invalid={invalid}
      className={`input${invalid ? ' is-error' : ''}`}
      onChange={(e) => {
        setText(e.target.value);
        const teeth = parseTeeth(e.target.value, maxCount);
        if (teeth) onValid(teeth);
      }}
    />
  );
}

const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));

const SECTIONS = [
  { id: 'profile', label: 'settings.profile' },
  { id: 'ride', label: 'settings.ride' },
  { id: 'display', label: 'settings.display' },
  { id: 'data', label: 'settings.data' },
] as const;

export function SettingsPage() {
  const t = useT();
  const s = useSettings();
  const p = s.profile;
  return (
    <Page title={t('settings.title')}>
      <nav className="settings-tabs" aria-label={t('settings.title')}>
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => {
              const el = document.getElementById(`settings-${sec.id}`) as HTMLDetailsElement | null;
              if (!el) return;
              el.open = true;
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {t(sec.label)}
          </button>
        ))}
      </nav>
      <section className="stack" style={{ gap: 24 }}>
        <details className="fold" id="settings-profile" open>
          <summary>{t('settings.profile')}</summary>
          <div className="fold__body">
            <Field label={t('settings.weight')}>
              <input
                className="input"
                type="number"
                min={30}
                max={200}
                value={p.weightKg}
                onChange={(e) => updateProfile({ weightKg: num(e.target.value, 30, 200) })}
              />
            </Field>
            <Field label={t('settings.height')}>
              <input
                className="input"
                type="number"
                min={120}
                max={220}
                value={p.heightCm}
                onChange={(e) => updateProfile({ heightCm: num(e.target.value, 120, 220) })}
              />
            </Field>
            <Field label={t('settings.ftp')}>
              <div className="row">
                <input
                  className="input"
                  type="number"
                  min={50}
                  max={600}
                  value={p.ftpW ?? ''}
                  disabled={p.ftpW === null}
                  onChange={(e) => updateProfile({ ftpW: num(e.target.value, 50, 600) })}
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={p.ftpW === null}
                    onChange={(e) =>
                      updateProfile({
                        ftpW: e.target.checked ? null : Math.round(p.weightKg * 2.6),
                      })
                    }
                  />
                  {t('settings.ftpUnknown')}
                </label>
              </div>
            </Field>
            <Field label={t('settings.maxHr')}>
              <input
                className="input"
                type="number"
                min={100}
                max={230}
                value={p.maxHeartRateBpm ?? ''}
                onChange={(e) =>
                  updateProfile({
                    maxHeartRateBpm: e.target.value ? num(e.target.value, 100, 230) : null,
                  })
                }
              />
            </Field>
            <Field label={t('settings.bikeType')}>
              <select
                className="input"
                value={p.bikeType}
                onChange={(e) => updateProfile({ bikeType: e.target.value as BikeType })}
              >
                {(['road', 'aero', 'gravel', 'mtb'] as const).map((b) => (
                  <option key={b} value={b}>
                    {t(`settings.bike.${b}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('settings.bikeMass')}>
              <input
                className="input"
                type="number"
                min={5}
                max={25}
                step={0.5}
                value={p.bikeMassKg}
                onChange={(e) => updateProfile({ bikeMassKg: num(e.target.value, 5, 25) })}
              />
            </Field>
          </div>
        </details>
        <details className="fold" id="settings-ride" open>
          <summary>{t('settings.ride')}</summary>
          <div className="fold__body">
            <Field
              label={`${t('settings.difficulty')} : ${Math.round(s.difficulty * 100)} %`}
              help={t('settings.difficultyHelp')}
            >
              <input
                type="range"
                className="slider"
                style={{ '--v': `${Math.round(s.difficulty * 100)}%` } as CSSProperties}
                min={0}
                max={100}
                step={5}
                value={Math.round(s.difficulty * 100)}
                onChange={(e) => updateSettings({ difficulty: Number(e.target.value) / 100 })}
              />
            </Field>
            <Toggle
              label={t('settings.virtualShifting')}
              checked={s.virtualShifting}
              onChange={(v) => updateSettings({ virtualShifting: v })}
            />
            <Field label={t('settings.gearMode')} help={t('settings.gearModeHelp')}>
              <select
                className="input"
                value={s.gearMode}
                disabled={!s.virtualShifting}
                onChange={(e) =>
                  updateSettings({ gearMode: e.target.value as Settings['gearMode'] })
                }
              >
                <option value="chainrings">{t('settings.gearModeChainrings')}</option>
                <option value="ladder">{t('settings.gearModeLadder')}</option>
              </select>
            </Field>
            <Toggle
              label={t('settings.customDrivetrain')}
              checked={s.customDrivetrain !== null}
              disabled={!s.virtualShifting || s.gearMode === 'ladder'}
              onChange={(on) =>
                updateSettings({
                  customDrivetrain: on
                    ? {
                        chainrings: [...ROAD_CHAINRINGS],
                        cassette: [...CASSETTES[s.cassetteSpeeds]],
                      }
                    : null,
                })
              }
            />
            {s.virtualShifting && s.gearMode === 'chainrings' && s.customDrivetrain && (
              <>
                <Field label={t('settings.customChainrings')} help={t('settings.teethHelp')}>
                  <TeethInput
                    value={s.customDrivetrain.chainrings}
                    maxCount={MAX_CHAINRINGS}
                    onValid={(chainrings) =>
                      updateSettings((cur) =>
                        cur.customDrivetrain
                          ? { customDrivetrain: { ...cur.customDrivetrain, chainrings } }
                          : {},
                      )
                    }
                  />
                </Field>
                <Field label={t('settings.customCassette')} help={t('settings.teethHelp')}>
                  <TeethInput
                    value={s.customDrivetrain.cassette}
                    maxCount={MAX_COGS}
                    onValid={(cassette) =>
                      updateSettings((cur) =>
                        cur.customDrivetrain
                          ? { customDrivetrain: { ...cur.customDrivetrain, cassette } }
                          : {},
                      )
                    }
                  />
                </Field>
              </>
            )}
            <Field label={t('settings.cassette')}>
              <select
                className="input"
                value={s.cassetteSpeeds}
                disabled={
                  !s.virtualShifting || s.gearMode === 'ladder' || s.customDrivetrain !== null
                }
                onChange={(e) =>
                  updateSettings({ cassetteSpeeds: Number(e.target.value) as CassetteSpeeds })
                }
              >
                {CASSETTE_SPEEDS.map((n) => (
                  <option key={n} value={n}>
                    {t('settings.cassetteOption', {
                      speeds: n,
                      min: CASSETTES[n][0] ?? 0,
                      max: CASSETTES[n].at(-1) ?? 0,
                    })}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('settings.strategy')} help={t('settings.strategyHelp')}>
              <select
                className="input"
                value={s.shiftingStrategy}
                disabled={!s.virtualShifting}
                onChange={(e) =>
                  updateSettings({
                    shiftingStrategy: e.target.value as Settings['shiftingStrategy'],
                  })
                }
              >
                <option value="grade">{t('settings.strategy.grade')}</option>
                <option value="realistic">{t('settings.strategy.realistic')}</option>
              </select>
            </Field>
            <Field
              label={t('settings.physicalGear')}
              help={(() => {
                const r = physicalRatio(s.physicalChainring, s.physicalCog);
                return t('settings.physicalGearHelp', { ratio: r === null ? '—' : r.toFixed(2) });
              })()}
            >
              <div className="row">
                <input
                  className="input"
                  type="number"
                  min={8}
                  max={70}
                  placeholder={t('settings.physicalChainring')}
                  value={s.physicalChainring ?? ''}
                  onChange={(e) =>
                    updateSettings({
                      physicalChainring: e.target.value === '' ? null : num(e.target.value, 8, 70),
                    })
                  }
                />
                <span>×</span>
                <input
                  className="input"
                  type="number"
                  min={8}
                  max={70}
                  placeholder={t('settings.physicalCog')}
                  value={s.physicalCog ?? ''}
                  onChange={(e) =>
                    updateSettings({
                      physicalCog: e.target.value === '' ? null : num(e.target.value, 8, 70),
                    })
                  }
                />
              </div>
            </Field>
            <Field label={t('settings.powerSource')}>
              <select
                className="input"
                value={s.powerSource}
                onChange={(e) =>
                  updateSettings({ powerSource: e.target.value as Settings['powerSource'] })
                }
              >
                <option value="trainer">{t('settings.powerSource.trainer')}</option>
                <option value="powermeter">{t('settings.powerSource.powermeter')}</option>
              </select>
            </Field>
          </div>
        </details>
        <details className="fold" id="settings-display" open>
          <summary>{t('settings.display')}</summary>
          <div className="fold__body">
            <Field label={t('settings.language')}>
              <select
                className="input"
                value={s.language}
                onChange={(e) =>
                  updateSettings({ language: e.target.value as Settings['language'] })
                }
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label={t('settings.units')}>
              <select
                className="input"
                value={s.units}
                onChange={(e) => updateSettings({ units: e.target.value as Settings['units'] })}
              >
                <option value="metric">{t('settings.units.metric')}</option>
                <option value="imperial">{t('settings.units.imperial')}</option>
              </select>
            </Field>
            <Field label={t('settings.quality')} help={t('settings.quality.hint')}>
              <select
                className="input"
                value={s.quality}
                onChange={(e) => updateSettings({ quality: e.target.value as Settings['quality'] })}
              >
                {QUALITY_SETTINGS.map((q) => (
                  <option key={q} value={q}>
                    {t(`settings.quality.${q}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('settings.renderer')} help={t('settings.renderer.hint')}>
              <select
                className="input"
                value={s.renderer}
                onChange={(e) =>
                  updateSettings({ renderer: e.target.value as Settings['renderer'] })
                }
              >
                {RENDERER_PREFERENCES.map((r) => (
                  <option key={r} value={r}>
                    {t(`settings.renderer.${r}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Segmented
              label={t('settings.hudSize')}
              value={s.hudSize}
              options={(['S', 'M', 'L', 'XL'] as const).map((v) => ({ value: v, label: v }))}
              onChange={(v) => updateSettings({ hudSize: v })}
            />
            <Segmented
              label={t('settings.colorMode')}
              help={t('settings.colorMode.hint')}
              value={s.colorMode}
              stacked
              options={COLOR_MODES.map((m) => ({ value: m, label: t(`settings.colorMode.${m}`) }))}
              onChange={(v) => updateSettings({ colorMode: v })}
            />
            <div className="setting" style={{ alignItems: 'start' }}>
              <span className="stack" style={{ gap: 4 }}>
                <span className="field__label" style={{ fontSize: 20 }}>
                  {t('settings.hudTiles')}
                </span>
                <span className="field__hint">{t('settings.hudTiles.hint')}</span>
              </span>
              <div className="stack" style={{ gap: 8 }}>
                {orderedForEditing(s.hudTiles).map((id) => {
                  const shown = s.hudTiles.includes(id);
                  return (
                    <div className="row" key={id} style={{ gap: 8 }}>
                      <label className="check" style={{ flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={shown}
                          onChange={() =>
                            updateSettings({ hudTiles: toggleHudTile(s.hudTiles, id) })
                          }
                        />
                        {t(`hud.${id}`)}
                      </label>
                      {shown && (
                        <>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm btn--icon"
                            aria-label={t('settings.hudTiles.up')}
                            onClick={() =>
                              updateSettings({ hudTiles: moveHudTile(s.hudTiles, id, -1) })
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm btn--icon"
                            aria-label={t('settings.hudTiles.down')}
                            onClick={() =>
                              updateSettings({ hudTiles: moveHudTile(s.hudTiles, id, 1) })
                            }
                          >
                            ↓
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() =>
                    updateSettings({ hudTiles: [...DEFAULT_HUD_TILES] as HudTileId[] })
                  }
                >
                  {t('settings.hudTiles.reset')}
                </button>
              </div>
            </div>
            <Toggle
              label={t('settings.reduceMotion')}
              checked={s.reduceMotion}
              onChange={(v) => updateSettings({ reduceMotion: v })}
            />
          </div>
        </details>
        <details className="fold" id="settings-data" open>
          <summary>{t('settings.data')}</summary>
          <div className="fold__body">
            <button
              type="button"
              className="btn btn--secondary"
              style={{ justifySelf: 'start' }}
              onClick={() =>
                downloadBlob(
                  errorLog.toJSON(),
                  `hrt-errors-${new Date().toISOString()}.json`,
                  'application/json',
                )
              }
            >
              {t('settings.errorLog')} ({errorLog.count})
            </button>
          </div>
        </details>
      </section>
    </Page>
  );
}
