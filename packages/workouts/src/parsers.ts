// Importers for Zwift `.zwo` and the text formats `.erg` / `.mrc`.
// Written without DOM so they run anywhere (docs/14 §2).

import { ftp, type Power, type Step, type Workout, watts } from './model';

export class WorkoutParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkoutParseError';
  }
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};
const decode = (s: string) =>
  s
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const newWorkoutId = (name: string) =>
  `${slug(name) || 'workout'}-${Math.random().toString(36).slice(2, 7)}`;

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    out[(m[1] as string).toLowerCase()] = decode((m[3] ?? m[4]) as string);
  }
  return out;
}

function num(a: Record<string, string>, key: string, element: string, required = true): number {
  const raw = a[key.toLowerCase()];
  if (raw === undefined || raw === '') {
    if (required) throw new WorkoutParseError(`${element}: missing ${key}`);
    return Number.NaN;
  }
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) throw new WorkoutParseError(`${element}: invalid ${key}`);
  return v;
}

/** `.zwo` powers are fractions of FTP (0.75); some exporters write 75. */
const zwoPower = (v: number): Power => ftp(v > 3 ? v / 100 : v);

export function parseZwo(xml: string): Workout {
  if (!/<workout_file[\s>]/i.test(xml)) throw new WorkoutParseError('not a .zwo file');
  const nameMatch = /<name>([\s\S]*?)<\/name>/i.exec(xml);
  const descMatch = /<description>([\s\S]*?)<\/description>/i.exec(xml);
  const body = /<workout>([\s\S]*?)<\/workout>/i.exec(xml)?.[1] ?? '';
  const steps: Step[] = [];
  for (const m of body.matchAll(/<([A-Za-z]+)\b([^>]*?)\/?>/g)) {
    const el = m[1] as string;
    const a = attrs(m[2] as string);
    switch (el.toLowerCase()) {
      case 'warmup':
      case 'cooldown':
      case 'ramp': {
        const low = num(a, 'PowerLow', el);
        const high = num(a, 'PowerHigh', el);
        const durationS = num(a, 'Duration', el);
        steps.push({
          type: 'ramp',
          durationS,
          from: zwoPower(low),
          to: zwoPower(high),
          ...(el.toLowerCase() === 'warmup' && { label: 'Warmup' }),
          ...(el.toLowerCase() === 'cooldown' && { label: 'Cooldown' }),
        });
        break;
      }
      case 'steadystate':
        steps.push({
          type: 'steady',
          durationS: num(a, 'Duration', el),
          power: zwoPower(num(a, 'Power', el)),
        });
        break;
      case 'freeride':
        // No target: the closest honest thing is an easy steady effort.
        steps.push({
          type: 'steady',
          durationS: num(a, 'Duration', el),
          power: ftp(0.55),
          label: 'Free ride',
        });
        break;
      case 'intervalst': {
        const times = Math.max(1, Math.round(num(a, 'Repeat', el)));
        steps.push({
          type: 'repeat',
          times,
          steps: [
            {
              type: 'steady',
              durationS: num(a, 'OnDuration', el),
              power: zwoPower(num(a, 'OnPower', el)),
              label: 'On',
            },
            {
              type: 'steady',
              durationS: num(a, 'OffDuration', el),
              power: zwoPower(num(a, 'OffPower', el)),
              label: 'Off',
            },
          ],
        });
        break;
      }
      default:
        // textevent, message, unknown future elements: not part of the plan.
        break;
    }
  }
  if (steps.length === 0) throw new WorkoutParseError('no usable interval in the .zwo file');
  const name = nameMatch ? decode(nameMatch[1] as string) : 'Workout';
  return {
    id: newWorkoutId(name),
    name: name || 'Workout',
    ...(descMatch && { description: decode(descMatch[1] as string) }),
    steps,
    source: 'zwo',
  };
}

/**
 * `.erg` (absolute watts) and `.mrc` (percent of FTP): a header, then
 * `[COURSE DATA]` with `minutes value` points. Two points at the same time
 * make a step; different values over time make a ramp.
 */
export function parseErgMrc(text: string, format: 'erg' | 'mrc' = 'mrc'): Workout {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const header: string[] = [];
  const data: [number, number][] = [];
  let section: 'none' | 'header' | 'data' | 'other' = 'none';
  let description: string | undefined;
  let name: string | undefined;
  for (const line of lines) {
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper === '[COURSE HEADER]') section = 'header';
    else if (upper === '[COURSE DATA]') section = 'data';
    else if (upper.startsWith('[END ')) section = 'other';
    else if (upper.startsWith('[')) section = 'other';
    else if (section === 'header') {
      header.push(upper);
      const kv = /^(DESCRIPTION|FILE NAME)\s*=\s*(.*)$/i.exec(line);
      if (kv?.[2]) {
        if (kv[1]?.toUpperCase() === 'DESCRIPTION') description = kv[2];
        else name = kv[2];
      }
    } else if (section === 'data') {
      const [a, b] = line.split(/[\s,;]+/).map(Number);
      if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) {
        throw new WorkoutParseError(`invalid course data line: ${line}`);
      }
      data.push([a, b]);
    }
  }
  if (data.length < 2) throw new WorkoutParseError('not enough course data');

  const columns = header.find((h) => /^(MINUTES|SECONDS)\s+/.test(h)) ?? '';
  const percent = columns.includes('PERCENT') || (!columns.includes('WATTS') && format === 'mrc');
  const toS = columns.startsWith('SECONDS') ? 1 : 60;
  const power = (v: number): Power => (percent ? ftp(v / 100) : watts(v));

  const steps: Step[] = [];
  for (let i = 1; i < data.length; i++) {
    const [t0, v0] = data[i - 1] as [number, number];
    const [t1, v1] = data[i] as [number, number];
    const durationS = Math.round((t1 - t0) * toS);
    if (durationS < 0) throw new WorkoutParseError('course data goes back in time');
    if (durationS === 0) continue;
    steps.push(
      v0 === v1
        ? { type: 'steady', durationS, power: power(v0) }
        : { type: 'ramp', durationS, from: power(v0), to: power(v1) },
    );
  }
  if (steps.length === 0) throw new WorkoutParseError('no usable interval in the course data');
  const title = name ?? 'Workout';
  return {
    id: newWorkoutId(title),
    name: title,
    ...(description && { description }),
    steps: mergeSteady(steps),
    source: format,
  };
}

/** Joins neighbouring steady pieces at the same power (data points on a plateau). */
function mergeSteady(steps: Step[]): Step[] {
  const out: Step[] = [];
  for (const s of steps) {
    const prev = out[out.length - 1];
    if (
      prev?.type === 'steady' &&
      s.type === 'steady' &&
      prev.power.unit === s.power.unit &&
      prev.power.value === s.power.value
    ) {
      out[out.length - 1] = { ...prev, durationS: prev.durationS + s.durationS };
    } else out.push(s);
  }
  return out;
}

/** Picks the parser from the file name, then from the content. */
export function parseWorkoutFile(fileName: string, text: string): Workout {
  const ext = fileName.toLowerCase().split('.').pop();
  let w: Workout;
  if (ext === 'zwo' || /<workout_file[\s>]/i.test(text)) w = parseZwo(text);
  else w = parseErgMrc(text, ext === 'erg' ? 'erg' : 'mrc');
  if (w.name === 'Workout') {
    const base = fileName.replace(/\.[^.]+$/, '').trim();
    if (base) w = { ...w, name: base };
  }
  return w;
}
