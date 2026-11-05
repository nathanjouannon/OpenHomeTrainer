// Work page of the bike (lot 2.12, `#/bike`): the bike alone, seen from the
// side, the front, the back, the top or in three quarters, with the owner's
// photo behind it (not versioned: `public/references/velo/`, see the .gitignore)
// to compare the proportions. Developer tool, not linked from the app.

import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Group,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
  TextureLoader,
} from 'three';
import { loadAvatar, loadEnvironmentMap } from '../world/assets';
import { type Bike, buildBike } from '../world/bike-builder';
import { createWorldRenderer } from '../world/renderer';
import { AvatarRig } from '../world/rider-avatar';

type ViewId = 'side' | 'front' | 'back' | 'top' | 'pov' | 'three-quarters';

interface ViewSpec {
  label: string;
  photo?: string;
  /** Camera position and target (world), up vector, height (m) of the visible area. */
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  height: number;
  /** Perspective camera (field of view in degrees) instead of the orthographic one. */
  fov?: number;
  /** Photo: size of a pixel (m), and the offset of its centre in the view (m). */
  photoScale: number;
  photoOffset: [number, number];
}

const SIDE_SCALE = 1 / 1149.2;
const VIEWS: Record<ViewId, ViewSpec> = {
  // Anchors on the photo: rear axle (457, 1041) and front axle (1606, 1062).
  side: {
    label: 'Côté',
    photo: 'side.jpg',
    position: [-6, 0.55, 0],
    target: [0, 0.55, 0],
    up: [0, 1, 0],
    height: 1.45,
    photoScale: SIDE_SCALE,
    photoOffset: [-0.0275, 0.043],
  },
  front: {
    label: 'Face',
    photo: 'front.jpg',
    position: [0, 0.55, 6],
    target: [0, 0.55, 0],
    up: [0, 1, 0],
    height: 1.45,
    photoScale: 0.00085,
    photoOffset: [0.02, 0.1],
  },
  back: {
    label: 'Arrière',
    photo: 'back.jpg',
    position: [0, 0.55, -6],
    target: [0, 0.55, 0],
    up: [0, 1, 0],
    height: 1.45,
    photoScale: 0.00085,
    photoOffset: [0, 0.1],
  },
  top: {
    label: 'Dessus',
    photo: 'top.jpg',
    position: [0, 6, 0.3],
    target: [0, 0, 0.3],
    up: [0, 0, 1],
    height: 1.45,
    photoScale: 0.0006,
    photoOffset: [0, 0.2],
  },
  // The eyes of the rider, looking at the road through the bars.
  pov: {
    label: 'POV',
    position: [0, 1.33, 0.3],
    target: [0, 0.4, 1.6],
    up: [0, 1, 0],
    height: 1.45,
    fov: 80,
    photoScale: 0.001,
    photoOffset: [0, 0],
  },
  'three-quarters': {
    label: '3/4',
    position: [-1.9, 1.1, 1.7],
    target: [0, 0.55, 0.05],
    up: [0, 1, 0],
    height: 1.45,
    fov: 32,
    photoScale: 0.001,
    photoOffset: [0, 0],
  },
};

const PHOTO_BASE = '/references/velo/';

/** The HDRI of the world (when downloaded), for the reflections. */
function Environment() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    let alive = true;
    loadEnvironmentMap().then((env) => {
      if (alive && env) scene.environment = env.texture;
    });
    return () => {
      alive = false;
      scene.environment = null;
    };
  }, [scene]);
  return null;
}

function setWireframe(root: Object3D, on: boolean) {
  root.traverse((o) => {
    const m = (o as Mesh).material as Material | Material[] | undefined;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      (mat as Material & { wireframe?: boolean }).wireframe = on;
    }
  });
}

function BikeModel({
  pedalling,
  wireframe,
  avatar,
}: {
  pedalling: boolean;
  wireframe: boolean;
  avatar: Object3D | null;
}) {
  const bike = useMemo<Bike>(() => buildBike(), []);
  const rig = useMemo(
    () => (avatar ? new AvatarRig(avatar, { jersey: '#e4572e' }) : null),
    [avatar],
  );
  // Crank at the angle of the photo (the right pedal backwards, level with the bottom bracket).
  const state = useRef({ crank: -1.6, wheel: 0 });
  useEffect(() => () => bike.dispose(), [bike]);
  useEffect(() => () => rig?.dispose(), [rig]);
  useEffect(() => setWireframe(bike.root, wireframe), [bike, wireframe]);
  useEffect(() => {
    bike.setPose(state.current.crank, state.current.wheel);
    rig?.pose(state.current.crank, 0);
  }, [bike, rig]);
  useFrame((_, dt) => {
    if (!pedalling) return;
    state.current.crank += (88 / 60) * Math.PI * 2 * dt;
    state.current.wheel += (9 / 0.34) * dt;
    bike.setPose(state.current.crank, state.current.wheel);
    rig?.pose(state.current.crank, 0);
  });
  return (
    <group>
      <primitive object={bike.root} />
      {rig && <primitive object={rig.root} />}
    </group>
  );
}

