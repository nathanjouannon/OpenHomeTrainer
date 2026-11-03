// Renderer of the 3D world (lot 2.1): Three.js `WebGPURenderer`, which runs
// on WebGPU when the browser has it and falls back to WebGL2 otherwise. The
// same TSL shaders and node materials work on both backends.

import { WebGPURenderer } from 'three/webgpu';
import type { RendererBackend, RendererPreference } from './renderer-options';

export interface RendererOptions {
  antialias: boolean;
  preference: RendererPreference;
}

/** Draw calls and triangles of the last rendered frame. */
export interface FrameInfo {
  calls: number;
  triangles: number;
}

/** Creates and initialises the renderer (the `gl` factory of the R3F canvas). */
export async function createWorldRenderer(
  canvas: HTMLCanvasElement,
  { antialias, preference }: RendererOptions,
): Promise<WebGPURenderer> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias,
    powerPreference: 'high-performance',
    forceWebGL: preference === 'webgl2',
  });
  await renderer.init();
  // WebGPURenderer only resets its per-frame counters in its own animation
  // loop, and R3F drives its own requestAnimationFrame loop: reset them at
  // each render, as WebGLRenderer does.
  renderer.info.autoReset = false;
  const render = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    renderer.info.reset();
    return render(scene, camera);
  };
  return renderer;
}

/** The renderer of an R3F state (typed as WebGLRenderer by R3F). */
export const asWorldRenderer = (gl: unknown) => gl as WebGPURenderer;

export function rendererBackend(gl: unknown): RendererBackend {
  const backend = (gl as Partial<WebGPURenderer>).backend as { isWebGPUBackend?: boolean };
  return backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
}

export function frameInfo(gl: unknown): FrameInfo {
  const r = asWorldRenderer(gl).info.render;
  return { calls: r.drawCalls, triangles: r.triangles };
}

/** Unmasked GPU name when the browser exposes it. */
export function gpuName(gl: unknown): string {
  const backend = asWorldRenderer(gl).backend as {
    gl?: WebGL2RenderingContext | null;
    device?: { adapterInfo?: { vendor?: string; architecture?: string; description?: string } };
  };
  const ctx = backend.gl;
  if (ctx) {
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    return String(
      ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
    );
  }
  const info = backend.device?.adapterInfo;
  if (!info) return 'unknown';
  return (
    info.description || [info.vendor, info.architecture].filter(Boolean).join(' ') || 'unknown'
  );
}
