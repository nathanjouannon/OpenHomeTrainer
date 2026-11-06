// Built-in workouts, expressed as shares of FTP so they fit any rider.

import { ftp, type Step, type Workout } from './model';

const min = (m: number) => m * 60;
const steady = (m: number, f: number, label?: string): Step => ({
  type: 'steady',
  durationS: min(m),
  power: ftp(f),
  ...(label && { label }),
});
const ramp = (m: number, a: number, b: number, label?: string): Step => ({
  type: 'ramp',
  durationS: min(m),
  from: ftp(a),
  to: ftp(b),
  ...(label && { label }),
});
const repeat = (times: number, ...steps: Step[]): Step => ({ type: 'repeat', times, steps });

const warm = ramp(10, 0.45, 0.7, 'Warmup');
const cool = ramp(5, 0.6, 0.4, 'Cooldown');

export const BUILTIN_WORKOUTS: readonly Workout[] = [
  {
    id: 'endurance-60',
    name: 'Endurance 60 min',
    description: 'Steady zone 2 effort to build the base.',
    source: 'builtin',
    steps: [
      ramp(5, 0.45, 0.65, 'Warmup'),
      steady(50, 0.65, 'Endurance'),
      ramp(5, 0.6, 0.4, 'Cooldown'),
    ],
  },
  {
    id: 'tempo-3x10',
    name: 'Tempo 3 × 10',
    description: 'Three blocks of ten minutes at the top of zone 3.',
    source: 'builtin',
    steps: [warm, repeat(3, steady(10, 0.85, 'Tempo'), steady(4, 0.55, 'Recovery')), cool],
  },
  {
    id: 'sweet-spot-2x20',
    name: 'Sweet spot 2 × 20',
    description: 'Two twenty-minute efforts at 90 % of FTP: the classic time-efficient session.',
    source: 'builtin',
    steps: [
      warm,
      steady(20, 0.9, 'Sweet spot'),
      steady(5, 0.55, 'Recovery'),
      steady(20, 0.9, 'Sweet spot'),
      cool,
    ],
  },
  {
    id: 'threshold-3x10',
    name: 'Threshold 3 × 10',
    description: 'Three ten-minute blocks right at FTP.',
    source: 'builtin',
    steps: [warm, repeat(3, steady(10, 1, 'Threshold'), steady(5, 0.5, 'Recovery')), cool],
  },
  {
    id: 'vo2max-5x4',
    name: 'VO2max 5 × 4',
    description: 'Five four-minute efforts at 115 % of FTP with equal recovery.',
    source: 'builtin',
    steps: [warm, repeat(5, steady(4, 1.15, 'VO2max'), steady(4, 0.5, 'Recovery')), cool],
  },
  {
    id: 'sprints-8x30',
    name: 'Sprints 8 × 30 s',
    description: 'Short maximal-ish efforts to wake up the legs.',
    source: 'builtin',
    steps: [warm, repeat(8, steady(0.5, 1.8, 'Sprint'), steady(3.5, 0.5, 'Recovery')), cool],
  },
  {
    id: 'over-unders',
    name: 'Over-unders 3 × 12',
    description: 'Alternating just under and just over threshold to learn to clear lactate.',
    source: 'builtin',
    steps: [
      warm,
      repeat(
        3,
        repeat(4, steady(1.5, 0.95, 'Under'), steady(1.5, 1.05, 'Over')),
        steady(5, 0.5, 'Recovery'),
      ),
      cool,
    ],
  },
  {
    id: 'ftp-ramp-test',
    name: 'Ramp test',
    description:
      'Steps of 6 % of FTP every minute until you cannot continue. Your new FTP is about 75 % of your best minute. Based on your current FTP.',
    source: 'builtin',
    steps: [
      steady(5, 0.5, 'Warmup'),
      ...Array.from({ length: 16 }, (_, i) => steady(1, 0.56 + i * 0.06, 'Step')),
      steady(5, 0.4, 'Cooldown'),
    ],
  },
  {
    id: 'ftp-20-test',
    name: 'FTP test 20 min',
    description:
      'Warm up, a short opener, then 20 minutes as hard as you can hold. FTP is about 95 % of the average.',
    source: 'builtin',
    steps: [
      ramp(10, 0.45, 0.7, 'Warmup'),
      repeat(3, steady(1, 1, 'Opener'), steady(1, 0.5, 'Easy')),
      steady(5, 0.5, 'Recovery'),
      steady(20, 1, 'Test (go all out)'),
      ramp(10, 0.6, 0.4, 'Cooldown'),
    ],
  },
];

export const findBuiltin = (id: string) => BUILTIN_WORKOUTS.find((w) => w.id === id);
