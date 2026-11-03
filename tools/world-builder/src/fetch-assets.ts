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
import { ASSETS_FORMAT, type AssetManifest } from '../../../apps/web/src/world/asset-manifest';
import { HDRI, HDRI_CLIP_PERCENTILE } from './asset-catalog';
import { clipHighlights, findSun, luminancePercentile, parseHdr, writeHdr } from './hdr';

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

async function download(file: PolyHavenFile): Promise<Uint8Array> {
  const res = await fetch(file.url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${file.url}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const md5 = createHash('md5').update(buf).digest('hex');
  if (md5 !== file.md5) throw new Error(`${file.url}: checksum mismatch`);
  return buf;
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
  };
  await save(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Assets → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
