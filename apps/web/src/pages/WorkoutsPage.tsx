// Workout library, simple editor and .zwo / .erg / .mrc import (lot 3.2).

import {
  flatten,
  ftp,
  newWorkoutId,
  parseWorkoutFile,
  type Step,
  type Workout,
  WorkoutParseError,
  workoutStats,
} from '@hrt/workouts';
import { type ReactNode, useRef, useState } from 'react';
import { formatDuration } from '../format';
import { WorkoutGraph } from '../hud/WorkoutGraph';
import { useT } from '../i18n';
import { DEFAULT_WORKOUT_FTP_W } from '../ride/ride-session';
import { navigate } from '../router';
import { useSettings } from '../store/settings';
import { deleteWorkout, isBuiltin, saveWorkout, useWorkouts } from '../store/workouts';
import { Page } from './common';

const pct = (p: { unit: string; value: number }) => Math.round(p.value * 100);

/** Steps the editor can show: shares of FTP only. */
const editable = (steps: readonly Step[]): boolean => !needsAbsolute(steps);
function needsAbsolute(steps: readonly Step[]): boolean {
  return steps.some((s) =>
    s.type === 'repeat'
      ? needsAbsolute(s.steps)
      : s.type === 'steady'
        ? s.power.unit === 'watts'
        : s.from.unit === 'watts' || s.to.unit === 'watts',
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="num-field field">
      <span className="field__label" style={{ fontSize: 15 }}>
        {label}
      </span>
      <input
        className="input"
        style={{ height: 48, fontSize: 20 }}
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, v));
        }}
      />
    </label>
  );
}

function StepEditor({
  steps,
  onChange,
  depth = 0,
}: {
  steps: Step[];
  onChange: (steps: Step[]) => void;
  depth?: number;
}) {
  const t = useT();
  const set = (i: number, s: Step) => onChange(steps.map((x, k) => (k === i ? s : x)));
  const remove = (i: number) => onChange(steps.filter((_, k) => k !== i));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j] as Step, next[i] as Step];
    onChange(next);
  };
  const mins = (s: number) => Math.round((s / 60) * 100) / 100;
  const toS = (m: number) => Math.max(1, Math.round(m * 60));
  return (
    <div className="step-list">
      {steps.map((s, i) => {
        const key = `${i}-${s.type}`;
        let body: ReactNode;
        if (s.type === 'steady') {
          body = (
            <>
              <strong className="t-h3">{t('workouts.step.steady')}</strong>
              <NumberField
                label={t('workouts.minutes')}
                value={mins(s.durationS)}
                step={0.5}
                min={0.5}
                onChange={(m) => set(i, { ...s, durationS: toS(m) })}
              />
              <NumberField
                label={t('workouts.power')}
                value={pct(s.power)}
                onChange={(v) => set(i, { ...s, power: ftp(v / 100) })}
              />
            </>
          );
        } else if (s.type === 'ramp') {
          body = (
            <>
              <strong className="t-h3">{t('workouts.step.ramp')}</strong>
              <NumberField
                label={t('workouts.minutes')}
                value={mins(s.durationS)}
                step={0.5}
                min={0.5}
                onChange={(m) => set(i, { ...s, durationS: toS(m) })}
              />
              <NumberField
                label={t('workouts.powerFrom')}
                value={pct(s.from)}
                onChange={(v) => set(i, { ...s, from: ftp(v / 100) })}
              />
              <NumberField
                label={t('workouts.powerTo')}
                value={pct(s.to)}
                onChange={(v) => set(i, { ...s, to: ftp(v / 100) })}
              />
            </>
          );
        } else {
          body = (
            <>
              <strong className="t-h3">{t('workouts.step.repeat')}</strong>
              <NumberField
                label={t('workouts.times')}
                value={s.times}
                min={1}
                onChange={(v) => set(i, { ...s, times: Math.round(v) })}
              />
              {depth < 2 && (
                <div className="step-children">
                  <StepEditor
                    steps={s.steps}
                    depth={depth + 1}
                    onChange={(inner) => set(i, { ...s, steps: inner })}
                  />
                </div>
              )}
            </>
          );
        }
        return (
          <div className={`step-row step-${s.type}`} key={key}>
            {body}
            <span className="step-actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm btn--icon"
                aria-label="up"
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm btn--icon"
                aria-label="down"
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm btn--icon"
                aria-label="remove"
                onClick={() => remove(i)}
              >
                ✕
              </button>
            </span>
          </div>
        );
      })}
      <div className="step-add">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => onChange([...steps, { type: 'steady', durationS: 300, power: ftp(0.65) }])}
        >
          {t('workouts.addStep')}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() =>
            onChange([...steps, { type: 'ramp', durationS: 300, from: ftp(0.5), to: ftp(0.8) }])
          }
        >
          {t('workouts.addRamp')}
        </button>
        {depth < 2 && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() =>
              onChange([
                ...steps,
                {
                  type: 'repeat',
                  times: 4,
                  steps: [
                    { type: 'steady', durationS: 60, power: ftp(1.1), label: 'On' },
                    { type: 'steady', durationS: 60, power: ftp(0.5), label: 'Off' },
                  ],
                },
              ])
            }
          >
            {t('workouts.addRepeat')}
          </button>
        )}
      </div>
    </div>
  );
}

