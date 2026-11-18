import type { ControlAction } from '@hrt/controls';
import { parseRouteId, type Route, withSegments } from '@hrt/route-engine';
import type { Workout } from '@hrt/workouts';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { formatDelta, formatDuration, formatter } from '../format';
import { DevCameraPanel } from '../hud/DevCameraPanel';
import { Hud, useLiveState } from '../hud/Hud';
import { useT } from '../i18n';
import type { Ghost } from '../ride/ghost';
import { loadGhost } from '../ride/ghost-loader';
import { DEFAULT_WORKOUT_FTP_W } from '../ride/ride-session';
import { type RideGoal, useRideController } from '../ride/useRideController';
import { navigate } from '../router';
import { designAttrs } from '../shell/theme';
import { useDevices } from '../store/devices';
import {
  CAMERA_MODES,
  getSettings,
  resolveQuality,
  updateSettings,
  useSettings,
} from '../store/settings';
import { findWorkout } from '../store/workouts';
import { FrameStats } from '../world/frame-stats';
import { type CameraPose, parsePoseParam } from '../world/free-camera';
import type { RendererBackend } from '../world/renderer-options';
import {
  type BuiltWorld,
  buildWorldScene,
  useDisposeOnUnmount,
  WorldView,
} from '../world/WorldView';
import { loadWorld, type WorldData } from '../world/world-data';
import { useLocalized } from './common';

function parseGoal(raw: string | null): RideGoal | null {
  if (!raw) return null;
  const [kind, value] = raw.split(':');
  if ((kind === 'duration' || kind === 'distance' || kind === 'laps') && Number(value) > 0) {
    return { kind, value: Number(value) };
  }
  return null;
}

/** Development helpers from the URL: `?at=1500` shows the rider 1.5 km further, `?camera=chase`. */
export interface DevView {
  atM: number;
  camera: string | null;
  /** Free camera pose, `x,y,z,yaw,pitch` (see `poseToParam`). */
  cam?: string | null;
}

export default function RidePage({
  worldId,
  routeId,
  goal,
  workoutId = null,
  ghostId = null,
  devView,
}: {
  worldId: string;
  routeId: string;
  goal: string | null;
  workoutId?: string | null;
  /** `best` (best lap of the route) or a ride id (lot 3.6). */
  ghostId?: string | null;
  devView?: DevView;
}) {
  const t = useT();
  const [world, setWorld] = useState<{ data: WorldData; built: BuiltWorld } | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const quality = resolveQuality(getSettings().quality);
    loadWorld(worldId, (f) => setProgress(f * 0.4))
      .then(async (data) => {
        const built = await buildWorldScene(data, quality, (f) => setProgress(0.4 + f * 0.6));
        if (!cancelled) setWorld({ data, built });
      })
      .catch((err: unknown) => setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, [worldId]);
  useDisposeOnUnmount(world?.built ?? null);

  // The reverse direction shares the geometry of the route the world was built for.
  const route = useMemo(() => {
    const { baseId, reversed } = parseRouteId(routeId);
    const base = world?.data.routes.get(baseId);
    const ridden = base && reversed ? base.reversed() : base;
    // Timed segments (lot 3.5): detected on the route as ridden, in either direction.
    return ridden ? withSegments(ridden) : ridden;
  }, [world, routeId]);
  const parsedGoal = useMemo(() => parseGoal(goal), [goal]);
  const workout = useMemo(() => findWorkout(workoutId), [workoutId]);
  // The ghost comes from the stored rides: the ride starts once it is loaded.
  const [ghost, setGhost] = useState<Ghost | null | 'loading'>(ghostId ? 'loading' : null);
  useEffect(() => {
    if (!ghostId) return;
    let cancelled = false;
    void loadGhost(routeId, ghostId, getSettings().language).then((g) => {
      if (!cancelled) setGhost(g);
    });
    return () => {
      cancelled = true;
    };
  }, [routeId, ghostId]);
  const dark = designAttrs(getSettings(), 'dark');
  if (error) {
    return (
      <div className="hrt page" {...dark}>
        <main className="page__main">
          <div className="banner banner--err">
            <span className="banner__icon">✕</span>
            <div className="banner__body">
              <div className="banner__title">{t('routes.missing')}</div>
              <div className="banner__text">{error}</div>
            </div>
            <a className="btn btn--secondary" href="#/routes">
              {t('nav.routes')}
            </a>
          </div>
        </main>
      </div>
    );
  }
  if (!world || !route || ghost === 'loading') {
    return (
      <div className="hrt page" {...dark}>
        <main className="page__main" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div className="stack" style={{ width: 720, gap: 24 }}>
            <h1 className="t-h1">{t('ride.loading')}</h1>
            <div className="bar" style={{ height: 20, borderRadius: 10 }}>
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span className="num t-0" style={{ fontSize: 40 }}>
              {Math.round(progress * 100)} %
            </span>
          </div>
        </main>
      </div>
    );
  }
  return (
    <RideRunning
      world={world.data}
      built={world.built}
      route={route}
      goal={parsedGoal}
      worldId={worldId}
      routeId={routeId}
      devView={devView ?? { atM: 0, camera: null }}
      workout={workout}
      ghost={ghost}
    />
  );
}

