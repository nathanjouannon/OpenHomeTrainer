// HTML reports: one run, or a before/after comparison of two runs.

import {
  type BenchMetrics,
  type BenchQuality,
  type BenchRun,
  BUDGETS,
  type BudgetKey,
  captureName,
  overBudget,
} from './results';

type Better = 'higher' | 'lower';

interface MetricDef {
  key: BudgetKey | 'low1Fps';
  label: string;
  get: (m: BenchMetrics) => number;
  better: Better;
  format: (n: number) => string;
  /** Relative change under which the difference is treated as noise. */
  noise: number;
}

export const METRICS: readonly MetricDef[] = [
  {
    key: 'fps',
    label: 'FPS moyen',
    get: (m) => m.avgFps,
    better: 'higher',
    format: (n) => n.toFixed(0),
    // Same build, two runs: about ±6 % on a fanless laptop.
    noise: 0.1,
  },
  {
    key: 'low1Fps',
    label: '1 % low',
    get: (m) => m.low1Fps,
    better: 'higher',
    format: (n) => n.toFixed(0),
    noise: 0.2,
  },
  {
    key: 'drawCalls',
    label: 'Draw calls',
    get: (m) => m.drawCalls,
    better: 'lower',
    format: (n) => n.toFixed(0),
    noise: 0,
  },
  {
    key: 'triangles',
    label: 'Triangles',
    get: (m) => m.triangles,
    better: 'lower',
    format: (n) => `${(n / 1e6).toFixed(2)} M`,
    noise: 0,
  },
  {
    key: 'gpuMemory',
    label: 'Mém. GPU',
    get: (m) => m.gpuMemoryMB.total,
    better: 'lower',
    format: (n) => `${n.toFixed(0)} Mo`,
    noise: 0.01,
  },
];

export type Verdict = 'better' | 'worse' | 'same';

/** Relative change from `before` to `after` and whether it is an improvement. */
export function delta(
  before: number,
  after: number,
  better: Better,
  noise: number,
): { relative: number; verdict: Verdict } {
  const relative = before === 0 ? (after === 0 ? 0 : Number.POSITIVE_INFINITY) : after / before - 1;
  if (Math.abs(relative) <= noise || before === after) return { relative, verdict: 'same' };
  const up = relative > 0;
  return { relative, verdict: up === (better === 'higher') ? 'better' : 'worse' };
}

export interface ComparisonRow {
  viewpoint: string;
  quality: BenchQuality;
  before: BenchMetrics | null;
  after: BenchMetrics | null;
}

/** Pairs the measurements of two runs by viewpoint and quality (after's order first). */
export function pairRuns(before: BenchRun, after: BenchRun): ComparisonRow[] {
  const key = (m: BenchMetrics) => `${m.viewpoint}@${m.quality}`;
  const old = new Map(before.metrics.map((m) => [key(m), m]));
  const rows: ComparisonRow[] = after.metrics.map((m) => {
    const b = old.get(key(m)) ?? null;
    old.delete(key(m));
    return { viewpoint: m.viewpoint, quality: m.quality, before: b, after: m };
  });
  for (const m of old.values()) {
    rows.push({ viewpoint: m.viewpoint, quality: m.quality, before: m, after: null });
  }
  return rows;
}

/** Why two runs may not be comparable (different machine or settings). */
export function comparabilityWarnings(before: BenchRun, after: BenchRun): string[] {
  const w: string[] = [];
  if (before.environment.gpu !== after.environment.gpu) {
    w.push(`GPU différents : ${before.environment.gpu} / ${after.environment.gpu}`);
  }
  const vb = before.environment.viewport;
  const va = after.environment.viewport;
  if (vb.width !== va.width || vb.height !== va.height) {
    w.push(`Résolutions différentes : ${vb.width}×${vb.height} / ${va.width}×${va.height}`);
  }
  if (before.options.vsync !== after.options.vsync) w.push('Réglage vsync différent');
  if (before.options.headless !== after.options.headless) {
    w.push('Un run sans fenêtre, l’autre avec : FPS peu comparables');
  }
  return w;
}

export interface QualitySummary {
  quality: BenchQuality;
  minAvgFps: number;
  minLow1Fps: number;
  maxDrawCalls: number;
  maxTriangles: number;
  maxGpuMemoryMB: number;
  overBudget: number;
}

