// Frame counting, freezing and measurement for the comparison bench.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { type Object3D, Vector2 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { FrameStats } from '../world/frame-stats';
import { estimateGpuMemory } from '../world/gpu-memory';
import { sceneRenderTargets } from '../world/render-targets';
import { asWorldRenderer, frameInfo, gpuName, rendererBackend } from '../world/renderer';
import type { BenchClock } from '../world/world-clock';
import type { BenchEnvironment, BenchMetrics, BenchQuality } from './protocol';

/** Frames rendered before a capture: shaders compiled, cameras and animations settled. */
export const WARMUP_FRAMES = 120;
/** Frames rendered once frozen, so that the frozen image is on screen. */
const SETTLE_FRAMES = 3;

export interface Shot {
  key: string;
  viewpointId: string;
  quality: BenchQuality;
  clock: BenchClock;
}

interface Attached {
  key: string;
  gl: WebGPURenderer;
  scene: Object3D;
}

const MB = 1024 * 1024;
const round = (x: number, digits = 1) => Math.round(x * 10 ** digits) / 10 ** digits;

export class BenchProbe {
  private shot: Shot | null = null;
  private attached: Attached | null = null;
  private frameCount = 0;
  private waiting: { resolve: () => void; reject: (e: Error) => void } | null = null;
  /** Draw calls and triangles of the frozen frame: they do not depend on the frame rate. */
  private frozenInfo = { calls: 0, triangles: 0 };
  readonly stats = new FrameStats();

  /** Starts a new shot; resolves when its frozen frame is on screen. */
  start(shot: Shot): Promise<void> {
    this.waiting?.reject(new Error('Shot replaced before it was ready'));
    this.shot = shot;
    this.frameCount = 0;
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject };
    });
  }

  attach(a: Attached): void {
    this.attached = a;
  }

  detach(key: string): void {
    if (this.attached?.key === key) this.attached = null;
  }

  frame(key: string, deltaS: number, info: { calls: number; triangles: number }): void {
    const shot = this.shot;
    if (!shot || shot.key !== key) return;
    this.stats.record(deltaS, info);
    this.frameCount++;
    if (this.frameCount === WARMUP_FRAMES) shot.clock.mode = 'frozen';
    if (this.frameCount === WARMUP_FRAMES + SETTLE_FRAMES) {
      // `info` describes the previous frame, already frozen.
      this.frozenInfo = { calls: info.calls, triangles: info.triangles };
      this.waiting?.resolve();
      this.waiting = null;
    }
  }

  async measure(durationS: number): Promise<BenchMetrics> {
    const shot = this.shot;
    const a = this.attached;
    if (!shot || !a || a.key !== shot.key) throw new Error('No viewpoint shown');
    shot.clock.mode = 'real';
    this.stats.reset();
    await new Promise((resolve) => setTimeout(resolve, durationS * 1000));
    shot.clock.mode = 'frozen';
    const s = this.stats.snapshot();
    const size = a.gl.getDrawingBufferSize(new Vector2());
    const mem = estimateGpuMemory(
      a.scene,
      {
        width: size.x,
        height: size.y,
        antialias: a.gl.samples > 0,
        halfFloatOutput: true,
      },
      sceneRenderTargets(a.scene),
    );
    const info = a.gl.info;
    return {
      viewpoint: shot.viewpointId,
      quality: shot.quality,
      durationS: round(s.durationS, 2),
      frames: s.frames,
      avgFps: round(s.avgFps),
      low1Fps: round(s.low1Fps),
      avgFrameMs: s.avgFps ? round(1000 / s.avgFps, 2) : 0,
      p99FrameMs: s.low1Fps ? round(1000 / s.low1Fps, 2) : 0,
      drawCalls: this.frozenInfo.calls,
      triangles: this.frozenInfo.triangles,
      gpuMemoryMB: {
        geometry: round(mem.geometryBytes / MB),
        textures: round(mem.textureBytes / MB),
        targets: round(mem.targetBytes / MB),
        total: round(mem.totalBytes / MB),
      },
      renderer: {
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.memory.programs,
      },
      canvas: { width: size.x, height: size.y },
    };
  }

  environment(): BenchEnvironment {
    const a = this.attached;
    if (!a) throw new Error('No viewpoint shown');
    return {
      userAgent: navigator.userAgent,
      gpu: gpuName(a.gl),
      backend: rendererBackend(a.gl),
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }
}

/** Rendered inside the canvas of a shot: feeds the probe with every frame. */
export function BenchProbeHook({ probe, shotKey }: { probe: BenchProbe; shotKey: string }) {
  const gl = asWorldRenderer(useThree((s) => s.gl));
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    probe.attach({ key: shotKey, gl, scene });
    return () => probe.detach(shotKey);
  }, [probe, shotKey, gl, scene]);
  useFrame((state, delta) => probe.frame(shotKey, delta, frameInfo(state.gl)));
  return null;
}
