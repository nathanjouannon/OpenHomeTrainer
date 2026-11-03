// `pnpm bench:compare <before> <after>`: side-by-side captures and metric
// changes of two bench runs → bench-results/compare-<before>-vs-<after>.html.

import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { comparabilityWarnings, delta, METRICS, pairRuns, renderComparison } from './report';
import { RESULTS_DIR, readRun, sanitizeLabel } from './results';

function main() {
  const [a, b] = process.argv.slice(2).filter((x) => x !== '--');
  if (!a || !b) {
    console.error('Usage : pnpm bench:compare <label avant> <label après>');
    process.exitCode = 1;
    return;
  }
  const before = readRun(sanitizeLabel(a));
  const after = readRun(sanitizeLabel(b));
  for (const w of comparabilityWarnings(before, after)) console.warn(`⚠ ${w}`);

  // Console digest: regressions first.
  let regressions = 0;
  for (const row of pairRuns(before, after)) {
    const { before: mb, after: ma } = row;
    if (!mb || !ma) continue;
    const changes = METRICS.map((d) => ({
      d,
      ...delta(d.get(mb), d.get(ma), d.better, d.noise),
    })).filter((c) => c.verdict === 'worse');
    if (changes.length === 0) continue;
    regressions++;
    const what = changes
      .map((c) => `${c.d.label} ${c.relative >= 0 ? '+' : ''}${(c.relative * 100).toFixed(0)} %`)
      .join(', ');
    console.log(`▼ ${row.viewpoint} @ ${row.quality} : ${what}`);
  }
  if (regressions === 0) console.log('Aucune régression mesurée.');

  const file = join(RESULTS_DIR, `compare-${before.label}-vs-${after.label}.html`);
  writeFileSync(
    file,
    renderComparison(before, after, (label) => label),
  );
  console.log(`\nComparaison : ${relative(process.cwd(), file)}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
