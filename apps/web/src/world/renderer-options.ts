// Renderer choice, without importing Three.js (used by settings and tests).

export type RendererBackend = 'webgpu' | 'webgl2';
/** `auto`: WebGPU when available, WebGL2 otherwise. `webgl2`: always WebGL2. */
export type RendererPreference = 'auto' | 'webgl2';
export const RENDERER_PREFERENCES: readonly RendererPreference[] = ['auto', 'webgl2'];

export const isRendererPreference = (v: unknown): v is RendererPreference =>
  RENDERER_PREFERENCES.includes(v as RendererPreference);

/** `?renderer=webgl2` in the page URL forces the WebGL2 backend (benchmark). */
export function rendererFromQuery(
  query: URLSearchParams,
  fallback: RendererPreference,
): RendererPreference {
  const v = query.get('renderer');
  return isRendererPreference(v) ? v : fallback;
}
