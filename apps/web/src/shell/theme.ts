import { useEffect, useState } from 'react';
import type { Settings } from '../store/settings';

export type Theme = 'dark' | 'light';

/** System colour scheme (pages outside the ride follow it; the ride is always dark). */
export function useSystemTheme(): Theme {
  const query = '(prefers-color-scheme: light)';
  const [light, setLight] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setLight(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return light ? 'light' : 'dark';
}

const CB = { default: 'std', redGreen: 'rg', blueYellow: 'by' } as const;

/** Data attributes of the `.hrt` root that drive theme, palette, HUD size and motion. */
export function designAttrs(settings: Settings, theme: Theme) {
  return {
    'data-theme': theme,
    'data-cb': CB[settings.colorMode],
    'data-hud': settings.hudSize.toLowerCase(),
    'data-motion': settings.reduceMotion ? 'reduced' : undefined,
  };
}