export function summarize(metrics: readonly BenchMetrics[]): QualitySummary[] {
  const out: QualitySummary[] = [];
  for (const quality of ['low', 'medium', 'high'] as const) {
    const ms = metrics.filter((m) => m.quality === quality);
    if (ms.length === 0) continue;
    out.push({
      quality,
      minAvgFps: Math.min(...ms.map((m) => m.avgFps)),
      minLow1Fps: Math.min(...ms.map((m) => m.low1Fps)),
      maxDrawCalls: Math.max(...ms.map((m) => m.drawCalls)),
      maxTriangles: Math.max(...ms.map((m) => m.triangles)),
      maxGpuMemoryMB: Math.max(...ms.map((m) => m.gpuMemoryMB.total)),
      overBudget: ms.filter((m) => overBudget(m).length > 0).length,
    });
  }
  return out;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f6f7f9; --card: #fff; --fg: #1d232b; --muted: #5d6877;
  --border: #d9dee5; --good: #16794a; --bad: #b42318; }
@media (prefers-color-scheme: dark) { :root { --bg: #12161c; --card: #1b2129; --fg: #e6eaf0;
  --muted: #9aa6b5; --border: #2d3540; --good: #4cc38a; --bad: #ff7b72; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--fg);
  font: 14px/1.5 system-ui, sans-serif; }
main { max-width: 1500px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 32px 0 8px; }
.muted { color: var(--muted); }
.warn { border-left: 4px solid var(--bad); padding: 8px 12px; background: var(--card); margin: 12px 0; }
table { border-collapse: collapse; font-variant-numeric: tabular-nums; background: var(--card); }
th, td { padding: 4px 10px; border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
.over { color: var(--bad); font-weight: 600; }
.better { color: var(--good); }
.worse { color: var(--bad); font-weight: 600; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px;
  margin: 16px 0; }
.card h3 { margin: 0 0 8px; font-size: 15px; }
.shots { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.shots figure { margin: 0; }
.shots img { width: 100%; height: auto; display: block; border-radius: 4px; }
.shots figcaption { font-size: 12px; color: var(--muted); }
.scroll { overflow-x: auto; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>
${body}
</main></body>
</html>
`;
}

function runHeader(run: BenchRun): string {
  const e = run.environment;
  return `${escapeHtml(run.label)} · ${escapeHtml(run.createdAt.slice(0, 16).replace('T', ' '))} ·
commit ${escapeHtml(run.git.commit)}${run.git.dirty ? ' (modifié)' : ''} sur ${escapeHtml(run.git.branch)}<br>
${escapeHtml(e.gpu)} · ${escapeHtml(e.backend)} · ${e.viewport.width}×${e.viewport.height} ·
${run.options.headless ? 'sans fenêtre' : 'fenêtre visible'} · vsync ${run.options.vsync ? 'actif' : 'désactivé'} ·
${run.options.durationS} s par mesure`;
}

function summaryTable(metrics: readonly BenchMetrics[]): string {
  const rows = summarize(metrics)
    .map((s) => {
      const cls = (bad: boolean) => (bad ? ' class="over"' : '');
      const res = BUDGETS.resourceQualities.includes(s.quality);
      return `<tr><td>${s.quality}</td>
<td${cls(s.minAvgFps < BUDGETS.minFps[s.quality])}>${s.minAvgFps.toFixed(0)}</td>
<td>${s.minLow1Fps.toFixed(0)}</td>
<td${cls(res && s.maxDrawCalls >= BUDGETS.drawCalls)}>${s.maxDrawCalls}</td>
<td${cls(res && s.maxTriangles >= BUDGETS.triangles)}>${(s.maxTriangles / 1e6).toFixed(2)} M</td>
<td${cls(res && s.maxGpuMemoryMB >= BUDGETS.gpuMemoryMB)}>${s.maxGpuMemoryMB.toFixed(0)} Mo</td>
<td${cls(s.overBudget > 0)}>${s.overBudget}</td></tr>`;
    })
    .join('\n');
  return `<div class="scroll"><table>
<tr><th>Qualité</th><th>FPS moyen min.</th><th>1 % low min.</th><th>Draw calls max.</th>
<th>Triangles max.</th><th>Mém. GPU max.</th><th>Hors budget</th></tr>
${rows}
</table></div>
<p class="muted">Budgets (docs/05 §4) : FPS moyen ≥ ${BUDGETS.minFps.medium} en low et medium, ≥ ${BUDGETS.minFps.high} en high ;
en low et medium, &lt; ${BUDGETS.drawCalls} draw calls, &lt; ${BUDGETS.triangles / 1e6} M triangles et &lt; ${(BUDGETS.gpuMemoryMB / 1024).toFixed(1)} Go de mémoire GPU (estimée).
FPS mesuré sans plafond d'écran : il montre la marge disponible.</p>`;
}

function metricCells(m: BenchMetrics): string {
  const over = new Set<string>(overBudget(m));
  return METRICS.map(
    (d) => `<td${over.has(d.key) ? ' class="over"' : ''}>${d.format(d.get(m))}</td>`,
  ).join('');
}

const metricHeaders = () => METRICS.map((d) => `<th>${d.label}</th>`).join('');

export function renderRunReport(run: BenchRun): string {
  const cards = run.viewpoints
    .map((vp) => {
      const ms = run.metrics.filter((m) => m.viewpoint === vp.id);
      if (ms.length === 0) return '';
      const shots = ms
        .map(
          (m) =>
            `<figure><a href="captures/${captureName(vp.id, m.quality)}"><img loading="lazy" src="captures/${captureName(vp.id, m.quality)}" alt=""></a><figcaption>${m.quality}</figcaption></figure>`,
        )
        .join('');
      const rows = ms.map((m) => `<tr><td>${m.quality}</td>${metricCells(m)}</tr>`).join('');
      return `<section class="card"><h3>${escapeHtml(vp.label)} <span class="muted">· ${escapeHtml(vp.id)}</span></h3>
<div class="shots">${shots}</div>
<div class="scroll"><table><tr><th>Qualité</th>${metricHeaders()}</tr>${rows}</table></div></section>`;
    })
    .join('\n');
  return page(
    `Banc ${run.label}`,
    `<h1>Banc de comparaison — ${escapeHtml(run.label)}</h1>
<p class="muted">${runHeader(run)}</p>
<h2>Synthèse</h2>
${summaryTable(run.metrics)}
<h2>Points de vue</h2>
${cards}`,
  );
}

function deltaCell(d: MetricDef, before: BenchMetrics | null, after: BenchMetrics | null): string {
  if (!before || !after) return `<td>${after ? d.format(d.get(after)) : '—'}</td>`;
  const b = d.get(before);
  const a = d.get(after);
  const { relative, verdict } = delta(b, a, d.better, d.noise);
  const pct = Number.isFinite(relative)
    ? `${relative >= 0 ? '+' : ''}${(relative * 100).toFixed(0)} %`
    : 'nouveau';
  const over = overBudget(after).includes(d.key as BudgetKey);
  return `<td class="${verdict === 'same' ? '' : verdict}${over ? ' over' : ''}" title="avant : ${d.format(b)}">${d.format(a)} <small>(${pct})</small></td>`;
}

export function renderComparison(
  before: BenchRun,
  after: BenchRun,
  /** Path from the report to the results folder of each run. */
  dirOf: (label: string) => string,
): string {
  const rows = pairRuns(before, after);
  const labels = new Map(
    [...before.viewpoints, ...after.viewpoints].map((v) => [v.id, v.label] as const),
  );
  const img = (run: BenchRun, r: ComparisonRow, present: boolean) => {
    if (!present) return '<figure><figcaption>absent</figcaption></figure>';
    const src = `${dirOf(run.label)}/captures/${captureName(r.viewpoint, r.quality)}`;
    return `<figure><a href="${escapeHtml(src)}"><img loading="lazy" src="${escapeHtml(src)}" alt=""></a><figcaption>${escapeHtml(run.label)}</figcaption></figure>`;
  };
  const cards = rows
    .map(
      (
        r,
      ) => `<section class="card"><h3>${escapeHtml(labels.get(r.viewpoint) ?? r.viewpoint)} · ${r.quality}</h3>
<div class="shots">${img(before, r, r.before !== null)}${img(after, r, r.after !== null)}</div>
<div class="scroll"><table><tr><th></th>${metricHeaders()}</tr>
<tr><td>${escapeHtml(before.label)}</td>${r.before ? metricCells(r.before) : METRICS.map(() => '<td>—</td>').join('')}</tr>
<tr><td>${escapeHtml(after.label)}</td>${METRICS.map((d) => deltaCell(d, r.before, r.after)).join('')}</tr>
</table></div></section>`,
    )
    .join('\n');
  const warnings = comparabilityWarnings(before, after)
    .map((w) => `<p class="warn">${escapeHtml(w)}</p>`)
    .join('');
  return page(
    `${before.label} → ${after.label}`,
    `<h1>Avant / après : ${escapeHtml(before.label)} → ${escapeHtml(after.label)}</h1>
<p class="muted">Avant : ${runHeader(before)}</p>
<p class="muted">Après : ${runHeader(after)}</p>
${warnings}
<h2>Synthèse — ${escapeHtml(before.label)}</h2>
${summaryTable(before.metrics)}
<h2>Synthèse — ${escapeHtml(after.label)}</h2>
${summaryTable(after.metrics)}
<h2>Points de vue</h2>
<p class="muted">Vert : amélioration, rouge : régression (bruit ignoré : ±10 % sur le FPS moyen, ±20 % sur le 1 % low).</p>
${cards}`,
  );
}
