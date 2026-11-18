// Small SVG charts: lap elevation profile, mini-map, sparkline.

import type { Route } from '@hrt/route-engine';
import { useMemo } from 'react';

/** Grade band 0..4 of a grade in percent (down, 0–3, 3–6, 6–9, > 9 %). */
const bandOf = (g: number) => (g < -1 ? 0 : g < 3 ? 1 : g < 6 ? 2 : g < 9 ? 3 : 4);

/** Elevation profile of one lap: one bar per slice, coloured by grade band, with the rider's position. */
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
  const { bars, minZ, maxZ } = useMemo(() => {
    const n = 60;
    const pts = route.profile(n * 3);
    const zs = pts.map((p) => p.z);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs, minZ + 30);
    const w = W / n;
    const bars = Array.from({ length: n }, (_, i) => {
      const p0 = pts[Math.floor((i * (pts.length - 1)) / n)];
      const p1 = pts[Math.min(pts.length - 1, Math.ceil(((i + 1) * (pts.length - 1)) / n))];
      const z = ((p0?.z ?? minZ) + (p1?.z ?? minZ)) / 2;
      const dd = Math.max(1, (p1?.d ?? 0) - (p0?.d ?? 0));
      const grade = (((p1?.z ?? 0) - (p0?.z ?? 0)) / dd) * 100;
      const top = 6 + ((maxZ - z) / (maxZ - minZ)) * (height - 16);
      return { x: i * w, y: top, w: w + 0.6, h: height - top, band: bandOf(grade) };
    });
    return { bars, minZ, maxZ };
  }, [route, height]);
  void minZ;
  void maxZ;
  const markerX = lapDistanceM === undefined ? null : (lapDistanceM / route.lengthM) * W;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden>
      {bars.map((b) => (
        <rect
          key={b.x}
          className={`g${b.band}${markerX !== null && b.x + b.w < markerX ? ' past' : ''}`}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
        />
      ))}
      {showMarker && markerX !== null && (
        <line
          x1={markerX}
          x2={markerX}
          y1={0}
          y2={height}
          className="cursor"
          vectorEffect="non-scaling-stroke"
        />
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
  const p = lapDistanceM === undefined ? null : route.sampleAt(lapDistanceM);
  const pos = p ? toXY(p.x, p.y) : null;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <path d={line} className="map__path" style={{ strokeWidth: size / 30 }} />
      {pos && <circle cx={pos[0]} cy={pos[1]} r={size / 22} className="map__me" />}
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
