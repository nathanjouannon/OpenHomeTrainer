// Comparison bench (lot 2.0): fixed viewpoints, frozen captures and frame
// statistics per quality level. Driven by `pnpm bench` through
// `window.hrtBench`, or by hand from the panel (`#/bench`).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type BuiltWorld,
  buildWorldScene,
  type RideView,
  useDisposeOnUnmount,
  WorldView,
} from '../world/WorldView';
import { BenchClock } from '../world/world-clock';
import { loadWorld, type WorldData } from '../world/world-data';
import { BenchProbe, BenchProbeHook, type Shot } from './bench-probe';
import {
  BENCH_PROTOCOL_VERSION,
  BENCH_QUALITIES,
  type BenchApi,
  type BenchMetrics,
  type BenchQuality,
  type BenchViewpoint,
} from './protocol';
import { BENCH_VIEWPOINTS, BENCH_WORLD_ID } from './viewpoints';

declare global {
  interface Window {
    hrtBench?: BenchApi;
  }
}

/** Same animations for every capture. */
const SEED = 2026;
/** Rider state shown at every viewpoint (stationary, pedalling). */
const RIDER = { speedMs: 9, cadenceRpm: 88, powerW: 210 };
const MANUAL_MEASURE_S = 5;

interface SceneState {
  quality: BenchQuality;
  built: BuiltWorld;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

export default function BenchPage({ auto }: { auto: boolean }) {
  const probe = useMemo(() => new BenchProbe(), []);
  const [world, setWorld] = useState<WorldData | null>(null);
  const [scene, setScene] = useState<SceneState | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [status, setStatus] = useState('Chargement du monde…');
  const [results, setResults] = useState<BenchMetrics[]>([]);
  const worldPromise = useMemo(() => loadWorld(BENCH_WORLD_ID), []);
  const sceneRef = useRef<SceneState | null>(null);
  const shots = useRef(0);
  useDisposeOnUnmount(scene?.built ?? null);

  useEffect(() => {
    worldPromise.then(setWorld, (err: unknown) => setStatus(`Erreur : ${String(err)}`));
  }, [worldPromise]);

  const api = useMemo<BenchApi>(() => {
    let queue: Promise<unknown> = Promise.resolve();
    // Calls are serialised: a capture never overlaps a measurement.
    const serial = <T,>(task: () => Promise<T>): Promise<T> => {
      const run = queue.then(task);
      queue = run.catch(() => undefined);
      return run;
    };
    return {
      version: BENCH_PROTOCOL_VERSION,
      viewpoints: BENCH_VIEWPOINTS,
      environment: () => probe.environment(),
      show: (viewpointId, quality) =>
        serial(async () => {
          const vp = BENCH_VIEWPOINTS.find((v) => v.id === viewpointId);
          if (!vp) throw new Error(`Unknown viewpoint ${viewpointId}`);
          if (!BENCH_QUALITIES.includes(quality)) throw new Error(`Unknown quality ${quality}`);
          const w = await worldPromise;
          if (sceneRef.current?.quality !== quality) {
            setStatus(`Construction du monde (qualité ${quality})…`);
            setShot(null);
            await nextFrame();
            const built = await buildWorldScene(w, quality, () => undefined);
            sceneRef.current = { quality, built };
            setScene(sceneRef.current);
          }
          setStatus(`${vp.label} · ${quality}`);
          shots.current++;
          const next: Shot = {
            key: `${vp.id}@${quality}#${shots.current}`,
            viewpointId: vp.id,
            quality,
            clock: new BenchClock(SEED),
          };
          const ready = probe.start(next);
          setShot(next);
          await ready;
        }),
      measure: (durationS) => serial(() => probe.measure(durationS)),
    };
  }, [probe, worldPromise]);

  useEffect(() => {
    window.hrtBench = api;
    return () => {
      if (window.hrtBench === api) delete window.hrtBench;
    };
  }, [api]);

  const vp = shot ? BENCH_VIEWPOINTS.find((v) => v.id === shot.viewpointId) : undefined;
  const route = vp ? world?.routes.get(vp.routeId) : undefined;
  const ready = world && scene && shot && vp && route && scene.quality === shot.quality;

  return (
    <div className="ride">
      {ready && (
        <ShotView
          key={shot.key}
          world={world}
          built={scene.built}
          shot={shot}
          vp={vp}
          probe={probe}
        />
      )}
      {!auto && (
        <Panel
          api={api}
          ready={world !== null}
          status={status}
          results={results}
          onResult={(m) => setResults((r) => [...r, m])}
        />
      )}
    </div>
  );
}

function ShotView({
  world,
  built,
  shot,
  vp,
  probe,
}: {
  world: WorldData;
  built: BuiltWorld;
  shot: Shot;
  vp: BenchViewpoint;
  probe: BenchProbe;
}) {
  const route = world.routes.get(vp.routeId);
  // Stable functions: a new one would respawn the traffic in the middle of a shot.
  const view = useMemo(() => {
    const state: RideView = { distanceM: vp.atM, prevDistanceM: vp.atM, ...RIDER };
    return () => state;
  }, [vp]);
  const alpha = useMemo(() => () => 1, []);
  if (!route) return null;
  return (
    <WorldView
      world={world}
      built={built}
      route={route}
      view={view}
      alpha={alpha}
      camera={vp.camera}
      quality={shot.quality}
      reduceMotion={false}
      clock={shot.clock}
    >
      <BenchProbeHook probe={probe} shotKey={shot.key} />
    </WorldView>
  );
}

function Panel({
  api,
  ready,
  status,
  results,
  onResult,
}: {
  api: BenchApi;
  ready: boolean;
  status: string;
  results: BenchMetrics[];
  onResult: (m: BenchMetrics) => void;
}) {
  const [viewpoint, setViewpoint] = useState(BENCH_VIEWPOINTS[0]?.id ?? '');
  const [quality, setQuality] = useState<BenchQuality>('medium');
  const [busy, setBusy] = useState(false);
  const run = async (ids: string[]) => {
    setBusy(true);
    try {
      for (const id of ids) {
        await api.show(id, quality);
        onResult(await api.measure(MANUAL_MEASURE_S));
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="hud">
      <div className="hud-block">
        <strong>Banc de comparaison</strong> · <span className="muted">{status}</span>
        <div className="row">
          <select value={viewpoint} onChange={(e) => setViewpoint(e.target.value)}>
            {BENCH_VIEWPOINTS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <select value={quality} onChange={(e) => setQuality(e.target.value as BenchQuality)}>
            {BENCH_QUALITIES.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => void api.show(viewpoint, quality)}
          >
            Afficher
          </button>
          <button type="button" disabled={!ready || busy} onClick={() => void run([viewpoint])}>
            Mesurer ({MANUAL_MEASURE_S} s)
          </button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => void run(BENCH_VIEWPOINTS.map((v) => v.id))}
          >
            Tout mesurer
          </button>
          <a href="#/">Accueil</a>
        </div>
        <p className="muted">
          Captures et comparaison avant/après : <code>pnpm bench</code> (voir docs/10 §7).
        </p>
      </div>
      {results.length > 0 && (
        <div className="hud-block">
          <table className="bench-results">
            <thead>
              <tr>
                <th>Point de vue</th>
                <th>Qualité</th>
                <th>FPS moy.</th>
                <th>1 % low</th>
                <th>Draw calls</th>
                <th>Triangles</th>
                <th>Mém. GPU</th>
              </tr>
            </thead>
            <tbody>
              {results.map((m, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
                <tr key={i}>
                  <td>{m.viewpoint}</td>
                  <td>{m.quality}</td>
                  <td>{m.avgFps}</td>
                  <td>{m.low1Fps}</td>
                  <td>{m.drawCalls}</td>
                  <td>{(m.triangles / 1e6).toFixed(2)} M</td>
                  <td>{m.gpuMemoryMB.total} Mo</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