function RideRunning({
  world,
  built,
  route,
  goal,
  worldId,
  routeId,
  devView,
  workout,
  ghost,
}: {
  world: WorldData;
  built: BuiltWorld;
  route: Route;
  goal: RideGoal | null;
  worldId: string;
  routeId: string;
  devView: DevView;
  workout: Workout | null;
  ghost: Ghost | null;
}) {
  const t = useT();
  const loc = useLocalized();
  const settings = useSettings();
  const ride = useRideController(route, world.manifest.id, goal, workout, ghost);
  const { session, loop, dispatcher, toasts, pushToast, onEvent } = ride;
  const live = useLiveState(session.state, 4);
  const [hudVisible, setHudVisible] = useState(true);
  const [focused, setFocused] = useState(true);
  const [fps, setFps] = useState(0);
  const [backend, setBackend] = useState<RendererBackend | null>(null);
  const stats = useMemo(() => new FrameStats(), []);
  const slots = useDevices();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Dev mode: free camera, from the `G` key or `?camera=free`.
  const urlPose = useMemo(() => parsePoseParam(devView.cam ?? null), [devView.cam]);
  const [free, setFree] = useState(devView.camera === 'free' || urlPose !== null);
  const [freePose, setFreePose] = useState<{ pose: CameraPose; speedMs: number } | null>(null);

  onEvent.current = (e) => {
    if (e.type === 'lap') {
      const c = e.crossing;
      const delta = c.deltaToBestS === null || c.isBest ? '' : ` (${formatDelta(c.deltaToBestS)})`;
      pushToast(
        `${t('ride.lapDone', { lap: c.lap, time: formatDuration(c.durationS) })}${delta}${c.isBest && c.lap > 1 ? ` — ${t('ride.bestLap')}` : ''}`,
        c.isBest ? 'good' : 'info',
      );
    } else if (e.type === 'erg') {
      pushToast(
        e.on ? t('ride.ergOn', { watts: e.targetW ?? 0 }) : t('ride.ergOff'),
        e.on ? 'good' : 'info',
      );
    } else if (e.type === 'ergTarget') {
      pushToast(t('ride.ergTarget', { watts: e.targetW }));
    } else if (e.type === 'ergSpiral') {
      pushToast(t('ride.ergSpiral'), 'warn');
    } else if (e.type === 'ergRecovered') {
      pushToast(t('ride.ergRecovered'), 'good');
    } else if (e.type === 'interval') {
      pushToast(`${e.label} · ${e.targetW} W`);
    } else if (e.type === 'workoutDone') {
      pushToast(t('ride.workoutDone'), 'good');
    } else if (e.type === 'segmentStart') {
      const f = formatter(settings.units, settings.language);
      const length = `${f.distance(e.segment.endM - e.segment.startM, 1)} ${f.distanceUnit}`;
      const name = loc(e.segment.name);
      pushToast(
        e.pbS === null
          ? t('ride.segmentStart', { name, length })
          : t('ride.segmentStartPb', { name, length, pb: formatDuration(e.pbS) }),
      );
    } else if (e.type === 'segmentEnd') {
      const x = e.effort;
      const name = loc(x.name);
      const time = formatDuration(x.durationS);
      if (x.isPb && x.previousBestS !== null) {
        pushToast(t('ride.segmentPb', { name, time }), 'good');
      } else if (x.previousBestS === null) {
        pushToast(t('ride.segmentDone', { name, time }), 'good');
      } else {
        pushToast(
          t('ride.segmentSlower', {
            name,
            time,
            delta: formatDelta(x.durationS - x.previousBestS),
          }),
        );
      }
    } else if (e.type === 'goal') {
      pushToast(t('ride.goalReached'), 'good');
    }
  };

  useEffect(() => {
    const setCamera = (i: number) => updateSettings({ camera: CAMERA_MODES[i] ?? 'chase' });
    const offs = [
      ...([1, 2, 3, 4] as const).map((n) =>
        dispatcher.on(`camera${n}` as ControlAction, () => setCamera(n - 1)),
      ),
      dispatcher.on('cameraNext', () =>
        setCamera((CAMERA_MODES.indexOf(getSettings().camera) + 1) % CAMERA_MODES.length),
      ),
      dispatcher.on('cameraPrev', () =>
        setCamera(
          (CAMERA_MODES.indexOf(getSettings().camera) + CAMERA_MODES.length - 1) %
            CAMERA_MODES.length,
        ),
      ),
      dispatcher.on('toggleHud', () => setHudVisible((v) => !v)),
      dispatcher.on('cameraFree', () => setFree((v) => !v)),
    ];
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    const fpsTimer = setInterval(() => setFps(stats.snapshot().fps), 1000);
    return () => {
      for (const off of offs) off();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      clearInterval(fpsTimer);
    };
  }, [dispatcher, stats]);

  const finish = async () => {
    const header = await ride.finish();
    navigate(`/rides/${header.id}`);
  };
  const discard = async () => {
    await ride.discard();
    navigate('/');
  };

  const [fit, setFit] = useState(() => Math.min(1.25, Math.max(0.5, window.innerWidth / 1920)));
  useEffect(() => {
    const on = () => setFit(Math.min(1.25, Math.max(0.5, window.innerWidth / 1920)));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const trainerSlot = slots.trainer;
  const view = useMemo(() => {
    if (!devView.atM) return () => session.state;
    const shifted = { ...session.state };
    return () => {
      Object.assign(shifted, session.state);
      shifted.distanceM += devView.atM;
      shifted.prevDistanceM += devView.atM;
      return shifted;
    };
  }, [session, devView.atM]);
  const camera = CAMERA_MODES.find((m) => m === devView.camera) ?? settings.camera;
  const alpha = useMemo(() => () => loop.alpha(), [loop]);

  return (
    <div
      className="hrt ride"
      {...designAttrs(settings, 'dark')}
      style={{ '--fit': fit } as CSSProperties}
    >
      <WorldView
        world={world}
        built={built}
        route={route}
        view={view}
        alpha={alpha}
        ghost={ghost !== null}
        camera={camera}
        freeCamera={
          free
            ? { start: urlPose, onPose: (pose, speedMs) => setFreePose({ pose, speedMs }) }
            : undefined
        }
        quality={resolveQuality(settings.quality)}
        adaptive={settings.quality === 'auto'}
        renderer={settings.renderer}
        onRenderer={setBackend}
        reduceMotion={settings.reduceMotion}
        onFrame={(d, info) => stats.record(d, info)}
      />
      {hudVisible && free && (
        <DevCameraPanel
          pose={freePose?.pose ?? null}
          speedMs={freePose?.speedMs ?? 0}
          context={{
            worldId,
            routeId,
            quality: settings.quality,
            backend: backend === null ? null : backend === 'webgpu' ? 'WebGPU' : 'WebGL2',
          }}
        />
      )}
      {hudVisible && !free && (
        <Hud
          state={session.state}
          route={route}
          weightKg={settings.profile.weightKg}
          workoutIntervals={session.workoutIntervals}
          ftpW={settings.profile.ftpW ?? DEFAULT_WORKOUT_FTP_W}
        />
      )}
      <div className="ride__status">
        {live.powerStale && !live.paused && (
          <span className="status status--warn">
            <span className="dot dot--warn" /> {t('ride.noPower')}
          </span>
        )}
        {trainerSlot.status === 'reconnecting' && (
          <span className="status status--err">
            <span className="dot dot--err dot--pulse" />{' '}
            {t('ride.reconnecting', { name: trainerSlot.device?.name ?? '' })}
          </span>
        )}
        {!focused && (
          <span className="status status--warn">
            <span className="dot dot--warn" /> {t('ride.focusLost')}
          </span>
        )}
      </div>
      <div className="ride__toasts">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`htoast htoast--${toast.tone === 'good' ? 'ok' : toast.tone}`}
          >
            <span className="htoast__ic">
              {toast.tone === 'warn' ? '!' : toast.tone === 'good' ? '★' : 'i'}
            </span>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>
      <span className="fps">
        {backend && `${backend === 'webgpu' ? 'WebGPU' : 'WebGL2'} · `}
        {Math.round(fps)} FPS
      </span>
      {live.paused && (
        <div className="scrim" style={{ fontSize: 20 }}>
          <div className="pause" role="dialog" aria-label={t('ride.paused')}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="t-h1">{t('ride.paused')}</h2>
              <span className="chip">
                <span className="dot dot--warn" />
                {t('ride.paused')}
              </span>
            </div>
            <div className="grid grid--3">
              <div className="stat">
                <span className="stat__label">{t('hud.time')}</span>
                <span className="stat__value">{formatDuration(live.timeS)}</span>
              </div>
              <div className="stat">
                <span className="stat__label">{t('hud.distance')}</span>
                <span className="stat__value">
                  {(live.distanceM / 1000).toFixed(2)}
                  <small>km</small>
                </span>
              </div>
              <div className="stat">
                <span className="stat__label">{t('hud.lap')}</span>
                <span className="stat__value">{live.lap}</span>
              </div>
            </div>
            <label className="field">
              <span className="field__label">
                {t('ride.difficulty')} · {Math.round(settings.difficulty * 100)} %
              </span>
              <input
                type="range"
                className="slider"
                style={{ '--v': `${Math.round(settings.difficulty * 100)}%` } as CSSProperties}
                min={0}
                max={100}
                step={5}
                value={Math.round(settings.difficulty * 100)}
                onChange={(e) => {
                  const d = Number(e.target.value) / 100;
                  updateSettings({ difficulty: d });
                  session.setDifficulty(d);
                }}
              />
            </label>
            <div className="field">
              <span className="field__label">{t('ride.camera')}</span>
              {/* biome-ignore lint/a11y/useSemanticElements: a segmented control, not a form group */}
              <div className="seg" role="group" aria-label={t('ride.camera')}>
                {CAMERA_MODES.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={settings.camera === m}
                    onClick={() => updateSettings({ camera: m })}
                  >
                    {t(`camera.${m}`)} {i + 1}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn--primary btn--lg"
                // biome-ignore lint/a11y/noAutofocus: the resume action must be reachable without a mouse
                autoFocus
                onClick={() => session.resume()}
              >
                {t('ride.resume')}
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--lg"
                onClick={() => void finish()}
              >
                {t('ride.finish')}
              </button>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => (confirmDiscard ? void discard() : setConfirmDiscard(true))}
              >
                {confirmDiscard ? t('summary.deleteConfirm') : t('ride.discard')}
              </button>
            </div>
            <p className="t-hint">{t('ride.keys')}</p>
          </div>
        </div>
      )}
      {!live.paused && (
        <button
          type="button"
          className="pausebtn ride__pause"
          onClick={() => session.pause()}
          aria-label={t('ride.paused')}
        >
          ❚❚
        </button>
      )}
    </div>
  );
}
