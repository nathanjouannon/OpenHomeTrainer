import { buildLoopRoute } from '@hrt/route-engine';
import { describe, expect, it } from 'vitest';
import { estimateLapTimeS } from './estimate';

describe('estimateLapTimeS', () => {
  it('matches the steady-state speed on a flat loop', () => {
    const route = buildLoopRoute({
      id: 'flat',
      name: { fr: 'p', en: 'f' },
      worldId: 'w',
      controls: [
        [0, 0],
        [2000, 0],
        [2000, 2000],
        [0, 2000],
      ],
      elevationAt: () => 0,
    });
    // 250 W on the flat at sea level ≈ 10.2 m/s (docs/04 §4).
    const t = estimateLapTimeS(route, 250);
    expect(route.lengthM / t).toBeCloseTo(10.2, 0);
  });
});
