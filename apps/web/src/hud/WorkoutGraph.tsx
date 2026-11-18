// Bar graph of a workout: one bar per interval, height = power, colour = zone,
// with an optional cursor for the current position.

import type { Interval } from '@hrt/workouts';
import { zoneColor } from './colors';

export function WorkoutGraph({
  intervals,
  ftpW,
  elapsedS,
  height = 70,
  adjustW = 0,
}: {
  intervals: readonly Interval[];
  ftpW: number;
  /** Shows a cursor and dims what is behind. */
  elapsedS?: number;
  height?: number;
  adjustW?: number;
}) {
  const total = intervals.reduce((a, i) => a + i.durationS, 0);
  if (total === 0) return null;
  const W = 600;
  const top = Math.max(ftpW * 1.3, ...intervals.map((i) => Math.max(i.fromW, i.toW) + adjustW));
  const y = (w: number) => height - (Math.max(0, w) / top) * height;
  const x = (s: number) => (s / total) * W;
  return (
    <svg
      className="workout-graph"
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Workout"
      style={{ width: '100%', height }}
    >
      {intervals.map((i) => {
        const x0 = x(i.startS);
        const x1 = x(i.startS + i.durationS);
        const a = i.fromW + adjustW;
        const b = i.toW + adjustW;
        const done = elapsedS !== undefined && i.startS + i.durationS <= elapsedS;
        return (
          <polygon
            key={i.index}
            points={`${x0},${height} ${x0},${y(a)} ${x1},${y(b)} ${x1},${height}`}
            fill={zoneColor((a + b) / 2, ftpW)}
            opacity={done ? 0.35 : 0.95}
          />
        );
      })}
      <line
        x1={0}
        x2={W}
        y1={y(ftpW)}
        y2={y(ftpW)}
        stroke="currentColor"
        strokeOpacity={0.35}
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
      />
      {elapsedS !== undefined && (
        <line
          x1={x(elapsedS)}
          x2={x(elapsedS)}
          y1={0}
          y2={height}
          stroke="#fff"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
