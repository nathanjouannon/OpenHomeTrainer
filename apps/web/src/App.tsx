import { lazy, Suspense } from 'react';
import { useT } from './i18n';
import { DevicesPage } from './pages/DevicesPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { RoutesPage } from './pages/RoutesPage';
import { SettingsPage } from './pages/SettingsPage';
import { SummaryPage } from './pages/SummaryPage';
import { useLocation } from './router';
import { BleSpikePage } from './spikes/ble/BleSpikePage';
import { rendererFromQuery } from './world/renderer-options';

// Pages with Three.js are loaded only when needed.
const RidePage = lazy(() => import('./pages/RidePage'));
const WorldSpikePage = lazy(() => import('./spikes/world/WorldSpikePage'));
const BenchPage = lazy(() => import('./bench/BenchPage'));

export function App() {
  const t = useT();
  const { page, params, query } = useLocation();
  const loading = <p className="page">{t('ride.loading')}</p>;
  switch (page) {
    case 'devices':
      return <DevicesPage />;
    case 'routes':
      return <RoutesPage />;
    case 'ride': {
      const [worldId, routeId] = params;
      if (!worldId || !routeId) return <RoutesPage />;
      return (
        <Suspense fallback={loading}>
          <RidePage
            key={`${worldId}/${routeId}`}
            worldId={worldId}
            routeId={routeId}
            goal={query.get('goal')}
            devView={{
              atM: Number(query.get('at')) || 0,
              camera: query.get('camera'),
              cam: query.get('cam'),
            }}
          />
        </Suspense>
      );
    }
    case 'rides':
      return params[0] ? <SummaryPage key={params[0]} rideId={params[0]} /> : <HistoryPage />;
    case 'settings':
      return <SettingsPage />;
    case 'ble':
      return <BleSpikePage />;
    case 'bench':
      return (
        <Suspense fallback={loading}>
          <BenchPage auto={query.has('auto')} renderer={rendererFromQuery(query, 'auto')} />
        </Suspense>
      );
    case '3d':
      return (
        <Suspense fallback={loading}>
          <WorldSpikePage />
        </Suspense>
      );
    default:
      return <HomePage />;
  }
}
