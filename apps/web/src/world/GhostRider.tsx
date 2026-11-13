// The ghost of lot 3.6: a translucent blue cyclist and bike, cheap (a handful
// of meshes, no shadows) and placed every frame by `Scene` like the rider.
// Local frame: +Z forward, +Y up, +X to the left.

import { forwardRef, useLayoutEffect, useMemo } from 'react';
import {
  CapsuleGeometry,
  CylinderGeometry,
  type Group,
  MeshBasicMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { WHEEL_R } from './rider-geometry';

const COLOR = '#6cc5ff';
const OPACITY = 0.5;

export const GhostRider = forwardRef<Group>(function GhostRider(_props, ref) {
  const parts = useMemo(
    () => ({
      material: new MeshBasicMaterial({
        color: COLOR,
        transparent: true,
        opacity: OPACITY,
        depthWrite: false,
      }),
      wheel: new TorusGeometry(WHEEL_R, 0.025, 6, 20).rotateY(Math.PI / 2),
      tube: new CylinderGeometry(0.02, 0.02, 1, 6),
      torso: new CapsuleGeometry(0.13, 0.5, 3, 8),
      leg: new CapsuleGeometry(0.06, 0.55, 2, 6),
      head: new SphereGeometry(0.11, 10, 8),
    }),
    [],
  );
  useLayoutEffect(
    () => () => {
      for (const v of Object.values(parts)) v.dispose();
    },
    [parts],
  );
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={parts.wheel} material={parts.material} position={[0, WHEEL_R, 0.5]} />
      <mesh geometry={parts.wheel} material={parts.material} position={[0, WHEEL_R, -0.5]} />
      <mesh
        geometry={parts.tube}
        material={parts.material}
        position={[0, WHEEL_R + 0.2, 0]}
        rotation={[Math.PI / 2 - 0.1, 0, 0]}
        scale={[1, 1.0, 1]}
      />
      <mesh
        geometry={parts.leg}
        material={parts.material}
        position={[0, 0.62, -0.08]}
        rotation={[0.25, 0, 0]}
      />
      <mesh
        geometry={parts.torso}
        material={parts.material}
        position={[0, 1.2, 0.12]}
        rotation={[1.0, 0, 0]}
      />
      <mesh geometry={parts.head} material={parts.material} position={[0, 1.42, 0.45]} />
    </group>
  );
});
