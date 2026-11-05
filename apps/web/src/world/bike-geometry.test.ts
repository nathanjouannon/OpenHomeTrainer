import { describe, expect, it } from 'vitest';
import {
  BB_DROP,
  BB_HEIGHT,
  BOTTOM_BRACKET,
  CHAINSTAY,
  COCKPIT,
  CRANK_LENGTH,
  distance,
  FRAME,
  FRONT_AXLE,
  REAR_AXLE,
  RIM_INNER_RADIUS,
  RIM_OUTER_RADIUS,
  SADDLE,
  SADDLE_DISTANCE,
  SADDLE_TOP,
  WHEEL_RADIUS,
  WHEELBASE,
} from './bike-geometry';

describe('measured dimensions', () => {
  it('has the measured wheelbase, chainstay and bottom bracket height', () => {
    expect(FRONT_AXLE.z - REAR_AXLE.z).toBeCloseTo(WHEELBASE, 9);
    expect(distance(REAR_AXLE, BOTTOM_BRACKET)).toBeCloseTo(CHAINSTAY, 9);
    expect(BOTTOM_BRACKET.y).toBe(BB_HEIGHT);
    expect(BB_DROP).toBeCloseTo(WHEEL_RADIUS - BB_HEIGHT, 9);
  });

  it('puts the top of the saddle 74 cm from the bottom bracket, behind it', () => {
    expect(distance(BOTTOM_BRACKET, SADDLE_TOP)).toBeCloseTo(SADDLE_DISTANCE, 9);
    expect(SADDLE_TOP.z).toBeLessThan(BOTTOM_BRACKET.z);
  });

  it('keeps the pedals above the ground at the bottom of the stroke', () => {
    expect(BOTTOM_BRACKET.y - CRANK_LENGTH).toBeGreaterThan(0.08);
  });

  it('has a deep rim of 65 mm inside the tyre', () => {
    expect(RIM_OUTER_RADIUS - RIM_INNER_RADIUS).toBeCloseTo(0.065, 9);
    expect(RIM_OUTER_RADIUS).toBeLessThan(WHEEL_RADIUS);
  });
});

describe('points read on the photo', () => {
  it('stay between the wheels, except the hoods that overhang the front axle', () => {
    for (const q of [SADDLE.tail, SADDLE.nose, FRAME.seatCluster, FRAME.headTubeBottom]) {
      expect(q.z).toBeGreaterThan(REAR_AXLE.z);
      expect(q.z).toBeLessThan(FRONT_AXLE.z);
    }
    expect(COCKPIT.hoodTip.z).toBeGreaterThan(FRONT_AXLE.z - 0.1);
    expect(COCKPIT.hoodTip.z).toBeLessThan(FRONT_AXLE.z + 0.25);
  });

  it('lays out the cockpit from the stem to the lever', () => {
    expect(COCKPIT.barCenter.z).toBeLessThan(COCKPIT.hoodTop.z);
    expect(COCKPIT.hoodTop.z).toBeLessThan(COCKPIT.hoodTip.z);
    expect(COCKPIT.dropBottom.y).toBeLessThan(COCKPIT.hoodTop.y);
    expect(COCKPIT.leverBottom.y).toBeLessThan(COCKPIT.hoodTop.y);
  });

  it('puts the bars a few centimetres under the saddle', () => {
    const drop = SADDLE_TOP.y - COCKPIT.hoodTop.y;
    expect(drop).toBeGreaterThan(0.03);
    expect(drop).toBeLessThan(0.12);
  });
});
