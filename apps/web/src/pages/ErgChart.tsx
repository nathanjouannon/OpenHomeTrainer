// Bar graph of the ERG pages (design "Mode ERG"): bars coloured by zone, a
// pattern per zone for the colour-blind palettes, a cursor, dimmed past.

import type { Interval } from '@hrt/workouts';
import { zoneIndex } from '../hud/colors';

const PATTERNS: Record<number, React.ReactNode> = {
  1: <circle cx="4" cy="4" r="1.5" fill="rgba(0,0,0,.5)" />,
  2: <path d="M0 4H8" stroke="rgba(0,0,0,.45)" strokeWidth="2" />,
  3: <path d="M4 0V8" stroke="rgba(0,0,0,.45)" strokeWidth="2" />,
  4: <path d="M0 8L8 0M-2 2L2 -2M6 10L10 6" stroke="rgba(0,0,0,.45)" strokeWidth="2" />,
  5: <path d="M0 0L8 8M-2 6L2 10M6 -2L10 2" stroke="rgba(0,0,0,.45)" strokeWidth="2" />,
  6: (
    <path
      d="M0 8L8 0M0 0L8 8M-2 2L2 -2M6 10L10 6M-2 6L2 10M6 -2L10 2"
      stroke="rgba(0,0,0,.5)"
      strokeWidth="1.8"
    />
  ),
};

/** Axis step in minutes so that the labels stay readable. */
function axisStepMin(totalS: number): number {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120];
  return steps.find((s) => totalS / 60 / s <= 9) ?? 120;
}

export function ErgChart({
  intervals,
  ftpW,
  totalS,
  topW,
  elapsedS,
  width,
  height,
  adjustW = 0,
  label,
  showFtp = false,
  axis = false,
}: {
  intervals: readonly Interval[];
  ftpW: number;
  /** Length of the time axis, s. */
  totalS: number;
  /** Power at the top of the graph, W (share it between graphs to compare them). */
  topW: number;
  elapsedS?: number;
  width: number;
  height: number;
  adjustW?: number;
  label: string;
  showFtp?: boolean;
  axis?: boolean;
}) {
  if (totalS <= 0) return null;
  const base = axis ? height - 24 : height;
  const x = (s: number) => (s / totalS) * width;
  const y = (w: number) => base - (Math.max(0, w) / topW) * base;
  const step = axisStepMin(totalS);
  const ticks = axis
    ? Array.from({ length: Math.floor(totalS / 60 / step) + 1 }, (_, i) => i * step * 60)
    : [];
  return (
    <svg
      className="ergc"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      style={axis ? { width: '100%', height } : undefined}
    >
      <defs>
        {Object.entries(PATTERNS).map(([z, node]) => (
          <pattern key={z} id={`zp${z}`} width="8" height="8" patternUnits="userSpaceOnUse">
            {node}
          </pattern>
        ))}
      </defs>
      {intervals.map((i) => {
        const x0 = x(i.startS);
        const x1 = x(i.startS + i.durationS);
        const a = i.fromW + adjustW;
        const b = i.toW + adjustW;
        const z = zoneIndex((a + b) / 2, ftpW);
        const past = elapsedS !== undefined && i.startS + i.durationS <= elapsedS ? ' past' : '';
        const pts = `${x0},${base} ${x0},${y(a)} ${x1},${y(b)} ${x1},${base}`;
        return (
          <g key={i.index}>
            <polygon
              className={`z${z}${past}`}
              points={pts}
              style={{ stroke: '#0B0F17', strokeWidth: '1.5px' }}
            />
            <polygon className={`zpat${past}`} fill={`url(#zp${z})`} points={pts} />
          </g>
        );
      })}
      {showFtp && <line className="ftp" x1={0} x2={width} y1={y(ftpW)} y2={y(ftpW)} />}
      {ticks.map((s, k) => (
        <text key={s} className="axis" x={k === 0 ? 14 : x(s)} y={height - 2} textAnchor="middle">
          {`${Math.floor(s / 3600) > 0 ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) > 0 ? 2 : 1, '0')}:00`}
        </text>
      ))}
      {elapsedS !== undefined && (
        <line className="cur" x1={x(elapsedS)} x2={x(elapsedS)} y1={0} y2={height} />
      )}
    </svg>
  );
}
