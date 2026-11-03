import { Euler, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { environmentRotationY, SUN_POSITION } from './Lighting';

describe('environmentRotationY', () => {
  it('turns the sun of the environment map towards the scene sun', () => {
    const mapAzimuth = 0.63;
    const theta = environmentRotationY(mapAzimuth);
    // What node materials do: sample the map at transpose(R) · direction.
    const lookup = new Matrix4().makeRotationFromEuler(new Euler(0, theta, 0)).transpose();
    const d = SUN_POSITION.clone().setY(0).normalize().applyMatrix4(lookup);
    const expected = new Vector3(Math.cos(mapAzimuth), 0, Math.sin(mapAzimuth));
    expect(d.distanceTo(expected)).toBeLessThan(1e-9);
  });
});
