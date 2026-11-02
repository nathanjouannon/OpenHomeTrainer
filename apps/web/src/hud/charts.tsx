// Small SVG charts: lap elevation profile, mini-map, sparkline.

import type { Route } from '@hrt/route-engine';
import { useMemo } from 'react';

/** Elevation profile of one lap, with the rider's position. */
export function ElevationProfile({
  route,
  lapDistanceM,
  height = 70,
  showMarker = true,
}: {
  route: Route;
  lapDistanceM?: number;
  height?: number;
  showMarker?: boolean;
}) {
  const W = 600;
  const { path, line, minZ, maxZ } = useMemo(() => {
    const pts = route.profile(300);
    const zs = pts.map((p) => p.z);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs, minZ + 30);
    const x = (d: number) => (d / route.lengthM) * W;
    const y = (z: number) => height - 4 - ((z - minZ) / (maxZ - minZ)) * (height - 10);
    const line = pts
      .map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.z).toFixed(1)}`)
      .join('');
    return { path: `${line}L${W},${height}L0,${height}Z`, line, minZ, maxZ };
  }, [route, height]);
  const markerX = lapDistanceM === undefined ? null : (lapDistanceM / route.lengthM) * W;
  const markerZ = lapDistanceM === undefined ? 0 : route.sampleAt(lapDistanceM).z;
  const markerY = height - 4 - ((markerZ - minZ) / (maxZ - minZ)) * (height - 10);
  return (
    <svg className="profile" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path d={path} className="profile-fill" />
      <path d={line} className="profile-line" vectorEffect="non-scaling-stroke" />
      {showMarker && markerX !== null && (
        <>
          <line
            x1={markerX}
            x2={markerX}
            y1={0}
            y2={height}
            className="profile-cursor"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={markerX}
            cy={markerY}
            r={4}
            className="profile-dot"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}

/** Top view of the loop with the rider's position. */
export function MiniMap({
  route,
  lapDistanceM,
  size = 150,
}: {
  route: Route;
  lapDistanceM?: number;
  size?: number;
}) {
  const { line, toXY } = useMemo(() => {
    const b = route.bounds();
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 1.08;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const toXY = (x: number, y: number) =>
      [((x - cx) / span + 0.5) * size, (0.5 - (y - cy) / span) * size] as const;
    const step = Math.max(1, Math.floor(route.pointCount / 400));
    let line = '';
    for (let i = 0; i < route.pointCount; i += step) {
      const [px, py] = toXY(route.x[i] as number, route.y[i] as number);
      line += `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
    }
    return { line: `${line}Z`, toXY };
  }, [route, size]);
  const start = toXY(route.x[0] as number, route.y[0] as number);
  const p = lapDistanceM === undefined ? null : route.sampleAt(lapDistanceM);
  const pos = p ? toXY(p.x, p.y) : null;
  return (
    <svg className="minimap" viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
      <path d={line} className="minimap-route" />
      <rect x={start[0] - 3} y={start[1] - 3} width={6} height={6} className="minimap-start" />
      {pos && <circle cx={pos[0]} cy={pos[1]} r={5} className="minimap-dot" />}
    </svg>
  );
}

/** Line chart of a series over time (summary page). */
export function LineChart({
  values,
  height = 120,
  className = '',
  fill = false,
}: {
  values: readonly number[];
  height?: number;
  className?: string;
  fill?: boolean;
}) {
  const W = 800;
  const d = useMemo(() => {
    if (values.length < 2) return '';
    const step = Math.max(1, Math.floor(values.length / 800));
    const pts: number[] = [];
    for (let i = 0; i < values.length; i += step) {
      // Average each bucket so short spikes do not dominate.
      const slice = values.slice(i, i + step);
      pts.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    const min = Math.min(...pts);
    const max = Math.max(...pts, min + 1);
    const line = pts
      .map(
        (v, i) =>
          `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * W).toFixed(1)},${(height - 2 - ((v - min) / (max - min)) * (height - 6)).toFixed(1)}`,
      )
      .join('');
    return fill ? `${line}L${W},${height}L0,${height}Z` : line;
  }, [values, height, fill]);
  return (
    <svg
      className={`chart ${className}`}
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
