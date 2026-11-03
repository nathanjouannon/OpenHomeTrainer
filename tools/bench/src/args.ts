// Command line of `pnpm bench`.

import type { BenchQuality } from './results';

export interface RunOptions {
  label: string | null;
  qualities: BenchQuality[];
  /** Viewpoint ids; empty = all. */
  viewpoints: string[];
  durationS: number;
  /** Already running app (skips the build and the local server). */
  url: string | null;
  build: boolean;
  headless: boolean;
  vsync: boolean;
}

export const RUN_USAGE = `pnpm bench [options]

  --label <nom>         dossier du résultat (défaut : date-commit), ex. avant-2.1
  --quality <q,...>     low,medium,high (défaut : les trois)
  --views <id,...>      points de vue (défaut : tous)
  --duration <s>        durée de mesure par point de vue (défaut : 4)
  --url <url>           application déjà lancée (pas de build ni de serveur)
  --no-build            réutilise le build existant d'apps/web
  --headed              Chrome visible (défaut : sans fenêtre, GPU actif)
  --vsync               FPS plafonné par l'écran (défaut : sans plafond, pour voir la marge)
`;

const QUALITIES: readonly BenchQuality[] = ['low', 'medium', 'high'];

export function parseRunArgs(argv: readonly string[]): RunOptions {
  const o: RunOptions = {
    label: null,
    qualities: [...QUALITIES],
    viewpoints: [],
    durationS: 4,
    url: null,
    build: true,
    headless: true,
    vsync: false,
  };
  const list = (v: string) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case '--':
        break;
      case '--label':
        o.label = value();
        break;
      case '--quality': {
        const qs = list(value());
        for (const q of qs) {
          if (!QUALITIES.includes(q as BenchQuality)) throw new Error(`Unknown quality "${q}"`);
        }
        o.qualities = qs as BenchQuality[];
        break;
      }
      case '--views':
        o.viewpoints = list(value());
        break;
      case '--duration': {
        const d = Number(value());
        if (!(d > 0 && d <= 600)) throw new Error('--duration must be in ]0, 600] s');
        o.durationS = d;
        break;
      }
      case '--url':
        o.url = value().replace(/\/+$/, '');
        o.build = false;
        break;
      case '--no-build':
        o.build = false;
        break;
      case '--headed':
        o.headless = false;
        break;
      case '--vsync':
        o.vsync = true;
        break;
      default:
        throw new Error(`Unknown option ${arg}\n\n${RUN_USAGE}`);
    }
  }
  return o;
}
