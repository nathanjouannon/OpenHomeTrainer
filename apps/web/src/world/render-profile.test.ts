import { describe, expect, it } from 'vitest';
import { renderProfile, terrainProfile } from './render-profile';

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

  it('ties each post-processing effect to the quality level', () => {
    const low = renderProfile('low').post;
    const medium = renderProfile('medium').post;
    const high = renderProfile('high').post;
    // The same colour grading everywhere: the look does not change with the quality.
    expect([low?.grading, medium?.grading, high?.grading]).toEqual([true, true, true]);
    expect(low?.ao).toBeNull();
    expect(low?.smaa).toBe(false);
    expect(medium?.ao?.resolutionScale).toBeLessThan(high?.ao?.resolutionScale ?? 0);
    expect(medium?.smaa && high?.smaa && medium?.bloom && high?.bloom).toBe(true);
  });

  it('keeps the costly terrain sampling for medium and high quality', () => {
    expect(renderProfile('low').terrain).toEqual({ stochastic: false, triplanar: false });
    expect(renderProfile('medium').terrain).toEqual({ stochastic: true, triplanar: true });
    expect(renderProfile('high').terrain).toEqual({ stochastic: true, triplanar: true });
  });

  it('drops the stochastic terrain sampling on the WebGL2 fallback', () => {
    expect(terrainProfile('high', 'webgpu')).toEqual({ stochastic: true, triplanar: true });
    expect(terrainProfile('high', 'webgl2')).toEqual({ stochastic: false, triplanar: true });
    expect(terrainProfile('low', 'webgl2')).toEqual({ stochastic: false, triplanar: false });
  });

  it('thins the vegetation out with the quality', () => {
    const [low, medium, high] = (['low', 'medium', 'high'] as const).map(
      (q) => renderProfile(q).vegetation,
    );
    if (!low || !medium || !high) throw new Error('missing profile');
    expect(medium.trees).toBeGreaterThan(low.trees);
    expect(high.trees).toBeGreaterThan(medium.trees);
    expect(high.treeViewM).toBeGreaterThan(medium.treeViewM);
    expect(high.shrubs).toBeGreaterThan(medium.shrubs);
    expect(medium.grass?.density).toBeGreaterThan(low.grass?.density ?? Infinity);
    expect(high.grass?.radiusM).toBeGreaterThan(medium.grass?.radiusM ?? Infinity);
    for (const v of [low, medium, high]) {
      // Tiers end farther and farther away, the imposters going on to the view distance.
      expect(v.treeTiersM[0]).toBeLessThan(v.treeTiersM[1]);
      expect(v.treeTiersM[1]).toBeLessThan(v.treeTiersM[2]);
      expect(v.treeTiersM[2]).toBeLessThan(v.treeViewM);
      expect(v.shrubFullM).toBeLessThan(v.shrubViewM);
    }
  });
});
