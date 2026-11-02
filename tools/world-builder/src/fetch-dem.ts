// Downloads a real elevation model (DEM) around a point and writes a square
// heightmap for the 3D spike.
//
// Usage: pnpm fetch-dem [--lat 45.07] [--lon 5.55] [--size 4000] [--samples 513] [--zoom 14] [--out dir]

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEM_ATTRIBUTION, fetchHeightmap } from './dem';

const { values } = parseArgs({
  options: {
    lat: { type: 'string', default: '45.07' },
    lon: { type: 'string', default: '5.55' },
    size: { type: 'string', default: '4000' },
    samples: { type: 'string', default: '513' },
    zoom: { type: 'string', default: '14' },
    out: { type: 'string', default: '../../apps/web/public/worlds/spike' },
  },
});

const center = { lat: Number(values.lat), lon: Number(values.lon) };
const zoom = Number(values.zoom);
const outDir = resolve(values.out);

async function main() {
  const hm = await fetchHeightmap({
    center,
    sizeM: Number(values.size),
    samples: Number(values.samples),
    zoom,
    log: console.log,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'heightmap.bin'), new Uint8Array(hm.heights.buffer));
  const meta = {
    format: 'hrt-heightmap/1',
    encoding: 'float32-le, row-major, row 0 = north, column 0 = west',
    sizeM: hm.sizeM,
    samples: hm.samples,
    center,
    zoom,
    minElevationM: Math.round(hm.minElevationM * 10) / 10,
    maxElevationM: Math.round(hm.maxElevationM * 10) / 10,
    attribution: DEM_ATTRIBUTION,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(resolve(outDir, 'heightmap.json'), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`Elevation ${meta.minElevationM}–${meta.maxElevationM} m → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
