// Road helmet of the rigged rider (lot 2.10). A sphere reshaped into what a
// cyclist wears: close to the head (no mushroom brim), teardrop-shaped, long
// and tapering at the back, the rim higher on the forehead than at the nape,
// with the vents painted in vertex colours. Head frame: +Y up, +Z forward, the
// origin at the middle of the head.

import { BufferAttribute, type BufferGeometry, Color, SphereGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Half-width and height of the shell, depth in front of and behind the origin (m). */
export const HELMET = { rx: 0.1, ry: 0.158, rzFront: 0.125, rzBack: 0.185 } as const;
/** How much the rim rises at the front and drops at the back (m). */
const TILT = 0.05;
/** How far (unit sphere) the shell goes below the equator before the rim. */
const BELOW_EQUATOR = 0.1;
/** Vents: x of the three channels, half-width, and range along z and above the rim (m). */
const VENTS = { x: [-0.042, 0, 0.042], halfWidth: 0.009, z: [-0.13, 0.085], minY: 0.045 } as const;

export function buildHelmetGeometry(shell = '#f2f2f0', vent = '#2b2d31'): BufferGeometry {
  const sphere = new SphereGeometry(
    1,
    64,
    32,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2 + Math.asin(BELOW_EQUATOR),
  );
  // Welded first: the seam of the sphere would give two normals to one vertex.
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  const geometry = mergeVertices(sphere, 1e-5);
  sphere.dispose();

  const position = geometry.getAttribute('position');
  const u = new Vector3();
  for (let i = 0; i < position.count; i++) {
    u.fromBufferAttribute(position, i);
    const back = Math.max(0, -u.z);
    // Taper and lower the tail.
    const narrow = 1 - 0.3 * back * back;
    const x = u.x * HELMET.rx * narrow;
    const z = u.z * (u.z > 0 ? HELMET.rzFront : HELMET.rzBack);
    const height = (1 - 0.22 * back * back) * u.y * HELMET.ry * narrow;
    // The rim follows the brow: up at the front, down over the nape.
    const tilt = TILT * u.z * (1 - Math.max(0, u.y));
    position.setXYZ(i, x, height + tilt, z);
  }
  geometry.computeVertexNormals();

  const colours = new Float32Array(position.count * 3);
  const shellColour = new Color(shell);
  const ventColour = new Color(vent);
  const p = new Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const vented =
      p.y > VENTS.minY &&
      p.z > VENTS.z[0] &&
      p.z < VENTS.z[1] &&
      VENTS.x.some((x) => Math.abs(p.x - x) < VENTS.halfWidth);
    (vented ? ventColour : shellColour).toArray(colours, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  return geometry;
}
