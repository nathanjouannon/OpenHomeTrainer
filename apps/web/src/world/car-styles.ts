// Shape of each car of lot 2.17, read on the owner's 3/4 front photos
// (`docs/references/voitures/01..14.jpg`, not versioned) and on the sheet
// sizes of `car-geometry.ts`. Every `s*` is a distance from the FRONT bumper
// along the car (m); every `*H` is a height above the ground (m).

import { CAR_SPECS, type CarSpec } from './car-geometry';

export type CarTail = 'hatch' | 'wagon' | 'van' | 'pickup';
export type RimStyle = 'alloy5' | 'alloy10' | 'steel' | 'mesh' | 'dark10';
export type HeadlightStyle = 'slim' | 'fangs' | 'round' | 'bar' | 'wide';
export type LogoId =
  | 'renault'
  | 'peugeot'
  | 'vw'
  | 'fiat'
  | 'ford'
  | 'skoda'
  | 'dacia'
  | 'landrover'
  | 'toyota'
  | 'citroen';

export interface CarStyle {
  /** Front bumper to front axle. */
  ovF: number;
  /** Top of the nose, at the front bumper. */
  noseH: number;
  /** Cowl and belt line (base of the windscreen and of the side windows). */
  beltH: number;
  /** Base of the windscreen when lower than the belt line (boxy 4x4: low bonnet, high waist). */
  cowlH?: number;
  /** Rear deck, behind the rear window (hatch) or end of the belt (others). */
  deckH: number;
  sCowl: number;
  sRoofF: number;
  sRoofR: number;
  sTail: number;
  tail: CarTail;
  /** Glass narrowing from belt to roof, per side (m). */
  tumble: number;
  roofRails?: boolean;
  /** Thick black wheel-arch cladding (SUV). */
  cladding?: boolean;
  doors: 2 | 4;
  headlight: HeadlightStyle;
  /** Front grille: width, height and height of its centre. */
  grille: { w: number; h: number; y: number };
  rim: RimStyle;
  /** Round corners: plan radii at the front and rear (m), shoulder radius of the bonnet (m). */
  rF?: number;
  rR?: number;
  rS?: number;
  /** Black front bumper and rear bumper lower part. */
  skirtH: number;
  logo: LogoId;
  /** Black roof (contrast roof). */
  blackRoof?: boolean;
  /** Pickup: end of the cab and height of the bed rim. */
  sCabRear?: number;
  bedH?: number;
  /** Van: end of the side glass (the rest of the sides is panel). */
  sGlassEnd?: number;
  /** Boxy off-roader: flat panels, sharp edges, round headlights. */
  boxy?: boolean;
  /** Tyre width (m). */
  tyreW: number;
}

