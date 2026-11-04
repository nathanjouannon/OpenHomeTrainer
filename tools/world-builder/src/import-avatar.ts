// `pnpm import-avatar [zip]`: imports the rigged rider of lot 2.10 from the
// Quaternius « Universal Base Characters » pack (CC0) into
// apps/web/public/assets/avatar/ and records it in the assets manifest.
//
// The pack is only offered through itch.io (behind a bot check), so it is
// downloaded by hand: https://quaternius.itch.io/universal-base-characters
// (the free « Standard » archive). Textures are reduced to what a rider seen
// from a few metres needs.
//
// Usage: pnpm import-avatar [path/to/Universal Base Characters[Standard].zip] [--out dir]

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ASSETS_FORMAT, type AssetManifest } from '../../../apps/web/src/world/asset-manifest';
import { resizePng } from './png-resize';
import { listZip, readZipEntry } from './zip';

const { values, positionals } = parseArgs({
  options: { out: { type: 'string', default: '../../apps/web/public/assets' } },
  allowPositionals: true,
});
const outDir = resolve(values.out);
const defaultZip = resolve(homedir(), 'Downloads', 'Universal Base Characters[Standard].zip');
const zipPath = resolve(positionals[0] ?? defaultZip);

const SOURCE = 'https://quaternius.itch.io/universal-base-characters';
const AUTHOR = 'Quaternius';
const MODEL = 'Base Characters/Godot - UE/Superhero_Male_FullBody';
/** Longest side kept, by texture (default 1024). */
const MAX_SIDE: Record<string, number> = {
  T_Eye_Brown: 256,
  T_Eye_Normal_png: 256,
  T_Hair_1_Normal_png: 256,
  T_Hair_1_BaseColor: 256,
};

interface Gltf {
  images?: { uri: string }[];
  buffers?: { uri: string }[];
}

async function main() {
  if (!existsSync(zipPath)) {
    console.error(`Archive not found: ${zipPath}`);
    console.error(`Download « Universal Base Characters [Standard] » from ${SOURCE}`);
    process.exitCode = 1;
    return;
  }
  const zip = new Uint8Array(await readFile(zipPath));
  const entries = listZip(zip);
  const inModelFolder = (name: string) => name.includes('Base Characters/Godot - UE/');
  const find = (name: string) => {
    // The glTF of the pack points to « X_png.png » for two textures shipped as « X.png ».
    const suffixes = [name, name.replace(/_png\.png$/, '.png')];
    const suffix =
      suffixes.find((s) =>
        entries.some((x) => x.name.endsWith(`/${s}`) && inModelFolder(x.name)),
      ) ?? name;
    const e = entries.find((x) => x.name.endsWith(`/${suffix}`) && inModelFolder(x.name));
    if (!e) throw new Error(`${suffix} not found in ${basename(zipPath)}`);
    return e;
  };

  const gltfEntry = find(`${MODEL.split('/').pop()}.gltf`);
  const gltf = JSON.parse(new TextDecoder().decode(readZipEntry(zip, gltfEntry))) as Gltf;
  const dir = resolve(outDir, 'avatar');
  await mkdir(dir, { recursive: true });

  for (const buffer of gltf.buffers ?? []) {
    await writeFile(resolve(dir, buffer.uri), readZipEntry(zip, find(buffer.uri)));
  }
  for (const image of gltf.images ?? []) {
    const bytes = readZipEntry(zip, find(image.uri));
    const max = MAX_SIDE[image.uri.replace(/\.png$/, '')] ?? 1024;
    const small = resizePng(bytes, max);
    console.log(
      `  ${image.uri}: ${(bytes.length / 1e6).toFixed(1)} → ${(small.length / 1e6).toFixed(1)} MB`,
    );
    await writeFile(resolve(dir, image.uri), small);
  }
  await writeFile(resolve(dir, 'rider.gltf'), JSON.stringify(gltf));

  const manifestPath = resolve(outDir, 'manifest.json');
  let manifest: AssetManifest = { format: ASSETS_FORMAT, generatedAt: new Date().toISOString() };
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as AssetManifest;
  } catch {
    // No manifest yet: `pnpm fetch-assets` completes it.
  }
  manifest.avatar = { file: 'avatar/rider.gltf', source: SOURCE, license: 'CC0', author: AUTHOR };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Avatar → ${dir}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
