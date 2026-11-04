// Geometries of the roadside modules (lot 2.5): guardrail, field fence and
// low stone wall. A module runs along local +Z from 0 to its nominal length
// (MODULES in roadside.ts), +X towards the road, +Y up from the base; its
// instance matrix stretches it to the run (see runMatrices).

import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MODULES } from './roadside';

function paint(g: BufferGeometry, hex: string): BufferGeometry {
  const geometry = g.index ? g.toNonIndexed() : g;
  const c = new Color(hex);
  const n = geometry.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

const merge = (parts: BufferGeometry[]) => {
  const g = mergeGeometries(parts);
  if (!g) throw new Error('Could not merge geometries');
  g.computeBoundingSphere();
  return g;
};

/** Open profile (x, y) extruded along Z from z0 to z1 (seen from both sides). */
function extrude(profile: readonly [number, number][], z0: number, z1: number): BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [x0, y0] = profile[i] as [number, number];
    const [x1, y1] = profile[i + 1] as [number, number];
    // Wound so that the front faces +X (the road).
    pos.push(x0, y0, z0, x1, y1, z0, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y0, z1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * French W-beam guardrail on a sigma post, with its spacer. The beam faces
 * the road (+X); the post stands at z = 0, the next module brings the next.
 */
export function guardrailGeometry(): BufferGeometry {
  const L = MODULES.guardrail.lengthM;
  // Cross-section of the beam: two ridges, 31 cm high, top at 0.74 m.
  const beam: [number, number][] = [
    [0.17, 0.43],
    [0.23, 0.475],
    [0.23, 0.53],
    [0.185, 0.585],
    [0.23, 0.64],
    [0.23, 0.695],
    [0.17, 0.74],
  ];
  return merge([
    paint(extrude(beam, -0.03, L + 0.03), '#a9aeb2'),
    paint(new BoxGeometry(0.1, 1.05, 0.055).translate(0, 0.2, 0), '#9a9fa3'),
    paint(new BoxGeometry(0.15, 0.2, 0.05).translate(0.1, 0.585, 0), '#8f9498'),
  ]);
}

/** Post-and-rail wooden fence: a post at z = 0 and two rails to the next one. */
export function fenceGeometry(): BufferGeometry {
  const L = MODULES.fence.lengthM;
  return merge([
    paint(new CylinderGeometry(0.055, 0.065, 1.35, 6).translate(0, 0.55, 0), '#76674f'),
    paint(new BoxGeometry(0.035, 0.1, L + 0.08).translate(0.07, 0.5, L / 2), '#8a7a62'),
    paint(new BoxGeometry(0.035, 0.1, L + 0.08).translate(0.07, 0.98, L / 2), '#8a7a62'),
  ]);
}

/**
 * Low masonry wall (parapet), 0.45 m thick, about 0.8 m above the base and
 * sunk 0.45 m into the ground, with a slightly wider coping. The modules
 * overlap a little so that no gap opens on the outside of the bends.
 */
export function wallGeometry(): BufferGeometry {
  const L = MODULES.wall.lengthM + 0.16;
  return merge([
    paint(new BoxGeometry(0.45, 1.2, L).translate(0, 0.15, L / 2 - 0.08), '#ffffff'),
    paint(new BoxGeometry(0.52, 0.09, L).translate(0, 0.79, L / 2 - 0.08), '#d9d4cb'),
  ]);
}
