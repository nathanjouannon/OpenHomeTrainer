// Geometry of the rider's bike (lot 2.12): SCOTT Addict RC, size 56, disc brakes.
// Rider frame, like `rider-geometry.ts`: +Z forward, +Y up, +X to the rider's
// left, origin on the ground between the wheels, metres. No Three.js here.
//
// Where the numbers come from:
//  - MEASURED (tape, by the owner): wheelbase, chainstay, bottom bracket
//    height, crank length, bottom bracket → top of the saddle (straight line).
//  - SPEC: 700×28 tyres on 65 mm deep rims (outer radius 0.34 m).
//  - PHOTO (profile, `docs/references/velo/profile.jpeg`, not versioned): the
//    other points of the frame. The photo is slightly oblique and wide-angle
//    (the rear is nearer than the front), so its pixels were mapped to metres
//    piecewise between three measured anchors (rear axle, bottom bracket,
//    front axle). Precision: about ±2 cm.
//  - COCKPIT: not read on the profile photo (the near side of the bars is
//    20 cm nearer the lens, too much parallax) but built from a few
//    dimensions (`STEM`, `BAR`) checked against the top and POV photos.

/** A point in the vertical plane of the bike. */
export interface Point {
  readonly y: number;
  readonly z: number;
}

const p = (z: number, y: number): Point => ({ y, z });

// --- Measured and specified ---------------------------------------------

/** Outer radius of the tyres (700×28 on a 65 mm rim). */
export const WHEEL_RADIUS = 0.34;
/** Radius of the rims (tyre bead seat) and of the deep rim profile. */
export const RIM_OUTER_RADIUS = 0.311;
export const RIM_INNER_RADIUS = RIM_OUTER_RADIUS - 0.065;
/** Axle to axle. */
export const WHEELBASE = 1.0;
/** Rear axle to bottom bracket. */
export const CHAINSTAY = 0.41;
/** Ground to the centre of the bottom bracket. */
export const BB_HEIGHT = 0.295;
export const CRANK_LENGTH = 0.175;
/** Bottom bracket to the top of the saddle, straight line. */
export const SADDLE_DISTANCE = 0.74;
/** Handlebar width, centre to centre of the drops (same as `BAR.width`). */
export const BAR_WIDTH = 0.4;

// --- Derived from the measures ------------------------------------------

export const REAR_AXLE = p(-WHEELBASE / 2, WHEEL_RADIUS);
export const FRONT_AXLE = p(WHEELBASE / 2, WHEEL_RADIUS);
/** Bottom bracket: chainstay long from the rear axle, `BB_HEIGHT` above the ground. */
export const BOTTOM_BRACKET = p(
  REAR_AXLE.z + Math.sqrt(CHAINSTAY ** 2 - (WHEEL_RADIUS - BB_HEIGHT) ** 2),
  BB_HEIGHT,
);
/** Drop of the bottom bracket under the axles. */
export const BB_DROP = WHEEL_RADIUS - BB_HEIGHT;

/**
 * Angle of the line bottom bracket → saddle, from the vertical (leaning
 * backwards), read on the profile photo: it does not depend on the scale.
 */
export const SADDLE_ANGLE = (15.4 * Math.PI) / 180;
/** Top of the saddle, `SADDLE_DISTANCE` from the bottom bracket along `SADDLE_ANGLE`. */
export const SADDLE_TOP = p(
  BOTTOM_BRACKET.z - SADDLE_DISTANCE * Math.sin(SADDLE_ANGLE),
  BOTTOM_BRACKET.y + SADDLE_DISTANCE * Math.cos(SADDLE_ANGLE),
);

// --- Read on the profile photo ------------------------------------------

/**
 * Saddle: rails clamp, nose and tail (the tail carries the bag). Read on the
 * photo relative to the top of the saddle, then moved with it: its height is
 * the measured one (`SADDLE_DISTANCE`), not the photo's.
 */
const PHOTO_SADDLE_TOP = p(-0.279, 0.973);
const onSaddle = (z: number, y: number): Point =>
  p(SADDLE_TOP.z + (z - PHOTO_SADDLE_TOP.z), SADDLE_TOP.y + (y - PHOTO_SADDLE_TOP.y));
export const SADDLE = {
  clamp: onSaddle(-0.292, 0.929),
  nose: onSaddle(-0.132, 0.955),
  tail: onSaddle(-0.388, 0.986),
} as const;

/** Head tube angle (published for the 56) and length. */
export const HEAD_ANGLE = (73 * Math.PI) / 180;
export const HEAD_TUBE_LENGTH = 0.155;
const HEAD_TUBE_TOP = p(0.312, 0.825);
/** Steering axis: its `z` at height `y`. */
const steeringAxisZ = (y: number) => HEAD_TUBE_TOP.z - (y - HEAD_TUBE_TOP.y) / Math.tan(HEAD_ANGLE);

