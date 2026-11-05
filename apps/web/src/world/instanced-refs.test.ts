import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// React calls an inline `ref={(m) => …}` again on every render. An inline ref
// that resets an instanced batch (`count`, `visible`, `layers`) empties it until
// the next refill: fences, posts and shadows blinked at every HUD update
// (docs/16 §3). The set-up belongs in a `useLayoutEffect` with a stable ref.

const dir = resolve(import.meta.dirname);

/** Body of every inline ref callback of a source file. */
function inlineRefs(source: string): string[] {
  const out: string[] = [];
  const start = /ref=\{\s*\(\w*\)\s*=>\s*\{/g;
  for (let m = start.exec(source); m; m = start.exec(source)) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    out.push(source.slice(m.index, i));
  }
  return out;
}

describe('inline refs of the world components', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));

  it('finds the components', () => {
    expect(files).toContain('RoadFurniture.tsx');
    expect(inlineRefs('<a ref={(m) => { x(m); if (m) { y(); } }} />')).toHaveLength(1);
  });

  it.each(files)('%s: no inline ref resets an instanced batch', (file) => {
    const source = readFileSync(resolve(dir, file), 'utf8');
    for (const body of inlineRefs(source)) {
      expect(body).not.toMatch(/\.(count|visible)\s*=|\.layers\.set\(/);
    }
  });
});
