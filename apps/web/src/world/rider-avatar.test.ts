// The rig on the real model (skipped when `pnpm import-avatar` was not run):
// the wrists must be on the hoods and the balls of the feet on the pedals.

import { existsSync, readFileSync } from 'node:fs';
import { type Bone, type Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { AvatarRig } from './rider-avatar';
import { BB, pedalPosition, WRIST } from './rider-geometry';

const dir = new URL('../../public/assets/avatar/', import.meta.url);
const gltfFile = new URL('rider.gltf', dir);

/**
 * The glTF without its textures, packed as a binary glTF (GLB) so that nothing
 * has to be fetched: loadable in Node.
 */
async function loadScene(): Promise<Object3D> {
  const json = JSON.parse(readFileSync(gltfFile, 'utf8'));
  json.images = undefined;
  json.textures = undefined;
  json.samplers = undefined;
  for (const m of json.materials ?? []) {
    m.normalTexture = undefined;
    if (m.pbrMetallicRoughness) {
      m.pbrMetallicRoughness.baseColorTexture = undefined;
      m.pbrMetallicRoughness.metallicRoughnessTexture = undefined;
    }
  }
  const buffer = json.buffers[0] as { uri?: string; byteLength: number };
  const bin = readFileSync(new URL(buffer.uri as string, dir));
  buffer.uri = undefined;
  json.buffers = [{ byteLength: bin.length }];
  const pad = (b: Buffer, byte: number) =>
    Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, byte)]);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const binChunk = pad(bin, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunk = (type: number, data: Buffer) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  const glb = Buffer.concat([header, chunk(0x4e4f534a, jsonChunk), chunk(0x004e4942, binChunk)]);
  const arrayBuffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer as ArrayBuffer, '');
  return gltf.scene;
}

/** Position of a bone in the rider frame (the rig root is not in a scene). */
function riderPos(rig: AvatarRig, name: string): Vector3 {
  rig.root.updateMatrixWorld(true);
  const bone = rig.root.getObjectByName(name) as Bone;
  return new Vector3().setFromMatrixPosition(bone.matrixWorld);
}

describe.skipIf(!existsSync(gltfFile))('AvatarRig on the Quaternius model', () => {
  const kit = { jersey: '#e4572e' };

  it('puts the wrists on the hoods, seated and standing', async () => {
    const rig = new AvatarRig(await loadScene(), kit);
    for (const standing of [0, 1]) {
      for (const angle of [0, 1.3, 2.9, 4.4]) {
        rig.pose(angle, standing);
        for (const [side, name] of [
          [1, 'hand_l'],
          [-1, 'hand_r'],
        ] as const) {
          const wrist = riderPos(rig, name);
          const target = new Vector3(side * WRIST.x, WRIST.y, WRIST.z);
          expect(
            wrist.distanceTo(target),
            `${name} standing ${standing} angle ${angle}`,
          ).toBeLessThan(0.02);
        }
      }
    }
  });

  it('puts the balls of the feet on the pedals', async () => {
    const rig = new AvatarRig(await loadScene(), kit);
    for (const angle of [0, 1.3, 2.9, 4.4]) {
      rig.pose(angle, 0);
      for (const [side, name] of [
        [1, 'ball_l'],
        [-1, 'ball_r'],
      ] as const) {
        const pedal = pedalPosition(side, angle, new Vector3());
        const ball = riderPos(rig, name);
        expect(
          Math.hypot(ball.y - pedal.y - 0.03, ball.z - pedal.z),
          `${name} at ${angle}`,
        ).toBeLessThan(0.025);
      }
    }
    expect(BB.y).toBeGreaterThan(0);
  });
});
