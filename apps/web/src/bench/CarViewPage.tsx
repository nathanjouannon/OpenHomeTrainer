// Work page of the cars (lot 2.17, `#/cars`): one car or all of them on a
// lawn, seen in three quarters (like the owner's photos), from the side, the
// front, the back or the top. `?model=clio|all&view=three-quarters|side|front|back|top
// &logos=0&color=%23b3261e&photo=1`. With `photo=1` the owner's photo (not
// versioned: `public/references/voitures/`, see the .gitignore) is shown beside
// the model. Developer tool, not linked from the app.

import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { useLocation } from '../router';
import { buildCar } from '../world/car-builders';
import { CAR_SPECS } from '../world/car-geometry';

const VIEWS: Record<string, [number, number, number]> = {
  'three-quarters': [0.6, 0.0, 0.8],
  side: [1, 0.12, 0],
  front: [0, 0.15, 1],
  back: [0, 0.15, -1],
  top: [0.001, 1, 0.001],
};

/** Number of the owner's photo of each model (`public/references/voitures/NN.jpg`). */
const PHOTOS: Record<string, number> = {
  clio: 1,
  '208': 2,
  '500': 3,
  golf: 4,
  polo: 5,
  focus: 6,
  octavia: 7,
  passat: 8,
  duster: 9,
  scenic: 10,
  tiguan: 11,
  defender: 12,
  hilux: 13,
  berlingo: 14,
};

export default function CarViewPage() {
  const { query } = useLocation();
  const which = query.get('model') ?? 'all';
  const view =
    VIEWS[query.get('view') ?? 'three-quarters'] ??
    (VIEWS['three-quarters'] as [number, number, number]);
  const logos = query.get('logos') !== '0';
  const color = query.get('color');
  const photo = query.has('photo');
  const specs = which === 'all' ? CAR_SPECS : CAR_SPECS.filter((s) => s.id === which);
  const cars = useMemo(
    () => specs.map((s) => ({ spec: s, geometry: buildCar(s.id, { logos }) })),
    [specs, logos],
  );
  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 }),
    [],
  );
  const palette = [
    '#f2f2f2',
    '#1d1f22',
    '#9aa0a6',
    '#b3261e',
    '#1f4e8c',
    '#2f6b3a',
    '#c9b48a',
    '#5a6470',
  ];
  const cols = Math.ceil(Math.sqrt(cars.length));
  const dist = which === 'all' ? 8 + cols * 6 : 11;
  const single = cars.length === 1;
  const index = PHOTOS[which] ?? 0;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#9ab8d6', display: 'flex' }}>
      {photo && single && (
        <img
          alt=""
          src={`/references/voitures/${String(index).padStart(2, '0')}.jpg`}
          style={{ width: '50%', objectFit: 'contain', background: '#222' }}
        />
      )}
      <div style={{ flex: 1, position: 'relative' }}>
        <Canvas shadows gl={{ preserveDrawingBuffer: true }}>
          <PerspectiveCamera
            makeDefault
            fov={single ? 28 : 40}
            near={0.2}
            far={400}
            position={[view[0] * dist, view[1] * dist + 1.3, view[2] * dist]}
          />
          <hemisphereLight args={['#dbe8ff', '#6b7a52', 1.2]} />
          <directionalLight position={[-12, 20, 14]} intensity={2.4} castShadow />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[400, 400]} />
            <meshStandardMaterial color="#6e7378" />
          </mesh>
          {cars.map(({ spec, geometry }, i) => {
            const x = (i % cols) * 6 - ((cols - 1) * 6) / 2;
            const z = Math.floor(i / cols) * 7 - ((Math.ceil(cars.length / cols) - 1) * 7) / 2;
            return (
              <group key={spec.id} position={single ? [0, 0, 0] : [x, 0, z]}>
                <mesh
                  geometry={geometry}
                  castShadow
                  receiveShadow
                  material={material.clone()}
                  onUpdate={(m) => {
                    const mat = m.material as MeshStandardMaterial;
                    mat.color.set(color ?? palette[i % palette.length] ?? '#fff');
                  }}
                />
              </group>
            );
          })}
          <OrbitControls target={[0, 0.7, 0]} />
        </Canvas>
      </div>
    </div>
  );
}
