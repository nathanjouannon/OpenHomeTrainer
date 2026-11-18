import type { ReactNode } from 'react';

const PATHS = {
  home: 'M4 11l8-7 8 7M6 10v10h12V10',
  devices: 'M3 19h18M6 19l6-12 6 12M9 13h6M10 5h4',
  routes: 'M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6',
  workouts: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  controls: 'M8 11v4M6 13h4M16 12h.01M18 14h.01',
  history: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4M12 8v4l3 2',
  settings:
    'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
  play: 'M7 4l13 8-13 8z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  let extra: ReactNode = null;
  if (name === 'routes')
    extra = (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
      </>
    );
  if (name === 'controls') extra = <rect x="3" y="8" width="18" height="10" rx="5" />;
  if (name === 'settings') extra = <circle cx="12" cy="12" r="3" />;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {extra}
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Logo({ size }: { size?: 'sm' | 'lg' }) {
  return (
    <span className={`logo${size ? ` logo--${size}` : ''}`} role="img" aria-label="HomeRealTrainer">
      <svg className="logo__mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r="19"
          stroke="currentColor"
          strokeWidth="5"
          strokeDasharray="96 23.4"
          strokeLinecap="round"
          transform="rotate(-50 24 24)"
        />
        <path
          d="M14 31l8-9 5 4 8-10"
          stroke="var(--accent-text)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="logo__word">
        <i>Home</i>
        <b>Real</b>Trainer
      </span>
    </span>
  );
}
