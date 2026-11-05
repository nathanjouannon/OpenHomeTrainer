// POV camera (eyes of the rider). APPROVED BY THE OWNER on 2026-11-05: do not
// change these values unless they ask for it (`pov-camera.test.ts` pins them).
// The view also follows the rider's head, so moving the saddle position
// (`SEAT` in `rider-geometry.ts`) or the bars (`STEM`, `BAR` in
// `bike-geometry.ts`) changes what is seen.

import { Vector3 } from 'three';

/** Procedural rider: eyes in the bike frame (no avatar), looking down at the hoods. */
export const POV_EYE = new Vector3(0, 1.43, 0.06);
export const POV_PITCH = -0.36;
export const POV_FOV = 80;

/** glTF avatar: the eyes are the real ones (`EYE_OFFSET` from the head bone). */
export const POV_PITCH_AVATAR = -0.55;
/** Vertical field of view (degrees), wide like a phone's 0.5× lens. */
export const POV_FOV_AVATAR = 110;
/** Rest position of the eyes from the head bone: above it, and ahead of it. */
export const EYE_OFFSET = new Vector3(0, 0.105, 0.06);
