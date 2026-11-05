import { describe, expect, it } from 'vitest';
import {
  EYE_OFFSET,
  POV_EYE,
  POV_FOV,
  POV_FOV_AVATAR,
  POV_PITCH,
  POV_PITCH_AVATAR,
} from './pov-camera';

// The owner approved this POV on 2026-11-05. If this test fails, the view has
// changed: put the values back, unless the owner asked for the change.
describe('POV camera (approved)', () => {
  it('keeps the avatar view', () => {
    expect(POV_PITCH_AVATAR).toBe(-0.55);
    expect(POV_FOV_AVATAR).toBe(110);
    expect(EYE_OFFSET.toArray()).toEqual([0, 0.105, 0.06]);
  });

  it('keeps the procedural rider view', () => {
    expect(POV_EYE.toArray()).toEqual([0, 1.43, 0.06]);
    expect(POV_PITCH).toBe(-0.36);
    expect(POV_FOV).toBe(80);
  });
});
