import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DataArrayTexture,
  DataTexture,
  DirectionalLight,
  FloatType,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  Texture,
  WebGLRenderTarget,
} from 'three';
import { int, texture, uv } from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { canvasBytes, estimateGpuMemory, textureSizeBytes } from './gpu-memory';

describe('estimateGpuMemory', () => {
  it('counts each shared geometry and texture once', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(300), 3));
    geometry.setIndex(new BufferAttribute(new Uint32Array(150), 1));
    const map = new Texture({ width: 64, height: 32 });
    map.generateMipmaps = false;
    const material = new MeshStandardMaterial({ map });
    const scene = new Group();
    scene.add(new Mesh(geometry, material), new Mesh(geometry, material));

    const m = estimateGpuMemory(scene, null);
    expect(m.geometries).toBe(1);
    expect(m.textures).toBe(1);
    expect(m.geometryBytes).toBe(300 * 4 + 150 * 4);
    expect(m.textureBytes).toBe(64 * 32 * 4);
    expect(m.targetBytes).toBe(0);
    expect(m.totalBytes).toBe(m.geometryBytes + m.textureBytes);
  });

  it('finds the textures of the TSL nodes of a node material', () => {
    const layers = new DataArrayTexture(new Uint8Array(16 * 16 * 4 * 3), 16, 16, 3);
    layers.generateMipmaps = false;
    const material = new MeshStandardNodeMaterial();
    material.colorNode = texture(layers, uv()).depth(int(1)).mul(0.5);
    const scene = new Group();
    scene.add(new Mesh(new BoxGeometry(), material));
    const m = estimateGpuMemory(scene, null);
    expect(m.textures).toBe(1);
    expect(m.textureBytes).toBe(16 * 16 * 3 * 4);
  });

  it('adds the textures a node material lists in userData', () => {
    const map = new DataArrayTexture(new Uint8Array(8 * 8 * 4 * 2), 8, 8, 2);
    map.generateMipmaps = false;
    const material = new MeshStandardNodeMaterial();
    material.userData.textures = [map];
    const scene = new Group();
    scene.add(new Mesh(new BoxGeometry(), material));
    expect(estimateGpuMemory(scene, null).textureBytes).toBe(8 * 8 * 2 * 4);
  });

  it('adds instance attributes', () => {
    const scene = new Group();
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 10);
    scene.add(mesh);
    const box = estimateGpuMemory(new Mesh(new BoxGeometry()), null).geometryBytes;
    expect(estimateGpuMemory(scene, null).geometryBytes).toBe(box + 10 * 16 * 4);
  });

  it('includes the canvas and the shadow maps', () => {
    const scene = new Group();
    const light = new DirectionalLight();
    light.shadow.map = new WebGLRenderTarget(1024, 1024);
    scene.add(light);
    const canvas = { width: 1920, height: 1080, antialias: false };
    const m = estimateGpuMemory(scene, canvas);
    expect(m.targetBytes).toBe(canvasBytes(canvas) + 1024 * 1024 * (4 + 4));
  });
});

describe('textureSizeBytes', () => {
  it('accounts for mipmaps and float formats', () => {
    const t = new DataTexture(new Float32Array(16 * 16 * 4), 16, 16, RGBAFormat, FloatType);
    t.generateMipmaps = true;
    expect(textureSizeBytes(t)).toBe(Math.round(16 * 16 * 16 * (4 / 3)));
  });
});

describe('canvasBytes', () => {
  it('grows with MSAA', () => {
    const plain = canvasBytes({ width: 100, height: 100, antialias: false });
    expect(plain).toBe(100 * 100 * 12);
    expect(canvasBytes({ width: 100, height: 100, antialias: true })).toBe(
      plain + 100 * 100 * 8 * 4,
    );
  });

  it('adds the half-float output buffer of WebGPURenderer', () => {
    const size = { width: 100, height: 100, halfFloatOutput: true };
    const plain = canvasBytes({ ...size, antialias: false });
    expect(plain).toBe(100 * 100 * (8 + 12));
    expect(canvasBytes({ ...size, antialias: true })).toBe(plain + 100 * 100 * 12 * 4);
  });
});