/** Frame, from the seat cluster to the fork crown. */
export const FRAME = {
  /** Where the seatpost enters the frame (top tube meets the seat tube). */
  seatCluster: p(-0.199, 0.75),
  /** Top of the stem cap (on the steering axis). */
  stemTop: p(steeringAxisZ(0.882), 0.882),
  headTubeTop: HEAD_TUBE_TOP,
  /** Along the head tube axis (73°, the photo is too blurry there). */
  headTubeBottom: p(
    HEAD_TUBE_TOP.z + HEAD_TUBE_LENGTH * Math.cos(HEAD_ANGLE),
    HEAD_TUBE_TOP.y - HEAD_TUBE_LENGTH * Math.sin(HEAD_ANGLE),
  ),
  /** Where the seat stays join the seat tube (dropped stays). */
  seatStayJoint: p(-0.2, 0.69),
  /** A point of the seat tube, which hugs the rear wheel. */
  seatTubeMiddle: p(-0.157, 0.504),
} as const;

/** Distance (m) from the front axle to the steering axis. */
export const FORK_RAKE = (() => {
  const ux = Math.cos(HEAD_ANGLE);
  const uy = -Math.sin(HEAD_ANGLE);
  const dz = FRONT_AXLE.z - HEAD_TUBE_TOP.z;
  const dy = FRONT_AXLE.y - HEAD_TUBE_TOP.y;
  return Math.abs(dz * uy - dy * ux);
})();

// --- Cockpit: integrated stem + bar (Syncros Creston iC SL) -----------------
//
// THE NUMBERS TO TOUCH to reshape the cockpit are `STEM` and `BAR` below:
// everything else (the points of `COCKPIT`, the hands of the rider) follows.
// Distances along the bar are given from its centre, `u` forwards and `h`
// upwards in the plane of the bike, on the centre line of the tube.

/** Integrated stem. */
export const STEM = {
  /** Horizontal distance from the steering axis to the centre of the bar. */
  length: 0.11,
  /** Height of the centre of the bar above the ground. */
  barHeight: 0.905,
  /** Width of the stem seen from above (constant, it does not narrow). */
  width: 0.046,
  /** Width where it melts into the bar (the fillets of the T). */
  filletWidth: 0.09,
} as const;

/** Handlebar shape. */
export const BAR = {
  /** Centre to centre of the hoods and the drops (measured: 40 cm). */
  width: BAR_WIDTH,
  /** The tops sweep forwards a little before the bend. */
  topsSweep: 0.006,
  /** Radius of the bend tops → hoods, seen from above (small = sharp corner). */
  bendRadius: 0.04,
  /** Most forward point of the hook, from the centre of the bar. */
  reach: 0.09,
  /** Tops → bottom of the drops (centre lines). */
  drop: 0.125,
  /** Where the drops end (plug), behind the centre of the bar when < 0. */
  dropEnd: -0.03,
  /** Flat aero section of the tops: depth (fore-aft) and height, then the round taped tube. */
  topsDepth: 0.04,
  topsHeight: 0.022,
  tapeDiameter: 0.0255,
  /** Half-width where the flat tops turn into the round taped tube. */
  flatUntil: 0.11,
  tapeFrom: 0.145,
  /** Hood (Di2 lever body): where it starts on the hook and where its tip is. */
  hoodStart: 0.045,
  hoodTip: 0.155,
} as const;

const BAR_CENTER = p(steeringAxisZ(STEM.barHeight) + STEM.length, STEM.barHeight);
/** A point of the bar, from its centre (`u` forwards, `h` upwards). */
const onBar = (u: number, h: number): Point => p(BAR_CENTER.z + u, BAR_CENTER.y + h);

/** Key points of the bar (side view), derived from `STEM` and `BAR`. */
export const COCKPIT = {
  /** Centre of the bar, at the front end of the (integrated) stem. */
  barCenter: BAR_CENTER,
  /** End of the tops, where the bar bends towards the hoods. */
  topsEnd: onBar(BAR.topsSweep, 0),
  /** Top of the hoods (where the hands rest) and their tip. */
  hoodTop: onBar(0.105, 0.022),
  hoodTip: onBar(BAR.hoodTip, 0.03),
  /** Bottom of the brake lever. */
  leverBottom: onBar(0.105, -0.112),
  /** Lowest point of the drops and the plug at their end. */
  dropBottom: onBar(BAR.topsSweep + BAR.bendRadius, -BAR.drop),
  dropEnd: onBar(BAR.dropEnd, -BAR.drop + 0.012),
} as const;

export const distance = (a: Point, b: Point): number => Math.hypot(a.y - b.y, a.z - b.z);
