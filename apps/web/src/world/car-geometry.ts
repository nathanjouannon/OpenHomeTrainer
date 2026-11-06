// Real-world dimensions of the cars of lot 2.17 (m). Body width excludes the
// mirrors. Sources: manufacturer and aggregator sheets read on 2026-11-06
// (autotijd.be, vehiclesizes.com, largus.fr, fiches-auto.fr, cararac.com,
// auto-data.net, parkers.co.uk, carexpert.com.au). Sources disagree by a few
// millimetres between model years and trims: the most common value is kept.

export type CarClass =
  | 'city'
  | 'compact'
  | 'wagon'
  | 'minivan'
  | 'suv'
  | 'offroad'
  | 'pickup'
  | 'van';

export interface CarSpec {
  id: string;
  name: string;
  /** Body style, drives the choice of cars by place (plain, village, farm, pass). */
  klass: CarClass;
  lengthM: number;
  /** Without mirrors. */
  widthM: number;
  heightM: number;
  wheelbaseM: number;
  /** Ground clearance under the body (m); sources give it for some cars only. */
  clearanceM: number;
  /** Wheel diameter incl. tyre (m): from the usual tyre size of the trim. */
  wheelDiameterM: number;
  /** Where the number is uncertain or not found in the sources. */
  note?: string;
}

export const CAR_SPECS: readonly CarSpec[] = [
  {
    id: 'clio',
    name: 'Renault Clio V',
    klass: 'city',
    lengthM: 4.05,
    widthM: 1.798,
    heightM: 1.44,
    wheelbaseM: 2.583,
    clearanceM: 0.12,
    wheelDiameterM: 0.62,
  },
  {
    id: '208',
    name: 'Peugeot 208 II',
    klass: 'city',
    lengthM: 4.055,
    widthM: 1.745,
    heightM: 1.43,
    wheelbaseM: 2.54,
    clearanceM: 0.12,
    wheelDiameterM: 0.61,
    note: 'Track 1.50 m front and rear, overhangs 0.825 / 0.690 m (largus.fr).',
  },
  {
    id: 'polo',
    name: 'Volkswagen Polo VI',
    klass: 'city',
    lengthM: 4.065,
    widthM: 1.751,
    heightM: 1.45,
    wheelbaseM: 2.551,
    clearanceM: 0.12,
    wheelDiameterM: 0.62,
    note: 'Front track 1.50 m.',
  },
  {
    id: '500',
    name: 'Fiat 500 électrique (2020)',
    klass: 'city',
    lengthM: 3.632,
    widthM: 1.683,
    heightM: 1.527,
    wheelbaseM: 2.322,
    clearanceM: 0.12,
    wheelDiameterM: 0.6,
    note: 'The photo is the electric 500 (cars-data.com), not the 2007-2024 petrol one (3.546 x 1.627 m).',
  },
  {
    id: 'golf',
    name: 'Volkswagen Golf VIII',
    klass: 'compact',
    lengthM: 4.284,
    widthM: 1.789,
    heightM: 1.456,
    wheelbaseM: 2.636,
    clearanceM: 0.13,
    wheelDiameterM: 0.64,
  },
  {
    id: 'focus',
    name: 'Ford Focus IV',
    klass: 'compact',
    lengthM: 4.38,
    widthM: 1.825,
    heightM: 1.45,
    wheelbaseM: 2.7,
    clearanceM: 0.12,
    wheelDiameterM: 0.64,
  },
  {
    id: 'octavia',
    name: 'Skoda Octavia IV Combi',
    klass: 'wagon',
    lengthM: 4.702,
    widthM: 1.829,
    heightM: 1.495,
    wheelbaseM: 2.686,
    clearanceM: 0.13,
    wheelDiameterM: 0.65,
    note: 'Wheelbase 2.686 m is from memory (not in the search results): to confirm.',
  },
  {
    id: 'passat',
    name: 'Volkswagen Passat B8 Variant',
    klass: 'wagon',
    lengthM: 4.773,
    widthM: 1.832,
    heightM: 1.48,
    wheelbaseM: 2.786,
    clearanceM: 0.14,
    wheelDiameterM: 0.66,
  },
  {
    id: 'scenic',
    name: 'Renault Scénic IV',
    klass: 'minivan',
    lengthM: 4.406,
    widthM: 1.866,
    heightM: 1.653,
    wheelbaseM: 2.73,
    clearanceM: 0.15,
    wheelDiameterM: 0.69,
    note: '1.866 m may be measured with the mirrors folded.',
  },
  {
    id: 'duster',
    name: 'Dacia Duster II',
    klass: 'suv',
    lengthM: 4.341,
    widthM: 1.804,
    heightM: 1.693,
    wheelbaseM: 2.673,
    clearanceM: 0.217,
    wheelDiameterM: 0.67,
  },
  {
    id: 'tiguan',
    name: 'Volkswagen Tiguan II (2016-2020)',
    klass: 'suv',
    lengthM: 4.486,
    widthM: 1.839,
    heightM: 1.673,
    wheelbaseM: 2.677,
    clearanceM: 0.18,
    wheelDiameterM: 0.69,
    note: 'The photo is the pre-facelift car: length, height and wheelbase from memory (the search found the 2021 facelift, 4.509 x 1.684 m), to confirm.',
  },
  {
    id: 'defender',
    name: 'Land Rover Defender 110 Station Wagon (1990-2016)',
    klass: 'offroad',
    lengthM: 4.785,
    widthM: 1.79,
    heightM: 2.035,
    wheelbaseM: 2.794,
    clearanceM: 0.23,
    wheelDiameterM: 0.78,
    note: 'The photo is the old Defender: its sizes are from memory (the search found the 2020 model, 5.018 x 2.008 m), to confirm. Land Cruiser not researched.',
  },
  {
    id: 'hilux',
    name: 'Toyota Hilux double cabine',
    klass: 'pickup',
    lengthM: 5.33,
    widthM: 1.855,
    heightM: 1.815,
    wheelbaseM: 3.085,
    clearanceM: 0.22,
    wheelDiameterM: 0.73,
    note: 'Width 1.855 m may be measured with the mirrors folded.',
  },
  {
    id: 'berlingo',
    name: 'Citroën Berlingo III (M)',
    klass: 'van',
    lengthM: 4.403,
    widthM: 1.848,
    heightM: 1.844,
    wheelbaseM: 2.785,
    clearanceM: 0.15,
    wheelDiameterM: 0.64,
  },
];