export const CAR_STYLES: Record<string, CarStyle> = {
  clio: {
    ovF: 0.84,
    rF: 0.6,
    rR: 0.5,
    rS: 0.27,
    noseH: 0.78,
    beltH: 0.94,
    deckH: 0.98,
    sCowl: 1.3,
    sRoofF: 2.15,
    sRoofR: 3.3,
    sTail: 3.82,
    tail: 'hatch',
    tumble: 0.17,
    doors: 4,
    headlight: 'slim',
    grille: { w: 0.62, h: 0.1, y: 0.58 },
    rim: 'alloy5',
    skirtH: 0.2,
    logo: 'renault',
    tyreW: 0.195,
  },
  '208': {
    ovF: 0.825,
    rF: 0.55,
    rR: 0.45,
    rS: 0.25,
    noseH: 0.8,
    beltH: 0.93,
    deckH: 0.97,
    sCowl: 1.25,
    sRoofF: 2.1,
    sRoofR: 3.25,
    sTail: 3.8,
    tail: 'hatch',
    tumble: 0.17,
    doors: 4,
    headlight: 'fangs',
    grille: { w: 0.8, h: 0.2, y: 0.58 },
    rim: 'dark10',
    skirtH: 0.24,
    logo: 'peugeot',
    blackRoof: true,
    tyreW: 0.205,
  },
  polo: {
    ovF: 0.83,
    rF: 0.5,
    rR: 0.45,
    rS: 0.25,
    noseH: 0.8,
    beltH: 0.93,
    deckH: 0.97,
    sCowl: 1.28,
    sRoofF: 2.15,
    sRoofR: 3.3,
    sTail: 3.83,
    tail: 'hatch',
    tumble: 0.17,
    doors: 4,
    headlight: 'slim',
    grille: { w: 0.7, h: 0.1, y: 0.62 },
    rim: 'steel',
    skirtH: 0.2,
    logo: 'vw',
    tyreW: 0.195,
  },
  '500': {
    ovF: 0.55,
    rF: 0.62,
    rR: 0.55,
    rS: 0.3,
    noseH: 0.78,
    beltH: 0.97,
    deckH: 1.02,
    sCowl: 0.95,
    sRoofF: 1.75,
    sRoofR: 2.85,
    sTail: 3.38,
    tail: 'hatch',
    tumble: 0.24,
    doors: 2,
    headlight: 'round',
    grille: { w: 0.5, h: 0.08, y: 0.5 },
    rim: 'mesh',
    skirtH: 0.16,
    logo: 'fiat',
    tyreW: 0.185,
  },
  golf: {
    ovF: 0.88,
    rF: 0.5,
    rR: 0.45,
    rS: 0.22,
    noseH: 0.78,
    beltH: 0.93,
    deckH: 0.97,
    sCowl: 1.3,
    sRoofF: 2.2,
    sRoofR: 3.55,
    sTail: 4.05,
    tail: 'hatch',
    tumble: 0.17,
    doors: 4,
    headlight: 'bar',
    grille: { w: 0.8, h: 0.14, y: 0.5 },
    rim: 'dark10',
    skirtH: 0.26,
    logo: 'vw',
    tyreW: 0.225,
  },
  focus: {
    ovF: 0.88,
    rF: 0.5,
    rR: 0.4,
    rS: 0.22,
    noseH: 0.8,
    beltH: 0.95,
    deckH: 0.97,
    sCowl: 1.38,
    sRoofF: 2.3,
    sRoofR: 3.62,
    sTail: 4.15,
    tail: 'hatch',
    tumble: 0.17,
    doors: 4,
    headlight: 'slim',
    grille: { w: 0.8, h: 0.2, y: 0.5 },
    rim: 'alloy5',
    skirtH: 0.22,
    logo: 'ford',
    tyreW: 0.215,
  },
  octavia: {
    ovF: 0.93,
    rF: 0.45,
    rR: 0.3,
    rS: 0.2,
    noseH: 0.8,
    beltH: 0.96,
    deckH: 1.0,
    sCowl: 1.4,
    sRoofF: 2.36,
    sRoofR: 4.42,
    sTail: 4.62,
    tail: 'wagon',
    tumble: 0.2,
    roofRails: true,
    doors: 4,
    headlight: 'slim',
    grille: { w: 0.72, h: 0.22, y: 0.58 },
    rim: 'alloy5',
    skirtH: 0.24,
    logo: 'skoda',
    tyreW: 0.225,
  },
  passat: {
    ovF: 0.93,
    rF: 0.45,
    rR: 0.3,
    rS: 0.2,
    noseH: 0.82,
    beltH: 0.98,
    deckH: 1.02,
    sCowl: 1.45,
    sRoofF: 2.42,
    sRoofR: 4.45,
    sTail: 4.7,
    tail: 'wagon',
    tumble: 0.2,
    roofRails: true,
    doors: 4,
    headlight: 'wide',
    grille: { w: 0.8, h: 0.2, y: 0.6 },
    rim: 'dark10',
    skirtH: 0.24,
    logo: 'vw',
    tyreW: 0.235,
  },
  scenic: {
    ovF: 0.86,
    rF: 0.5,
    rR: 0.45,
    rS: 0.25,
    noseH: 0.82,
    beltH: 1.0,
    deckH: 1.1,
    sCowl: 1.15,
    sRoofF: 2.1,
    sRoofR: 3.95,
    sTail: 4.3,
    tail: 'hatch',
    tumble: 0.2,
    doors: 4,
    headlight: 'wide',
    grille: { w: 0.7, h: 0.14, y: 0.58 },
    rim: 'alloy10',
    skirtH: 0.2,
    logo: 'renault',
    tyreW: 0.205,
  },
  duster: {
    ovF: 0.83,
    rF: 0.4,
    rR: 0.3,
    rS: 0.15,
    noseH: 0.93,
    beltH: 1.05,
    deckH: 1.12,
    sCowl: 1.35,
    sRoofF: 2.2,
    sRoofR: 3.8,
    sTail: 4.22,
    tail: 'hatch',
    tumble: 0.17,
    roofRails: true,
    cladding: true,
    doors: 4,
    headlight: 'wide',
    grille: { w: 0.7, h: 0.2, y: 0.74 },
    rim: 'alloy5',
    skirtH: 0.3,
    logo: 'dacia',
    tyreW: 0.215,
  },
  tiguan: {
    ovF: 0.87,
    rF: 0.45,
    rR: 0.35,
    rS: 0.17,
    noseH: 0.9,
    beltH: 1.05,
    deckH: 1.12,
    sCowl: 1.35,
    sRoofF: 2.3,
    sRoofR: 3.95,
    sTail: 4.38,
    tail: 'hatch',
    tumble: 0.18,
    roofRails: true,
    cladding: true,
    doors: 4,
    headlight: 'slim',
    grille: { w: 0.8, h: 0.2, y: 0.66 },
    rim: 'alloy10',
    skirtH: 0.3,
    logo: 'vw',
    tyreW: 0.235,
  },
  defender: {
    ovF: 0.82,
    rF: 0.12,
    rR: 0.1,
    rS: 0.05,
    noseH: 0.96,
    beltH: 1.42,
    cowlH: 1.1,
    deckH: 1.42,
    sCowl: 1.3,
    sRoofF: 1.62,
    sRoofR: 4.6,
    sTail: 4.76,
    tail: 'wagon',
    tumble: 0.08,
    roofRails: true,
    boxy: true,
    doors: 4,
    headlight: 'round',
    grille: { w: 0.7, h: 0.3, y: 0.78 },
    rim: 'dark10',
    skirtH: 0.26,
    logo: 'landrover',
    tyreW: 0.265,
  },
  hilux: {
    ovF: 0.97,
    rF: 0.35,
    rR: 0.12,
    rS: 0.12,
    noseH: 0.95,
    beltH: 1.15,
    deckH: 1.18,
    sCowl: 1.45,
    sRoofF: 2.3,
    sRoofR: 3.15,
    sTail: 3.3,
    tail: 'pickup',
    tumble: 0.18,
    doors: 4,
    headlight: 'slim',
    grille: { w: 0.7, h: 0.26, y: 0.76 },
    rim: 'alloy5',
    skirtH: 0.28,
    logo: 'toyota',
    sCabRear: 3.3,
    bedH: 1.18,
    tyreW: 0.265,
  },
  berlingo: {
    ovF: 0.85,
    rF: 0.3,
    rR: 0.2,
    rS: 0.14,
    noseH: 0.88,
    beltH: 1.1,
    deckH: 1.16,
    sCowl: 1.0,
    sRoofF: 1.9,
    sRoofR: 4.25,
    sTail: 4.4,
    tail: 'van',
    tumble: 0.14,
    doors: 2,
    headlight: 'slim',
    grille: { w: 0.7, h: 0.1, y: 0.8 },
    rim: 'steel',
    skirtH: 0.3,
    logo: 'citroen',
    sGlassEnd: 2.7,
    tyreW: 0.205,
  },
};

export function carSpec(id: string): CarSpec {
  const spec = CAR_SPECS.find((s) => s.id === id);
  if (!spec) throw new Error(`Unknown car ${id}`);
  return spec;
}
