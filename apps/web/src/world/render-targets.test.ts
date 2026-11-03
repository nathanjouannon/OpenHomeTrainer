import { Object3D, RenderTarget } from 'three';
import { describe, expect, it } from 'vitest';
import { ownRenderTargets, registerRenderTargets, sceneRenderTargets } from './render-targets';

describe('render targets of a scene', () => {
  it('lists the declared targets once, until removed', () => {
    const scene = new Object3D();
    const a = new RenderTarget(4, 4);
    const b = new RenderTarget(8, 8);
    const removeA = registerRenderTargets(scene, 'a', () => [a, b]);
    registerRenderTargets(scene, 'b', () => [b]);
    expect(sceneRenderTargets(scene)).toEqual([a, b]);
    removeA();
    expect(sceneRenderTargets(scene)).toEqual([b]);
    expect(sceneRenderTargets(new Object3D())).toEqual([]);
  });

  it('finds the targets held in the fields of an object', () => {
    const a = new RenderTarget(4, 4);
    const b = new RenderTarget(4, 4);
    const node = { _target: a, _mips: [b, null], other: 3 };
    expect(ownRenderTargets([node, null])).toEqual([a, b]);
  });
});
