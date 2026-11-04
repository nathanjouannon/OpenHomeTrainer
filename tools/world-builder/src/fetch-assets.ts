// `pnpm fetch-assets`: downloads the CC0 assets of the world (environment map,
// later PBR textures) into apps/web/public/assets/ and writes its manifest.
// Files already downloaded are kept (`--force` downloads everything again).
//
// Usage: pnpm fetch-assets [--force] [--out dir]

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  ASSETS_FORMAT,
  type AssetManifest,
  type TextureSet,
  type TextureSetFiles,
} from '../../../apps/web/src/world/asset-manifest';
import { HDRI, HDRI_CLIP_PERCENTILE, TEXTURES, type TextureAsset } from './asset-catalog';
import { clipHighlights, findSun, luminancePercentile, parseHdr, writeHdr } from './hdr';
import { listZip, readZipEntry } from './zip';

const { values } = parseArgs({
  options: {
    force: { type: 'boolean', default: false },
    out: { type: 'string', default: '../../apps/web/public/assets' },
  },
});
const outDir = resolve(values.out);
const POLY_HAVEN_API = 'https://api.polyhaven.com';
const USER_AGENT = 'HomeRealTrainer-asset-fetch';

interface PolyHavenFile {
  url: string;
  md5: string;
  size: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function download(file: { url: string; md5?: string }): Promise<Uint8Array> {
  const res = await fetch(file.url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${file.url}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (file.md5 && createHash('md5').update(buf).digest('hex') !== file.md5) {
    throw new Error(`${file.url}: checksum mismatch`);
  }
  return buf;
}

const MAPS = ['color', 'normal', 'roughness', 'ao', 'height'] as const;
type MapName = (typeof MAPS)[number];
/** Map names on Poly Haven and in the ambientCG archives. */
const POLY_HAVEN_MAPS: Record<MapName, string> = {
  color: 'Diffuse',
  normal: 'nor_gl',
  roughness: 'Rough',
  ao: 'AO',
  height: 'Displacement',
};
const AMBIENT_CG_MAPS: Record<MapName, string> = {
  color: 'Color',
  normal: 'NormalGL',
  roughness: 'Roughness',
  ao: 'AmbientOcclusion',
  height: 'Displacement',
};

async function fetchTextureMaps(t: TextureAsset): Promise<Partial<Record<MapName, Uint8Array>>> {
  const out: Partial<Record<MapName, Uint8Array>> = {};
  if (t.source === 'polyhaven') {
    const files = await getJson<Record<string, Record<string, { jpg?: PolyHavenFile }>>>(
      `${POLY_HAVEN_API}/files/${t.id}`,
    );
    for (const map of MAPS) {
      const f = files[POLY_HAVEN_MAPS[map]]?.['1k']?.jpg;
      if (f) out[map] = await download(f);
    }
    return out;
  }
  const zip = await download({ url: `https://ambientcg.com/get?file=${t.id}_1K-JPG.zip` });
  const entries = listZip(zip);
  for (const map of MAPS) {
    const e = entries.find((x) => x.name.endsWith(`_${AMBIENT_CG_MAPS[map]}.jpg`));
    if (e) out[map] = readZipEntry(zip, e);
  }
  return out;
}

const sourceUrl = (t: TextureAsset) =>
  t.source === 'polyhaven'
    ? `https://polyhaven.com/a/${t.id}`
    : `https://ambientcg.com/view?id=${t.id}`;

async function fetchTextures(
  previous: AssetManifest['textures'],
): Promise<Record<string, TextureSet>> {
  const out: Record<string, TextureSet> = {};
  for (const [slot, t] of Object.entries(TEXTURES)) {
    const source = sourceUrl(t);
    const prev = previous?.[slot];
    const dir = `textures/${slot}`;
    if (!values.force && prev?.source === source && existsSync(resolve(outDir, prev.color))) {
      console.log(`Texture ${slot} (${t.id}): already there`);
      out[slot] = prev;
      continue;
    }
    console.log(`Texture ${slot} (${t.source} ${t.id})…`);
    const maps = await fetchTextureMaps(t);
    if (!maps.color || !maps.normal || !maps.roughness) {
      throw new Error(`Texture ${t.id}: colour, normal or roughness map missing`);
    }
    const files: Partial<TextureSetFiles> = {};
    for (const map of MAPS) {
      const data = maps[map];
      if (!data) continue;
      const file = `${dir}/${map}.jpg`;
      await save(resolve(outDir, file), data);
      files[map] = file;
    }
    out[slot] = { ...(files as TextureSetFiles), source, license: 'CC0', author: t.author };
  }
  return out;
}

async function save(path: string, data: Uint8Array | string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

async function fetchHdri(previous: AssetManifest['hdri']): Promise<AssetManifest['hdri']> {
  const file = 'hdri/sky.hdr';
  const source = `https://polyhaven.com/a/${HDRI.id}`;
  if (!values.force && previous?.source === source && existsSync(resolve(outDir, file))) {
    console.log(`HDRI ${HDRI.id}: already there`);
    return previous;
  }
  const files = await getJson<{ hdri: Record<string, { hdr: PolyHavenFile }> }>(
    `${POLY_HAVEN_API}/files/${HDRI.id}`,
  );
  const entry = files.hdri[HDRI.resolution]?.hdr;
  if (!entry) throw new Error(`HDRI ${HDRI.id}: no ${HDRI.resolution} .hdr file`);
  console.log(`HDRI ${HDRI.id} (${(entry.size / 1e6).toFixed(1)} MB)…`);
  const img = parseHdr(await download(entry));
  const sun = findSun(img);
  const clippedAt = luminancePercentile(img, HDRI_CLIP_PERCENTILE);
  const n = clipHighlights(img, clippedAt);
  console.log(
    `  sun at azimuth ${((sun.azimuthRad * 180) / Math.PI).toFixed(0)}°, ` +
      `elevation ${((sun.elevationRad * 180) / Math.PI).toFixed(0)}°, ` +
      `${n} pixels clipped at ${clippedAt.toFixed(1)} (peak ${sun.peak.toFixed(0)})`,
  );
  await save(resolve(outDir, file), writeHdr(img));
  return {
    file,
    source,
    license: 'CC0',
    author: HDRI.author,
    sun: { azimuthRad: sun.azimuthRad, elevationRad: sun.elevationRad },
    clippedAt,
  };
}

async function main() {
  const manifestPath = resolve(outDir, 'manifest.json');
  let previous: Partial<AssetManifest> = {};
  try {
    previous = JSON.parse(await readFile(manifestPath, 'utf8')) as AssetManifest;
  } catch {
    // First run.
  }
  const manifest: AssetManifest = {
    format: ASSETS_FORMAT,
    generatedAt: new Date().toISOString(),
    hdri: await fetchHdri(previous.hdri),
    textures: await fetchTextures(previous.textures),
    // Imported by hand (`pnpm import-avatar`), not downloaded here: kept as is.
    ...(previous.avatar ? { avatar: previous.avatar } : {}),
  };
  await save(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Assets → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
