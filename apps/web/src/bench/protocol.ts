// Contract between the benchmark page (`#/bench`) and the script that drives
// it (`tools/bench`). Self-contained on purpose: the script imports these
// types without pulling the web app.

export const BENCH_PROTOCOL_VERSION = 1;

export type BenchQuality = 'low' | 'medium' | 'high';
export const BENCH_QUALITIES: readonly BenchQuality[] = ['low', 'medium', 'high'];

/** What the viewpoint is meant to judge. */
export type ViewpointKind = 'open-road' | 'forest' | 'village' | 'climb' | 'summit' | 'lake';

export interface BenchViewpoint {
  /** Stable identifier: file names and before/after matching depend on it. */
  id: string;
  label: string;
  kind: ViewpointKind;
  routeId: string;
  /** Distance along the route, m. */
  atM: number;
  camera: 'pov' | 'chase' | 'side' | 'drone';
}

export interface BenchEnvironment {
  userAgent: string;
  /** Unmasked GPU name when the browser exposes it. */
  gpu: string;
  backend: 'webgl2' | 'webgpu';
  devicePixelRatio: number;
  viewport: { width: number; height: number };
}

export interface BenchMetrics {
  viewpoint: string;
  quality: BenchQuality;
  durationS: number;
  frames: number;
  avgFps: number;
  /** FPS of the 1 % slowest frames. */
  low1Fps: number;
  avgFrameMs: number;
  p99FrameMs: number;
  /** Draw calls and triangles of the captured (frozen) frame. */
  drawCalls: number;
  triangles: number;
  /** Estimated GPU memory, MB (see apps/web/src/world/gpu-memory.ts). */
  gpuMemoryMB: { geometry: number; textures: number; targets: number; total: number };
  /** Objects uploaded by the renderer, as it counts them. */
  renderer: { geometries: number; textures: number; programs: number };
  /** Drawing buffer, device pixels. */
  canvas: { width: number; height: number };
}

export interface BenchApi {
  version: number;
  viewpoints: readonly BenchViewpoint[];
  environment(): BenchEnvironment;
  /** Shows a viewpoint; resolves once the frame is frozen and ready to capture. */
  show(viewpointId: string, quality: BenchQuality): Promise<void>;
  /** Runs the animations in real time for `durationS` and returns the frame statistics. */
  measure(durationS: number): Promise<BenchMetrics>;
}
