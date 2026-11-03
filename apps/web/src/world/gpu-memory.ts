// GPU memory estimate of a scene. Neither WebGL nor WebGPU exposes the real
// figure, so we add up what the scene uploads: vertex and index buffers,
// instance attributes, textures (with mipmaps), shadow maps and the canvas
// framebuffer. It is an estimate meant for comparisons between versions.

import {
  type BufferAttribute,
  type BufferGeometry,
  CompressedTexture,
  FloatType,
  HalfFloatType,
  type InterleavedBuffer,
  type InterleavedBufferAttribute,
  type Material,
  type Object3D,
  RedFormat,
  type RenderTarget,
  RGFormat,
  Texture,
} from 'three';

export interface GpuMemoryEstimate {
  geometryBytes: number;
  textureBytes: number;
  /** Canvas framebuffer, shadow maps and other render targets. */
  targetBytes: number;
  totalBytes: number;
  geometries: number;
  textures: number;
}

export interface CanvasBuffer {
  /** Drawing buffer size, in device pixels. */
  width: number;
  height: number;
  /** MSAA enabled on the canvas. */
  antialias: boolean;
  /**
   * WebGPURenderer draws the scene in a half-float buffer (with its own depth
   * and MSAA buffers), then tone-maps it into the canvas.
   */
  halfFloatOutput?: boolean;
}

const MSAA_SAMPLES = 4;

export function estimateGpuMemory(
  scene: Object3D,
  canvas: CanvasBuffer | null,
  renderTargets: readonly RenderTarget[] = [],
): GpuMemoryEstimate {
  const buffers = new Set<BufferAttribute | InterleavedBuffer>();
  const geometries = new Set<BufferGeometry>();
  const textures = new Set<Texture>();
  const targets = new Set<RenderTarget>(renderTargets);

  scene.traverse((object) => {
    const o = object as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
      instanceMatrix?: BufferAttribute;
      instanceColor?: BufferAttribute | null;
      morphTexture?: Texture | null;
      shadow?: { map: RenderTarget | null } | null;
      castShadow: boolean;
    };
    if (o.geometry) geometries.add(o.geometry);
    if (o.instanceMatrix) buffers.add(o.instanceMatrix);
    if (o.instanceColor) buffers.add(o.instanceColor);
    if (o.morphTexture) textures.add(o.morphTexture);
    if (o.shadow?.map) targets.add(o.shadow.map);
    const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of materials) collectTextures(m, textures);
  });
  for (const g of geometries) collectBuffers(g, buffers);

  let geometryBytes = 0;
  for (const b of buffers) geometryBytes += bufferBytes(b);
  let textureBytes = 0;
  for (const t of textures) textureBytes += textureSizeBytes(t);
  let targetBytes = canvas ? canvasBytes(canvas) : 0;
  for (const rt of targets) targetBytes += renderTargetBytes(rt);
  return {
    geometryBytes,
    textureBytes,
    targetBytes,
    totalBytes: geometryBytes + textureBytes + targetBytes,
    geometries: geometries.size,
    textures: textures.size,
  };
}

function collectBuffers(g: BufferGeometry, out: Set<BufferAttribute | InterleavedBuffer>): void {
  const add = (a: BufferAttribute | InterleavedBufferAttribute) => {
    out.add('isInterleavedBufferAttribute' in a ? a.data : a);
  };
  if (g.index) add(g.index);
  for (const a of Object.values(g.attributes)) add(a);
  for (const list of Object.values(g.morphAttributes)) for (const a of list) add(a);
}

function bufferBytes(b: BufferAttribute | InterleavedBuffer): number {
  return b.array.byteLength;
}

/** Textures referenced by a material: map, normalMap… and shader uniforms. */
function collectTextures(m: Material, out: Set<Texture>): void {
  for (const value of Object.values(m)) {
    if (value instanceof Texture) out.add(value);
  }
  const uniforms = (m as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms;
  for (const u of Object.values(uniforms ?? {})) {
    if (u?.value instanceof Texture) out.add(u.value);
  }
}

export function textureSizeBytes(t: Texture): number {
  if (t instanceof CompressedTexture) {
    let bytes = 0;
    for (const level of t.mipmaps ?? [])
      bytes += (level as { data: ArrayBufferView }).data.byteLength;
    return bytes;
  }
  const images = Array.isArray(t.image) ? t.image : [t.image];
  let texels = 0;
  for (const img of images) {
    const { width, height, depth } = imageSize(img);
    texels += width * height * depth;
  }
  const mipmaps = t.generateMipmaps ? 4 / 3 : 1;
  return Math.round(texels * bytesPerTexel(t.format, t.type) * mipmaps);
}

function imageSize(img: unknown): { width: number; height: number; depth: number } {
  const i = img as { width?: number; height?: number; depth?: number } | null;
  return { width: i?.width ?? 0, height: i?.height ?? 0, depth: i?.depth ?? 1 };
}

function bytesPerTexel(format: number, type: number): number {
  // RGB is stored padded to RGBA by most drivers.
  const channels = format === RedFormat ? 1 : format === RGFormat ? 2 : 4;
  const bytes = type === FloatType ? 4 : type === HalfFloatType ? 2 : 1;
  return channels * bytes;
}

/** Canvas: front and back colour buffers, depth-stencil, plus the MSAA buffers. */
export function canvasBytes({ width, height, antialias, halfFloatOutput }: CanvasBuffer): number {
  const pixels = width * height;
  if (halfFloatOutput) {
    // Canvas (front and back, no depth) + RGBA16F output buffer and its depth.
    const resolved = pixels * 4 * 2 + pixels * (8 + 4);
    return antialias ? resolved + pixels * (8 + 4) * MSAA_SAMPLES : resolved;
  }
  const resolved = pixels * 4 * 2 + pixels * 4;
  return antialias ? resolved + pixels * (4 + 4) * MSAA_SAMPLES : resolved;
}

function renderTargetBytes(rt: RenderTarget): number {
  const pixels = rt.width * rt.height * rt.depth;
  let bytes = 0;
  for (const t of rt.textures) bytes += pixels * bytesPerTexel(t.format, t.type);
  if (rt.depthBuffer) bytes += pixels * 4;
  return bytes * Math.max(1, rt.samples);
}