function Editor({ initial, onDone }: { initial: Workout; onDone: () => void }) {
  const t = useT();
  const settings = useSettings();
  const ftpW = settings.profile.ftpW ?? DEFAULT_WORKOUT_FTP_W;
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [steps, setSteps] = useState<Step[]>(initial.steps);
  const draft: Workout = { ...initial, name, description, steps, source: 'custom' };
  const intervals = flatten(draft, ftpW);
  const valid = name.trim().length > 0 && intervals.length > 0;
  return (
    <section className="workout-editor card stack">
      <label className="field">
        <span className="field__label">{t('workouts.name')}</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('workouts.description')}</span>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <WorkoutGraph intervals={intervals} ftpW={ftpW} height={90} />
      <p className="t-small">
        <b className="num t-0" style={{ fontSize: 24 }}>
          {formatDuration(intervals.reduce((a, i) => a + i.durationS, 0))}
        </b>
      </p>
      <StepEditor steps={steps} onChange={setSteps} />
      <div className="row">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          disabled={!valid}
          onClick={() => {
            saveWorkout({
              ...draft,
              name: name.trim(),
              description: description.trim() || undefined,
            });
            onDone();
          }}
        >
          {t('workouts.save')}
        </button>
        <button type="button" className="btn btn--secondary btn--lg" onClick={onDone}>
          {t('workouts.cancel')}
        </button>
      </div>
    </section>
  );
}

export function WorkoutsPage() {
  const t = useT();
  const settings = useSettings();
  const workouts = useWorkouts();
  const [editing, setEditing] = useState<Workout | null>(null);
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const hasFtp = settings.profile.ftpW !== null;
  const ftpW = settings.profile.ftpW ?? DEFAULT_WORKOUT_FTP_W;
  const f2 = (n: number) => n.toFixed(2);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const w = parseWorkoutFile(file.name, await file.text());
        saveWorkout({ ...w, source: w.source });
        setMessage({ text: t('workouts.imported', { name: w.name }), warn: false });
      } catch (err) {
        const error = err instanceof WorkoutParseError ? err.message : String(err);
        setMessage({
          text: t('workouts.importFailed', { error: `${file.name}: ${error}` }),
          warn: true,
        });
      }
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const duplicate = (w: Workout) =>
    setEditing({ ...w, id: newWorkoutId(w.name), name: `${w.name} (2)`, source: 'custom' });

  const mine = workouts.filter((w) => !isBuiltin(w.id));
  const builtin = workouts.filter((w) => isBuiltin(w.id));

  const card = (w: Workout) => {
    const iv = flatten(w, ftpW);
    const st = workoutStats(iv, ftpW);
    const custom = !isBuiltin(w.id);
    const absolute = !editable(w.steps);
    return (
      <article className="workout-card card stack" style={{ gap: 14 }} key={w.id}>
        <header className="card__head">
          <h2 className="t-h2" style={{ fontSize: 30 }}>
            {w.name}
          </h2>
          <span className="badge">{custom ? w.source.toUpperCase() : t('workouts.builtin')}</span>
        </header>
        {w.description && <p className="t-small">{w.description}</p>}
        <WorkoutGraph intervals={iv} ftpW={ftpW} height={64} />
        <p className="t-small t-0">
          {t('workouts.stats', {
            duration: formatDuration(st.durationS),
            avg: st.avgW,
            ifactor: f2(st.intensityFactor),
            tss: st.tss,
          })}
        </p>
        {absolute && <p className="t-hint">{t('workouts.absolute')}</p>}
        <div className="row">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => navigate(`/routes?workout=${encodeURIComponent(w.id)}`)}
          >
            {t('workouts.ride')}
          </button>
          {custom && !absolute && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setEditing(w)}
            >
              {t('workouts.edit')}
            </button>
          )}
          {!absolute && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => duplicate(w)}
            >
              {t('workouts.duplicate')}
            </button>
          )}
          {custom && (
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => {
                if (window.confirm(t('workouts.deleteConfirm', { name: w.name })))
                  deleteWorkout(w.id);
              }}
            >
              {t('workouts.delete')}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <Page title={t('workouts.title')}>
      {!hasFtp && (
        <div className="banner banner--warn">
          <span className="banner__icon">!</span>
          <div className="banner__body">
            <div className="banner__text t-0">
              {t('workouts.noFtp', { ftp: DEFAULT_WORKOUT_FTP_W })}
            </div>
          </div>
        </div>
      )}
      {message && (
        <div className={`banner${message.warn ? ' banner--err' : ' banner--ok'}`}>
          <span className="banner__icon">{message.warn ? '✕' : '✓'}</span>
          <div className="banner__body">
            <div className="banner__text t-0">{message.text}</div>
          </div>
        </div>
      )}
      {editing ? (
        <Editor key={editing.id} initial={editing} onDone={() => setEditing(null)} />
      ) : (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is a bonus, the import button stays */}
          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFiles(e.dataTransfer.files);
            }}
          >
            <button
              type="button"
              className="btn btn--primary"
              onClick={() =>
                setEditing({
                  id: newWorkoutId('seance'),
                  name: '',
                  steps: [
                    {
                      type: 'ramp',
                      durationS: 600,
                      from: ftp(0.45),
                      to: ftp(0.7),
                      label: 'Warmup',
                    },
                    { type: 'steady', durationS: 1200, power: ftp(0.85) },
                    {
                      type: 'ramp',
                      durationS: 300,
                      from: ftp(0.6),
                      to: ftp(0.4),
                      label: 'Cooldown',
                    },
                  ],
                  source: 'custom',
                })
              }
            >
              {t('workouts.new')}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => fileInput.current?.click()}
            >
              {t('workouts.import')}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".zwo,.erg,.mrc,.xml,.txt"
              multiple
              hidden
              onChange={(e) => void onFiles(e.target.files)}
            />
          </div>
          {mine.length > 0 && (
            <>
              <h2 className="t-h2">{t('workouts.mine')}</h2>
              <div className="workout-list">{mine.map(card)}</div>
            </>
          )}
          <h2 className="t-h2">{t('workouts.library')}</h2>
          <div className="workout-list">{builtin.map(card)}</div>
        </>
      )}
    </Page>
  );
}
