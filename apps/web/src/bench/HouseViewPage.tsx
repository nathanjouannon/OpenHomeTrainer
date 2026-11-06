// Work page of the buildings (lot 2.16, `#/houses`): every style on a lawn,
// plain-land houses on the first row, chalets and barns behind, with and
// without garden. Developer tool, not linked from the app.

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { buildBuildings, createBuildingMaterials } from '../world/building-builders';
import {
  type BuildingStyle,
  CHALET_STYLES,
  PLAIN_STYLES,
  STYLE_DIMS,
} from '../world/building-styles';
import type { Building } from '../world/settlements';

const SPACING = 26;

function layout(): Building[] {
  const rows: BuildingStyle[][] = [[...PLAIN_STYLES], [...CHALET_STYLES, 'barn', 'barn-alpine']];
  const out: Building[] = [];
  for (const [r, row] of rows.entries()) {
    for (const [i, style] of row.entries()) {
      const d = STYLE_DIMS[style];
      const mid = (x: readonly [number, number]) => (x[0] + x[1]) / 2;
      out.push({
        x: (i - (row.length - 1) / 2) * SPACING,
        y: -r * SPACING,
        z: 0.2,
        groundM: 0,
        yaw: 0,
        width: mid(d.width),
        depth: mid(d.depth),
        wallHeight: mid(d.wallHeight),
        roofHeight: mid(d.roofHeight),
        kind: style.startsWith('barn') ? 'barn' : 'house',
        style,
        wallTint: (i * 3 + r) % 8,
        roofTint: i % 4,
        lot: style.startsWith('barn')
          ? undefined
          : {
              fence: (['hedge', 'picket', 'wall'] as const)[i % 3] ?? 'hedge',
              frontM: 4.2,
              gate: true,
              gravel: true,
              roadZ: 0.14,
              groundM: 0,
            },
      });
    }
  }
  return out;
}

export default function HouseViewPage() {
  const geo = useMemo(() => buildBuildings(layout(), 0), []);
  const mats = useMemo(() => createBuildingMaterials(), []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#9ab8d6' }}>
      <Canvas camera={{ position: [0, 22, 50], fov: 45, near: 0.5, far: 600 }} shadows>
        <hemisphereLight args={['#dbe8ff', '#6b7a52', 1.1]} />
        <directionalLight position={[40, 60, 30]} intensity={2.2} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#6f8f4a" />
        </mesh>
        {(Object.keys(geo) as (keyof typeof geo)[]).map((k) => (
          <mesh key={k} geometry={geo[k]} material={mats[k]} castShadow receiveShadow />
        ))}
        <OrbitControls target={[0, 3, -SPACING / 2]} />
      </Canvas>
    </div>
  );
}
