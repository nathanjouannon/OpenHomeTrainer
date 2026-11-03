import { describe, expect, it } from 'vitest';
import { isRendererPreference, rendererFromQuery } from './renderer-options';

describe('renderer options', () => {
  it('accepts only known preferences', () => {
    expect(isRendererPreference('auto')).toBe(true);
    expect(isRendererPreference('webgl2')).toBe(true);
    expect(isRendererPreference('webgpu')).toBe(false);
    expect(isRendererPreference(undefined)).toBe(false);
  });

  it('reads the backend forced in the URL', () => {
    expect(rendererFromQuery(new URLSearchParams('auto=1&renderer=webgl2'), 'auto')).toBe('webgl2');
    expect(rendererFromQuery(new URLSearchParams('renderer=foo'), 'auto')).toBe('auto');
    expect(rendererFromQuery(new URLSearchParams(''), 'webgl2')).toBe('webgl2');
  });
});
