// Free camera (dev mode): drag to look, ZQSD/WASD or arrows to move, Space / Shift
// to go up / down, wheel to change the speed. Reports its pose a few times a second.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { type PerspectiveCamera, Vector3 } from 'three';
import {
  type CameraPose,
  clampPitch,
  clampSpeed,
  directionToAngles,
  FREE_CAMERA_CODES,
  FREE_CAMERA_FOV,
  FREE_SPEED_DEFAULT_MS,
  moveKeysFromCodes,
  movePose,
  sceneToWorld,
  viewDirection,
  worldToScene,
  wrapYaw,
} from './free-camera';
import { POV_HIDDEN_LAYER, POV_ONLY_LAYER } from './Rider';

const LOOK_DEG_PER_PX = 0.2;
const REPORT_EVERY_S = 0.2;

export interface FreeCameraProps {
  /** Where to start; null: where the current camera is. */
  start: CameraPose | null;
  /** Scene base altitude (world z of the scene's y = 0). */
  base: number;
  onPose: (pose: CameraPose, speedMs: number) => void;
}

export function FreeCamera({ start, base, onPose }: FreeCameraProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const dom = useThree((s) => s.gl.domElement);
  const pose = useRef<CameraPose | null>(null);
  const speed = useRef(FREE_SPEED_DEFAULT_MS);
  const down = useRef(new Set<string>());
  const sinceReport = useRef(REPORT_EVERY_S);
  const onPoseRef = useRef(onPose);
  onPoseRef.current = onPose;

  // Initial pose: asked for, or the current view.
  if (!pose.current) {
    if (start) pose.current = start;
    else {
      const w = sceneToWorld(camera.position.x, camera.position.y, camera.position.z, base);
      pose.current = { ...w, ...directionToAngles(camera.getWorldDirection(new Vector3())) };
    }
  }

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    camera.layers.enable(POV_HIDDEN_LAYER);
    camera.layers.disable(POV_ONLY_LAYER);
    camera.fov = FREE_CAMERA_FOV;
    camera.updateProjectionMatrix();
    const keys = down.current;
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
    };
    // Capture phase: the ride shortcuts (A/Z/Q/S shift gears, Space pauses) must not see these keys.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e) || !FREE_CAMERA_CODES.includes(e.code)) {
        return;
      }
      keys.add(e.code);
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (keys.delete(e.code)) e.stopImmediatePropagation();
    };
    const onBlur = () => keys.clear();
    let dragging = false;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      dom.setPointerCapture(e.pointerId);
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const p = pose.current;
      if (!dragging || !p) return;
      p.yawDeg = wrapYaw(p.yawDeg + e.movementX * LOOK_DEG_PER_PX);
      p.pitchDeg = clampPitch(p.pitchDeg - e.movementY * LOOK_DEG_PER_PX);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      speed.current = clampSpeed(speed.current * (e.deltaY < 0 ? 1.25 : 0.8));
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('wheel', onWheel);
      keys.clear();
      camera.rotation.order = 'XYZ';
    };
  }, [camera, dom]);

  useFrame((_, delta) => {
    const p0 = pose.current;
    if (!p0) return;
    const p = movePose(p0, moveKeysFromCodes(down.current), speed.current, Math.min(delta, 0.1));
    pose.current = p;
    const s = worldToScene(p, base);
    camera.position.set(s.x, s.y, s.z);
    const d = viewDirection(p.yawDeg, p.pitchDeg);
    camera.lookAt(s.x + d.x, s.y + d.y, s.z + d.z);
    sinceReport.current += delta;
    if (sinceReport.current >= REPORT_EVERY_S) {
      sinceReport.current = 0;
      onPoseRef.current({ ...p }, speed.current);
    }
  });
  return null;
}
