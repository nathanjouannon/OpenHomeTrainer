// Fixed viewpoints of the comparison bench (lot 2.0). Never change the id or
// the position of an existing viewpoint: the before/after comparisons rely on
// them. Add new ones instead.

import type { BenchViewpoint } from './protocol';

export const BENCH_WORLD_ID = 'world-1';

export const BENCH_VIEWPOINTS: readonly BenchViewpoint[] = [
  // Lake loop (flat).
  {
    id: 'lac-route-degagee',
    label: 'Boucle du lac — route dégagée dans la plaine',
    kind: 'open-road',
    routeId: 'boucle-du-lac',
    atM: 600,
    camera: 'pov',
  },
  {
    id: 'lac-foret',
    label: 'Boucle du lac — passage boisé',
    kind: 'forest',
    routeId: 'boucle-du-lac',
    atM: 1450,
    camera: 'pov',
  },
  {
    id: 'lac-village-verane',
    label: 'Boucle du lac — Vérane, au bord du lac',
    kind: 'village',
    routeId: 'boucle-du-lac',
    atM: 3100,
    camera: 'pov',
  },
  {
    id: 'lac-village-verane-drone',
    label: 'Boucle du lac — Vérane vue du drone',
    kind: 'village',
    routeId: 'boucle-du-lac',
    atM: 3100,
    camera: 'drone',
  },
  {
    id: 'lac-rive',
    label: 'Boucle du lac — rive après Vérane',
    kind: 'lake',
    routeId: 'boucle-du-lac',
    atM: 3850,
    camera: 'pov',
  },
  // Hills loop (rolling).
  {
    id: 'collines-foret',
    label: 'Boucle des collines — lisière de forêt',
    kind: 'forest',
    routeId: 'boucle-des-collines',
    atM: 2500,
    camera: 'pov',
  },
  {
    id: 'collines-montee',
    label: 'Boucle des collines — montée à 9 %',
    kind: 'climb',
    routeId: 'boucle-des-collines',
    atM: 9400,
    camera: 'pov',
  },
  {
    id: 'collines-sommet',
    label: 'Boucle des collines — sommet, vue de derrière',
    kind: 'summit',
    routeId: 'boucle-des-collines',
    atM: 10600,
    camera: 'chase',
  },
  {
    id: 'collines-plaine',
    label: 'Boucle des collines — retour par la plaine',
    kind: 'open-road',
    routeId: 'boucle-des-collines',
    atM: 16600,
    camera: 'pov',
  },
  // Pass loop (mountain).
  {
    id: 'col-village-montverane',
    label: 'Boucle du col — Montvérane, village de montagne',
    kind: 'village',
    routeId: 'boucle-du-col',
    atM: 6850,
    camera: 'pov',
  },
  {
    id: 'col-montee',
    label: 'Boucle du col — montée à 10 % vers 1 000 m',
    kind: 'climb',
    routeId: 'boucle-du-col',
    atM: 9400,
    camera: 'pov',
  },
  {
    id: 'col-sommet',
    label: 'Boucle du col — sommet du col',
    kind: 'summit',
    routeId: 'boucle-du-col',
    atM: 11750,
    camera: 'pov',
  },
  {
    id: 'col-sommet-drone',
    label: 'Boucle du col — sommet vu du drone',
    kind: 'summit',
    routeId: 'boucle-du-col',
    atM: 11750,
    camera: 'drone',
  },
  {
    id: 'col-descente-foret',
    label: 'Boucle du col — descente en forêt',
    kind: 'forest',
    routeId: 'boucle-du-col',
    atM: 16700,
    camera: 'pov',
  },
  {
    id: 'col-port-verane',
    label: 'Boucle du col — Port-Vérane',
    kind: 'village',
    routeId: 'boucle-du-col',
    atM: 18600,
    camera: 'pov',
  },
  {
    id: 'col-rive-lac',
    label: 'Boucle du col — bord du lac, vue de derrière',
    kind: 'lake',
    routeId: 'boucle-du-col',
    atM: 24100,
    camera: 'chase',
  },
];
