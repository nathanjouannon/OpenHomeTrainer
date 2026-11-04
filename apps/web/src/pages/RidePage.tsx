import type { Route } from '@hrt/route-engine';
import { useEffect, useMemo, useState } from 'react';
import { formatDelta, formatDuration } from '../format';
import { DevCameraPanel } from '../hud/DevCameraPanel';
import { Hud, useLiveState } from '../hud/Hud';
import { useT } from '../i18n';
import type { RideAction } from '../ride/actions';
import { type RideGoal, useRideController } from '../ride/useRideController';
import { navigate } from '../router';
import { useDevices } from '../store/devices';
import {
  CAMERA_MODES,
  getSettings,
  resolveQuality,
  updateSettings,
  useSettings,
} from '../store/settings';
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
  devView,
}: {
  worldId: string;
  routeId: string;
  goal: string | null;
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

  const route = world?.data.routes.get(routeId);
  const parsedGoal = useMemo(() => parseGoal(goal), [goal]);
  if (error) {
    return (
      <main className="page">
        <p className="notice warn">{t('routes.missing')}</p>
        <p className="muted small">{error}</p>
        <a href="#/routes">← {t('nav.back')}</a>
      </main>
    );
  }
  if (!world || !route) {
    return (
      <main className="page loading">
        <p>{t('ride.loading')}</p>
        <progress value={progress} max={1} />
      </main>
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
}: {
  world: WorldData;
  built: BuiltWorld;
  route: Route;
  goal: RideGoal | null;
  worldId: string;
  routeId: string;
  devView: DevView;
}) {
  const t = useT();
  const settings = useSettings();
  const ride = useRideController(route, world.manifest.id, goal);
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
    } else if (e.type === 'goal') {
      pushToast(t('ride.goalReached'), 'good');
    }
  };

  useEffect(() => {
    const setCamera = (i: number) => updateSettings({ camera: CAMERA_MODES[i] ?? 'chase' });
    const offs = [
      ...([1, 2, 3, 4] as const).map((n) =>
        dispatcher.on(`camera${n}` as RideAction, () => setCamera(n - 1)),
      ),
      dispatcher.on('cameraNext', () =>
        setCamera((CAMERA_MODES.indexOf(getSettings().camera) + 1) % CAMERA_MODES.length),
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
    <div className="ride">
      <WorldView
        world={world}
        built={built}
        route={route}
        view={view}
        alpha={alpha}
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
        <Hud state={session.state} route={route} weightKg={settings.profile.weightKg} />
      )}
      <div className="warnings">
        {live.powerStale && !live.paused && (
          <span className="warn-pill">⚠ {t('ride.noPower')}</span>
        )}
        {trainerSlot.status === 'reconnecting' && (
          <span className="warn-pill">
            ⟳ {t('ride.reconnecting', { name: trainerSlot.device?.name ?? '' })}
          </span>
        )}
        {!focused && <span className="warn-pill">⌨ {t('ride.focusLost')}</span>}
      </div>
      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.text}
          </div>
        ))}
      </div>
      <div className="fps muted">
        {Math.round(fps)} FPS{backend && ` · ${backend === 'webgpu' ? 'WebGPU' : 'WebGL2'}`}
      </div>
      {live.paused && (
        <div className="pause-overlay">
          <div className="pause-card">
            <h2>{t('ride.paused')}</h2>
            <p className="big-numbers">
              {formatDuration(live.timeS)} · {(live.distanceM / 1000).toFixed(2)} km ·{' '}
              {t('hud.lap')} {live.lap}
            </p>
            <label>
              {t('ride.difficulty')} : {Math.round(settings.difficulty * 100)} %
              <input
                type="range"
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
            <label>
              {t('ride.camera')}
              <select
                value={settings.camera}
                onChange={(e) =>
                  updateSettings({ camera: e.target.value as typeof settings.camera })
                }
              >
                {CAMERA_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`camera.${m}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <button type="button" className="primary" onClick={() => session.resume()}>
                {t('ride.resume')}
              </button>
              <button type="button" onClick={() => void finish()}>
                {t('ride.finish')}
              </button>
            </div>
            <button
              type="button"
              className="link danger"
              onClick={() => (confirmDiscard ? void discard() : setConfirmDiscard(true))}
            >
              {confirmDiscard ? t('summary.deleteConfirm') : t('ride.discard')}
            </button>
            <p className="muted small">{t('ride.keys')}</p>
          </div>
        </div>
      )}
      {!live.paused && (
        <button
          type="button"
          className="pause-button"
          onClick={() => session.pause()}
          aria-label={t('ride.paused')}
        >
          ❚❚
        </button>
      )}
    </div>
  );
}
