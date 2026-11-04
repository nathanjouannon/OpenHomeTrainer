import { describe, expect, it } from 'vitest';
import { AutoQuality, adaptProfile, autoLevel, MAX_AUTO_LEVEL } from './auto-quality';
import { renderProfile } from './render-profile';

const run = (q: AutoQuality, fps: number, seconds: number) => {
  const changes: number[] = [];
  for (let i = 0; i < seconds * fps; i++) {
    const c = q.push(1 / fps);
    if (c !== null) changes.push(c);
  }
  return changes;
};

describe('AutoQuality', () => {
  it('keeps the level when the FPS holds', () => {
    const q = new AutoQuality();
    expect(run(q, 60, 40)).toEqual([]);
    expect(q.level).toBe(0);
  });

  it('lowers one level per slow window, not before the window ends', () => {
    const q = new AutoQuality();
    expect(run(q, 30, 9)).toEqual([]);
    expect(run(q, 30, 1.1)).toEqual([1]);
    expect(run(q, 30, 10.1)).toEqual([2]);
  });

  it('stops at the last level', () => {
    const q = new AutoQuality();
    run(q, 20, 100);
    expect(q.level).toBe(MAX_AUTO_LEVEL);
  });

  it('judges the average of the window, not a single stall', () => {
    const q = new AutoQuality();
    for (let i = 0; i < 590; i++) q.push(1 / 60);
    q.push(0.4);
    for (let i = 0; i < 20; i++) q.push(1 / 60);
    expect(q.level).toBe(0);
  });

  it('restarts the window after a pause (hidden tab)', () => {
    const q = new AutoQuality();
    run(q, 30, 9);
    q.push(5);
    expect(run(q, 30, 9)).toEqual([]);
  });
});

describe('adaptProfile', () => {
  const base = renderProfile('medium');

  it('is the same object at level 0', () => {
    expect(adaptProfile(base, 0)).toBe(base);
  });

  it('thins the grass level after level, then removes it', () => {
    const g1 = adaptProfile(base, 1).vegetation.grass;
    const g2 = adaptProfile(base, 2).vegetation.grass;
    expect(g1?.radiusM).toBeLessThan(base.vegetation.grass?.radiusM ?? 0);
    expect(g2?.radiusM).toBeLessThan(g1?.radiusM ?? 0);
    expect(adaptProfile(base, MAX_AUTO_LEVEL).vegetation.grass).toBeNull();
  });

  it('never touches the rest of the profile', () => {
    expect(adaptProfile(base, 2).shadows).toBe(base.shadows);
    expect(adaptProfile(base, 2).vegetation.trees).toBe(base.vegetation.trees);
  });

  it('lowers the resolution with the level', () => {
    expect(autoLevel(0).resolution).toBe(1);
    expect(autoLevel(MAX_AUTO_LEVEL).resolution).toBeLessThan(autoLevel(1).resolution);
  });
});