function Photo({
  url,
  opacity,
  scale,
  offset,
}: {
  url: string;
  opacity: number;
  scale: number;
  offset: [number, number];
}) {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    let alive = true;
    new TextureLoader().load(url, (t) => alive && setTexture(t));
    return () => {
      alive = false;
    };
  }, [url]);
  const image = texture?.image as { width: number; height: number } | undefined;
  if (!texture || !image) return null;
  return (
    <mesh
      position={[offset[0], offset[1], -40]}
      scale={[image.width * scale, image.height * scale, 1]}
      renderOrder={-10}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function ViewCamera({
  spec,
  photo,
  opacity,
  scale,
  offset,
}: {
  spec: ViewSpec;
  photo: boolean;
  opacity: number;
  scale: number;
  offset: [number, number];
}) {
  const size = useThree((s) => s.size);
  const group = useRef<Group>(null);
  const fov = spec.fov;
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.up.set(...spec.up);
    camera.position.set(...spec.position);
    camera.lookAt(...spec.target);
    camera.updateProjectionMatrix();
  }, [camera, spec]);
  if (fov) {
    return (
      <>
        <PerspectiveCamera makeDefault position={spec.position} fov={fov} near={0.05} far={50} />
        <OrbitControls target={spec.target} enableDamping />
      </>
    );
  }
  return (
    <OrthographicCamera
      makeDefault
      position={spec.position}
      up={spec.up}
      zoom={size.height / spec.height}
      near={0.1}
      far={100}
      onUpdate={(c) => c.lookAt(...spec.target)}
    >
      <group ref={group}>
        {photo && spec.photo && (
          <Photo url={PHOTO_BASE + spec.photo} opacity={opacity} scale={scale} offset={offset} />
        )}
      </group>
    </OrthographicCamera>
  );
}

export default function BikeViewPage() {
  const query = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const initial = (query.get('view') as ViewId) in VIEWS ? (query.get('view') as ViewId) : 'side';
  const [view, setView] = useState<ViewId>(initial);
  const spec = VIEWS[view];
  const [opacity, setOpacity] = useState(Number(query.get('photo') ?? 0.5));
  const [wireframe, setWireframe] = useState(query.has('wire'));
  const [pedalling, setPedalling] = useState(false);
  const [showPhoto, setShowPhoto] = useState(!query.has('nophoto'));
  const [withRider, setWithRider] = useState(query.has('rider'));
  const [adjust, setAdjust] = useState({ scale: 1, dx: 0, dy: 0 });
  const [avatar, setAvatar] = useState<Object3D | null>(null);

  useEffect(() => {
    if (!withRider || avatar) return;
    let alive = true;
    loadAvatar().then((o) => alive && setAvatar(o));
    return () => {
      alive = false;
    };
  }, [withRider, avatar]);

  const row = { display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 } as const;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#8a8f96' }}>
      <Canvas
        key={view}
        gl={(defaults) =>
          createWorldRenderer(defaults.canvas as HTMLCanvasElement, {
            antialias: true,
            preference: query.get('renderer') === 'webgl2' ? 'webgl2' : 'auto',
          })
        }
        onCreated={({ gl }) => gl.setClearColor('#8a8f96')}
      >
        <Environment />
        <ambientLight intensity={0.35} />
        <directionalLight position={[-3, 5, 2]} intensity={1.6} />
        <ViewCamera
          spec={spec}
          photo={showPhoto}
          opacity={opacity}
          scale={spec.photoScale * adjust.scale}
          offset={[spec.photoOffset[0] + adjust.dx, spec.photoOffset[1] + adjust.dy]}
        />
        <BikeModel pedalling={pedalling} wireframe={wireframe} avatar={withRider ? avatar : null} />
      </Canvas>
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          padding: 10,
          borderRadius: 8,
          background: 'rgba(20,22,26,.78)',
          color: '#eee',
          font: '13px system-ui',
          width: 270,
        }}
      >
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(Object.keys(VIEWS) as ViewId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setView(id);
                setAdjust({ scale: 1, dx: 0, dy: 0 });
              }}
              style={{ fontWeight: id === view ? 700 : 400 }}
            >
              {VIEWS[id].label}
            </button>
          ))}
        </div>
        <label style={row}>
          <input
            type="checkbox"
            checked={showPhoto}
            onChange={(e) => setShowPhoto(e.target.checked)}
          />
          Photo
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
          />
        </label>
        <label style={row}>
          Échelle
          <input
            type="range"
            min={0.7}
            max={1.4}
            step={0.005}
            value={adjust.scale}
            onChange={(e) => setAdjust({ ...adjust, scale: Number(e.target.value) })}
          />
        </label>
        <label style={row}>
          Décalage x
          <input
            type="range"
            min={-0.5}
            max={0.5}
            step={0.005}
            value={adjust.dx}
            onChange={(e) => setAdjust({ ...adjust, dx: Number(e.target.value) })}
          />
        </label>
        <label style={row}>
          Décalage y
          <input
            type="range"
            min={-0.5}
            max={0.5}
            step={0.005}
            value={adjust.dy}
            onChange={(e) => setAdjust({ ...adjust, dy: Number(e.target.value) })}
          />
        </label>
        <label style={row}>
          <input
            type="checkbox"
            checked={wireframe}
            onChange={(e) => setWireframe(e.target.checked)}
          />
          Fil de fer
        </label>
        <label style={row}>
          <input
            type="checkbox"
            checked={pedalling}
            onChange={(e) => setPedalling(e.target.checked)}
          />
          Pédaler
        </label>
        <label style={row}>
          <input
            type="checkbox"
            checked={withRider}
            onChange={(e) => setWithRider(e.target.checked)}
          />
          Cycliste
        </label>
      </div>
    </div>
  );
}
