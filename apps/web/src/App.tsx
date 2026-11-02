import { lazy, Suspense, useEffect, useState } from 'react';
import { BleSpikePage } from './spikes/ble/BleSpikePage';

// The 3D spike pulls in Three.js: load it only when needed.
const WorldSpikePage = lazy(() => import('./spikes/world/WorldSpikePage'));

type Route = '' | 'ble' | '3d';

const readRoute = (): Route => {
  const r = window.location.hash.replace(/^#\/?/, '');
  return r === 'ble' || r === '3d' ? r : '';
};

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route === 'ble') return <BleSpikePage />;
  if (route === '3d') {
    return (
      <Suspense fallback={<p className="page">Chargement de la scène 3D…</p>}>
        <WorldSpikePage />
      </Suspense>
    );
  }
  return <Home />;
}

function Home() {
  return (
    <main className="page">
      <h1>HomeRealTrainer</h1>
      <p className="muted">Phase 0 — spikes techniques</p>
      <ul className="cards">
        <li>
          <a href="#/ble">
            <strong>Spike Bluetooth</strong>
            <span>Connexion FTMS ou trainer simulé, pente, ERG, journal des trames.</span>
          </a>
        </li>
        <li>
          <a href="#/3d">
            <strong>Spike 3D</strong>
            <span>
              Terrain 4 × 4 km (relief réel), route en boucle, 10 000 arbres, mesure des FPS.
            </span>
          </a>
        </li>
      </ul>
    </main>
  );
}
