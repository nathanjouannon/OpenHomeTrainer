import { describe, expect, it } from 'vitest';
import { parseRunArgs } from './args';
import {
  comparabilityWarnings,
  delta,
  escapeHtml,
  pairRuns,
  renderComparison,
  renderRunReport,
  summarize,
} from './report';
import { type BenchMetrics, type BenchRun, overBudget, sanitizeLabel } from './results';

const metric = (patch: Partial<BenchMetrics> = {}): BenchMetrics => ({
  viewpoint: 'lac-foret',
  quality: 'medium',
  durationS: 4,
  frames: 800,
  avgFps: 200,
  low1Fps: 120,
  avgFrameMs: 5,
  p99FrameMs: 8.3,
  drawCalls: 150,
  triangles: 1_000_000,
  gpuMemoryMB: { geometry: 80, textures: 15, targets: 87, total: 182 },
  renderer: { geometries: 90, textures: 16, programs: 9 },
  canvas: { width: 1920, height: 1080 },
  ...patch,
});

const run = (label: string, metrics: BenchMetrics[], patch: Partial<BenchRun> = {}): BenchRun => ({
  label,
  createdAt: '2026-11-03T12:00:00.000Z',
  git: { commit: 'abc1234', branch: 'feat/phase-2', dirty: false },
  options: { durationS: 4, vsync: false, headless: true },
  environment: {
    userAgent: 'test',
    gpu: 'Apple M1',
    backend: 'webgl2',
    devicePixelRatio: 1,
    viewport: { width: 1920, height: 1080 },
  },
  viewpoints: [
    {
      id: 'lac-foret',
      label: 'Lac <forêt>',
      kind: 'forest',
      routeId: 'boucle-du-lac',
      atM: 1450,
      camera: 'pov',
    },
  ],
  metrics,
  ...patch,
});

describe('parseRunArgs', () => {
  it('has sensible defaults', () => {
    const o = parseRunArgs([]);
    expect(o.qualities).toEqual(['low', 'medium', 'high']);
    expect(o).toMatchObject({ build: true, headless: true, vsync: false, durationS: 4 });
  });

  it('parses lists and flags', () => {
    const o = parseRunArgs([
      '--',
      '--label',
      'avant-2.1',
      '--quality',
      'medium, high',
      '--views',
      'lac-foret,col-sommet',
      '--duration',
      '2.5',
      '--headed',
      '--vsync',
    ]);
    expect(o).toMatchObject({
      label: 'avant-2.1',
      qualities: ['medium', 'high'],
      viewpoints: ['lac-foret', 'col-sommet'],
      durationS: 2.5,
      headless: false,
      vsync: true,
    });
  });

  it('skips the build when an URL is given', () => {
    expect(parseRunArgs(['--url', 'http://localhost:5173/'])).toMatchObject({
      url: 'http://localhost:5173',
      build: false,
    });
  });

  it('rejects bad input', () => {
    expect(() => parseRunArgs(['--quality', 'ultra'])).toThrow(/ultra/);
    expect(() => parseRunArgs(['--duration', '0'])).toThrow();
    expect(() => parseRunArgs(['--label'])).toThrow(/needs a value/);
    expect(() => parseRunArgs(['--fast'])).toThrow(/Unknown option/);
  });
});

describe('sanitizeLabel', () => {
  it('keeps folder-safe names', () => {
    expect(sanitizeLabel('Avant 2.1 / WebGPU')).toBe('avant-2.1-webgpu');
    expect(() => sanitizeLabel('..')).toThrow();
    expect(() => sanitizeLabel(' / ')).toThrow();
  });
});

describe('overBudget', () => {
  it('flags each exceeded budget', () => {
    expect(overBudget(metric())).toEqual([]);
    expect(
      overBudget(
        metric({
          avgFps: 45,
          drawCalls: 300,
          triangles: 2_500_000,
          gpuMemoryMB: { geometry: 0, textures: 0, targets: 0, total: 2000 },
        }),
      ),
    ).toEqual(['fps', 'drawCalls', 'triangles', 'gpuMemory']);
  });

  it('only asks 30 FPS of the high quality, without resource budgets', () => {
    expect(overBudget(metric({ quality: 'high', avgFps: 35, triangles: 3_000_000 }))).toEqual([]);
    expect(overBudget(metric({ quality: 'high', avgFps: 25 }))).toEqual(['fps']);
    expect(overBudget(metric({ quality: 'medium', avgFps: 35 }))).toEqual(['fps']);
    expect(overBudget(metric({ quality: 'low', triangles: 2_000_000 }))).toEqual(['triangles']);
  });
});

describe('delta', () => {
  it('tells improvements from regressions', () => {
    expect(delta(100, 130, 'higher', 0.05).verdict).toBe('better');
    expect(delta(100, 80, 'higher', 0.05).verdict).toBe('worse');
    expect(delta(100, 103, 'higher', 0.05).verdict).toBe('same');
    expect(delta(150, 160, 'lower', 0).verdict).toBe('worse');
    expect(delta(150, 140, 'lower', 0)).toEqual({ relative: 140 / 150 - 1, verdict: 'better' });
    expect(delta(0, 0, 'lower', 0).verdict).toBe('same');
  });
});

describe('pairRuns', () => {
  it('matches viewpoint and quality, and keeps the unmatched ones', () => {
    const before = run('a', [metric(), metric({ quality: 'high' })]);
    const after = run('b', [metric({ avgFps: 150 }), metric({ viewpoint: 'col-sommet' })]);
    const rows = pairRuns(before, after);
    expect(rows.map((r) => [r.viewpoint, r.quality, !!r.before, !!r.after])).toEqual([
      ['lac-foret', 'medium', true, true],
      ['col-sommet', 'medium', false, true],
      ['lac-foret', 'high', true, false],
    ]);
  });
});

describe('comparabilityWarnings', () => {
  it('warns when the machine or the settings differ', () => {
    const a = run('a', []);
    expect(comparabilityWarnings(a, run('b', []))).toEqual([]);
    const b = run('b', [], {
      options: { durationS: 4, vsync: true, headless: true },
      environment: { ...a.environment, gpu: 'Intel' },
    });
    expect(comparabilityWarnings(a, b)).toHaveLength(2);
  });
});

describe('summarize', () => {
  it('gives the worst case per quality', () => {
    const s = summarize([
      metric({ avgFps: 200, drawCalls: 150 }),
      metric({ avgFps: 90, drawCalls: 310 }),
      metric({ quality: 'high', avgFps: 50 }),
    ]);
    expect(s.map((x) => [x.quality, x.minAvgFps, x.maxDrawCalls, x.overBudget])).toEqual([
      ['medium', 90, 310, 1],
      ['high', 50, 150, 0],
    ]);
  });
});

describe('HTML reports', () => {
  it('escapes labels and links the captures', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
    const html = renderRunReport(run('a', [metric()]));
    expect(html).toContain('Lac &lt;forêt&gt;');
    expect(html).toContain('captures/lac-foret@medium.jpg');
    const cmp = renderComparison(
      run('a', [metric()]),
      run('b', [metric({ avgFps: 150 })]),
      (l) => l,
    );
    expect(cmp).toContain('a/captures/lac-foret@medium.jpg');
    expect(cmp).toContain('b/captures/lac-foret@medium.jpg');
    expect(cmp).toContain('-25 %');
  });
});
