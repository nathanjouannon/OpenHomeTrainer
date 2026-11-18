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
import { type ReactNode, useState } from 'react';
import { errorLog } from '../error-log';
import { COLOR_MODES, type ColorMode } from '../hud/colors';
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
    <label className="field">
      <span>{label}</span>
      {children}
      {help && <small className="muted">{help}</small>}
    </label>
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
      style={invalid ? { borderColor: 'var(--danger, #d33)' } : undefined}
      onChange={(e) => {
        setText(e.target.value);
        const teeth = parseTeeth(e.target.value, maxCount);
        if (teeth) onValid(teeth);
      }}
    />
  );
}

const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));

export function SettingsPage() {
  const t = useT();
  const s = useSettings();
  const p = s.profile;
  return (
    <Page title={t('settings.title')}>
      <section className="settings">
        <h2>{t('settings.profile')}</h2>
        <Field label={t('settings.weight')}>
          <input
            type="number"
            min={30}
            max={200}
            value={p.weightKg}
            onChange={(e) => updateProfile({ weightKg: num(e.target.value, 30, 200) })}
          />
        </Field>
        <Field label={t('settings.height')}>
          <input
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
                  updateProfile({ ftpW: e.target.checked ? null : Math.round(p.weightKg * 2.6) })
                }
              />
              {t('settings.ftpUnknown')}
            </label>
          </div>
        </Field>
        <Field label={t('settings.maxHr')}>
          <input
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
            type="number"
            min={5}
            max={25}
            step={0.5}
            value={p.bikeMassKg}
            onChange={(e) => updateProfile({ bikeMassKg: num(e.target.value, 5, 25) })}
          />
        </Field>

        <h2>{t('settings.ride')}</h2>
        <Field
          label={`${t('settings.difficulty')} : ${Math.round(s.difficulty * 100)} %`}
          help={t('settings.difficultyHelp')}
        >
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(s.difficulty * 100)}
            onChange={(e) => updateSettings({ difficulty: Number(e.target.value) / 100 })}
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={s.virtualShifting}
            onChange={(e) => updateSettings({ virtualShifting: e.target.checked })}
          />
          {t('settings.virtualShifting')}
        </label>
        <Field label={t('settings.gearMode')} help={t('settings.gearModeHelp')}>
          <select
            value={s.gearMode}
            disabled={!s.virtualShifting}
            onChange={(e) => updateSettings({ gearMode: e.target.value as Settings['gearMode'] })}
          >
            <option value="chainrings">{t('settings.gearModeChainrings')}</option>
            <option value="ladder">{t('settings.gearModeLadder')}</option>
          </select>
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={s.customDrivetrain !== null}
            disabled={!s.virtualShifting || s.gearMode === 'ladder'}
            onChange={(e) =>
              updateSettings({
                customDrivetrain: e.target.checked
                  ? { chainrings: [...ROAD_CHAINRINGS], cassette: [...CASSETTES[s.cassetteSpeeds]] }
                  : null,
              })
            }
          />
          {t('settings.customDrivetrain')}
        </label>
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
            value={s.cassetteSpeeds}
            disabled={!s.virtualShifting || s.gearMode === 'ladder' || s.customDrivetrain !== null}
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
            value={s.shiftingStrategy}
            disabled={!s.virtualShifting}
            onChange={(e) =>
              updateSettings({ shiftingStrategy: e.target.value as Settings['shiftingStrategy'] })
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
            value={s.powerSource}
            onChange={(e) =>
              updateSettings({ powerSource: e.target.value as Settings['powerSource'] })
            }
          >
            <option value="trainer">{t('settings.powerSource.trainer')}</option>
            <option value="powermeter">{t('settings.powerSource.powermeter')}</option>
          </select>
        </Field>

        <h2>{t('settings.display')}</h2>
        <Field label={t('settings.language')}>
          <select
            value={s.language}
            onChange={(e) => updateSettings({ language: e.target.value as Settings['language'] })}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label={t('settings.units')}>
          <select
            value={s.units}
            onChange={(e) => updateSettings({ units: e.target.value as Settings['units'] })}
          >
            <option value="metric">{t('settings.units.metric')}</option>
            <option value="imperial">{t('settings.units.imperial')}</option>
          </select>
        </Field>
        <Field label={t('settings.quality')} help={t('settings.quality.hint')}>
          <select
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
            value={s.renderer}
            onChange={(e) => updateSettings({ renderer: e.target.value as Settings['renderer'] })}
          >
            {RENDERER_PREFERENCES.map((r) => (
              <option key={r} value={r}>
                {t(`settings.renderer.${r}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('settings.hudSize')}>
          <select
            value={s.hudSize}
            onChange={(e) => updateSettings({ hudSize: e.target.value as Settings['hudSize'] })}
          >
            {(['S', 'M', 'L', 'XL'] as const).map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('settings.colorMode')} help={t('settings.colorMode.hint')}>
          <select
            value={s.colorMode}
            onChange={(e) => updateSettings({ colorMode: e.target.value as ColorMode })}
          >
            {COLOR_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`settings.colorMode.${m}`)}
              </option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend>{t('settings.hudTiles')}</legend>
          <small className="muted">{t('settings.hudTiles.hint')}</small>
          <ul className="tile-config">
            {orderedForEditing(s.hudTiles).map((id) => {
              const shown = s.hudTiles.includes(id);
              return (
                <li key={id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={shown}
                      onChange={() => updateSettings({ hudTiles: toggleHudTile(s.hudTiles, id) })}
                    />
                    {t(`hud.${id}`)}
                  </label>
                  {shown && (
                    <>
                      <button
                        type="button"
                        aria-label={t('settings.hudTiles.up')}
                        onClick={() =>
                          updateSettings({ hudTiles: moveHudTile(s.hudTiles, id, -1) })
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={t('settings.hudTiles.down')}
                        onClick={() => updateSettings({ hudTiles: moveHudTile(s.hudTiles, id, 1) })}
                      >
                        ↓
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => updateSettings({ hudTiles: [...DEFAULT_HUD_TILES] as HudTileId[] })}
          >
            {t('settings.hudTiles.reset')}
          </button>
        </fieldset>
        <label className="check">
          <input
            type="checkbox"
            checked={s.reduceMotion}
            onChange={(e) => updateSettings({ reduceMotion: e.target.checked })}
          />
          {t('settings.reduceMotion')}
        </label>

        <h2>{t('settings.data')}</h2>
        <button
          type="button"
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
      </section>
    </Page>
  );
}
