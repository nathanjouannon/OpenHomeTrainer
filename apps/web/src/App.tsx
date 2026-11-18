import { lazy, Suspense } from 'react';
import { useT } from './i18n';
import { ControlsPage } from './pages/ControlsPage';
import { DevicesPage } from './pages/DevicesPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { RoutesPage } from './pages/RoutesPage';
import { SettingsPage } from './pages/SettingsPage';
import { SummaryPage } from './pages/SummaryPage';
import { WorkoutsPage } from './pages/WorkoutsPage';
import { useLocation } from './router';
import { Shell } from './shell/Shell';
import { ClickSpikePage } from './spikes/click/ClickSpikePage';
import { rendererFromQuery } from './world/renderer-options';

// Pages with Three.js are loaded only when needed.
const RidePage = lazy(() => import('./pages/RidePage'));
const BenchPage = lazy(() => import('./bench/BenchPage'));

export function App() {
  const { page } = useLocation();
  // The ride, the dev pages and the bench draw their own full-screen layout.
  if (page === 'ride' || page === 'bench') return <Routes />;
  return (
    <Shell>
      <Routes />
    </Shell>
  );
}

function Routes() {
  const t = useT();
  const { page, params, query } = useLocation();
  const loading = <p className="page">{t('ride.loading')}</p>;
  switch (page) {
    case 'devices':
      return <DevicesPage />;
    case 'controls':
      return <ControlsPage />;
    case 'workouts':
      return <WorkoutsPage />;
    case 'routes':
      return <RoutesPage />;
    case 'ride': {
      const [worldId, routeId] = params;
      if (!worldId || !routeId) return <RoutesPage />;
      return (
        <Suspense fallback={loading}>
          <RidePage
            key={`${worldId}/${routeId}/${query.get('workout') ?? ''}/${query.get('ghost') ?? ''}`}
            worldId={worldId}
            routeId={routeId}
            goal={query.get('goal')}
            workoutId={query.get('workout')}
            ghostId={query.get('ghost')}
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
    case 'click':
      return <ClickSpikePage />;
    case 'bench':
      return (
        <Suspense fallback={loading}>
          <BenchPage auto={query.has('auto')} renderer={rendererFromQuery(query, 'auto')} />
        </Suspense>
      );
    default:
      return <HomePage />;
  }
}
