// `pnpm bench`: builds and serves the app locally, drives the `#/bench` page
// in Chrome, saves a capture and the frame statistics of every viewpoint at
// every quality level, then writes bench-results/<label>/report.html.

import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { type Browser, chromium, type Page } from 'playwright';
import type { BenchApi } from '../../../apps/web/src/bench/protocol';
import { parseRunArgs, RUN_USAGE, type RunOptions } from './args';
import { renderRunReport } from './report';
import {
  type BenchMetrics,
  type BenchRun,
  captureName,
  overBudget,
  runDir,
  sanitizeLabel,
} from './results';

const ROOT = resolve(import.meta.dirname, '../../..');
const PORT = 4319;
const VIEWPORT = { width: 1920, height: 1080 };

declare global {
  interface Window {
    hrtBench?: BenchApi;
  }
}

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

function gitInfo(): BenchRun['git'] {
  try {
    return {
      commit: git('rev-parse', '--short', 'HEAD'),
      branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
      dirty: git('status', '--porcelain').length > 0,
    };
  } catch {
    return { commit: 'unknown', branch: 'unknown', dirty: false };
  }
}

async function startServer(): Promise<{ url: string; stop: () => void }> {
  const child = spawn(
    'pnpm',
    ['--filter', '@hrt/web', 'exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  );
  let output = '';
  child.stdout.on('data', (d) => {
    output += d;
  });
  child.stderr.on('data', (d) => {
    output += d;
  });
  const url = `http://localhost:${PORT}`;
  const stop = () => {
    try {
      // The whole group: pnpm and the vite process it started.
      if (child.pid) process.kill(-child.pid);
    } catch {
      // Already stopped.
    }
  };
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Local server stopped:\n${output}`);
    try {
      if ((await fetch(url)).ok) return { url, stop };
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  stop();
  throw new Error(`Local server did not start on port ${PORT}:\n${output}`);
}

async function launchBrowser(o: RunOptions): Promise<Browser> {
  const args = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
  // Without the frame cap, the FPS shows the headroom above the screen rate.
  if (!o.vsync) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  try {
    return await chromium.launch({ channel: 'chrome', headless: o.headless, args });
  } catch {
    // No Chrome installed: Playwright's Chromium (`pnpm exec playwright install chromium`).
    return chromium.launch({ headless: o.headless, args });
  }
}

async function openBench(browser: Browser, url: string, o: RunOptions): Promise<Page> {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(`  [page] ${e.message}`));
  await page.goto(`${url}/#/bench?auto=1${o.webgl2 ? '&renderer=webgl2' : ''}`);
  await page.waitForFunction(() => window.hrtBench !== undefined, null, { timeout: 60_000 });
  return page;
}

const fmt = (m: BenchMetrics) => {
  const over = overBudget(m);
  return `${m.avgFps.toFixed(0).padStart(4)} FPS (1 % low ${m.low1Fps.toFixed(0)}) · ${m.drawCalls} draw calls · ${(m.triangles / 1e6).toFixed(2)} M tri · ${m.gpuMemoryMB.total.toFixed(0)} Mo${over.length ? `  ⚠ hors budget : ${over.join(', ')}` : ''}`;
};

async function main() {
  const o = parseRunArgs(process.argv.slice(2));
  const g = gitInfo();
  const label = sanitizeLabel(
    o.label ?? `${new Date().toISOString().slice(0, 10)}-${g.commit}${g.dirty ? '-modifie' : ''}`,
  );
  const dir = runDir(label);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'captures'), { recursive: true });

  if (o.build) {
    console.log('Build de apps/web…');
    execFileSync('pnpm', ['--filter', '@hrt/web', 'build'], { cwd: ROOT, stdio: 'inherit' });
  }
  const server = o.url ? { url: o.url, stop: () => undefined } : await startServer();
  const browser = await launchBrowser(o);
  try {
    const page = await openBench(browser, server.url, o);
    const all = await page.evaluate(() => window.hrtBench?.viewpoints ?? []);
    const unknown = o.viewpoints.filter((id) => !all.some((v) => v.id === id));
    if (unknown.length) throw new Error(`Unknown viewpoints: ${unknown.join(', ')}`);
    const viewpoints = o.viewpoints.length ? all.filter((v) => o.viewpoints.includes(v.id)) : all;

    const metrics: BenchMetrics[] = [];
    const total = viewpoints.length * o.qualities.length;
    let environment: BenchRun['environment'] | null = null;
    for (const quality of o.qualities) {
      for (const vp of viewpoints) {
        await page.evaluate(([id, q]) => window.hrtBench?.show(id, q), [vp.id, quality] as const);
        environment ??= await page.evaluate(() => window.hrtBench?.environment() ?? null);
        await page.screenshot({
          path: join(dir, 'captures', captureName(vp.id, quality)),
          type: 'jpeg',
          quality: 90,
        });
        const m = await page.evaluate((d) => window.hrtBench?.measure(d), o.durationS);
        if (!m) throw new Error('Bench page went away');
        metrics.push(m);
        console.log(`[${metrics.length}/${total}] ${`${vp.id} @ ${quality}`.padEnd(36)} ${fmt(m)}`);
      }
    }
    if (!environment) throw new Error('No measurement');

    const run: BenchRun = {
      label,
      createdAt: new Date().toISOString(),
      git: g,
      options: { durationS: o.durationS, vsync: o.vsync, headless: o.headless },
      environment,
      viewpoints: [...viewpoints],
      metrics,
    };
    writeFileSync(join(dir, 'results.json'), `${JSON.stringify(run, null, 2)}\n`);
    writeFileSync(join(dir, 'report.html'), renderRunReport(run));
    console.log(`\nRapport : ${relative(process.cwd(), join(dir, 'report.html'))}`);
    console.log(`Comparer avec un autre run : pnpm bench:compare <avant> ${label}`);
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  if (String(err).includes('Unknown option')) console.error(RUN_USAGE);
  process.exitCode = 1;
});
