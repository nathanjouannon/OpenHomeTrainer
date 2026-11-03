import { describe, expect, it } from 'vitest';
import { renderProfile } from './render-profile';

describe('renderProfile', () => {
  it('has no cast shadows in low quality', () => {
    expect(renderProfile('low').shadows).toBeNull();
  });

  it('keeps the shadows near the rider, sharper in high quality', () => {
    const medium = renderProfile('medium').shadows;
    const high = renderProfile('high').shadows;
    expect(medium && high).toBeTruthy();
    if (!medium || !high) return;
    for (const s of [medium, high]) {
      expect(s.maxFarM).toBeLessThanOrEqual(200);
      expect(s.cascades).toBeGreaterThanOrEqual(2);
    }
    expect(high.mapSize).toBeGreaterThan(medium.mapSize);
    expect(high.maxFarM).toBeGreaterThanOrEqual(medium.maxFarM);
  });
});
