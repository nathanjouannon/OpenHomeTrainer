// Downloads a real elevation model (DEM) around a point and writes a square
// heightmap for the 3D spike.
//
// Source: Terrain Tiles (AWS Open Data, Terrarium encoding), free and keyless.
// Usage: pnpm fetch-dem [--lat 45.07] [--lon 5.55] [--size 4000] [--samples 513] [--zoom 14] [--out dir]

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { PNG } from 'pngjs';
import {
  decodeTerrarium,
  lonLatToPixel,
  metersPerPixel,
  offsetToLonLat,
  TILE_SIZE,
} from './terrarium';

const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const ATTRIBUTION =
  'Terrain Tiles (AWS Open Data / Mapzen). Sources include SRTM, GMTED, ETOPO1, NED, ' +
  'EU-DEM (© Copernicus, EEA) and others — see https://github.com/tilezen/joerd/blob/master/docs/attribution.md';

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
const sizeM = Number(values.size);
const samples = Number(values.samples);
const zoom = Number(values.zoom);
const outDir = resolve(values.out);

type Tile = { data: Buffer; width: number };
const tiles = new Map<string, Tile>();

async function fetchTile(x: number, y: number): Promise<Tile> {
  const key = `${x}/${y}`;
  const cached = tiles.get(key);
  if (cached) return cached;
  const url = TILE_URL.replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  const tile = { data: png.data, width: png.width };
  tiles.set(key, tile);
  return tile;
}

/** Elevation at a global pixel position (nearest tile pixel). */
function elevationAtPixel(px: number, py: number): number {
  const tx = Math.floor(px / TILE_SIZE);
  const ty = Math.floor(py / TILE_SIZE);
  const tile = tiles.get(`${tx}/${ty}`);
  if (!tile) throw new Error(`Tile ${tx}/${ty} not loaded`);
  const ix = Math.min(TILE_SIZE - 1, Math.floor(px - tx * TILE_SIZE));
  const iy = Math.min(TILE_SIZE - 1, Math.floor(py - ty * TILE_SIZE));
  const i = (iy * tile.width + ix) * 4;
  return decodeTerrarium(tile.data[i] ?? 0, tile.data[i + 1] ?? 0, tile.data[i + 2] ?? 0);
}

/** Bilinear elevation at a global pixel position (pixel centers at +0.5). */
function elevationBilinear(px: number, py: number): number {
  const x = px - 0.5;
  const y = py - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const e00 = elevationAtPixel(x0 + 0.5, y0 + 0.5);
  const e10 = elevationAtPixel(x0 + 1.5, y0 + 0.5);
  const e01 = elevationAtPixel(x0 + 0.5, y0 + 1.5);
  const e11 = elevationAtPixel(x0 + 1.5, y0 + 1.5);
  return (e00 * (1 - fx) + e10 * fx) * (1 - fy) + (e01 * (1 - fx) + e11 * fx) * fy;
}

async function main() {
  const half = sizeM / 2;
  const nw = offsetToLonLat(center, -half, half);
  const se = offsetToLonLat(center, half, -half);
  const pNw = lonLatToPixel(nw.lon, nw.lat, zoom);
  const pSe = lonLatToPixel(se.lon, se.lat, zoom);
  const tx0 = Math.floor((pNw.x - 1) / TILE_SIZE);
  const tx1 = Math.floor((pSe.x + 1) / TILE_SIZE);
  const ty0 = Math.floor((pNw.y - 1) / TILE_SIZE);
  const ty1 = Math.floor((pSe.y + 1) / TILE_SIZE);

  const count = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
  console.log(
    `Zone ${sizeM} m around ${center.lat}, ${center.lon} — zoom ${zoom} ` +
      `(${metersPerPixel(center.lat, zoom).toFixed(1)} m/px), ${count} tile(s)`,
  );
  const jobs: Promise<Tile>[] = [];
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) jobs.push(fetchTile(tx, ty));
  await Promise.all(jobs);

  // Row 0 is the north edge, column 0 the west edge.
  const heights = new Float32Array(samples * samples);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let row = 0; row < samples; row++) {
    const northM = half - (row / (samples - 1)) * sizeM;
    for (let col = 0; col < samples; col++) {
      const eastM = -half + (col / (samples - 1)) * sizeM;
      const { lat, lon } = offsetToLonLat(center, eastM, northM);
      const p = lonLatToPixel(lon, lat, zoom);
      const h = elevationBilinear(p.x, p.y);
      heights[row * samples + col] = h;
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'heightmap.bin'), new Uint8Array(heights.buffer));
  const meta = {
    format: 'hrt-heightmap/1',
    encoding: 'float32-le, row-major, row 0 = north, column 0 = west',
    sizeM,
    samples,
    center,
    zoom,
    minElevationM: Math.round(min * 10) / 10,
    maxElevationM: Math.round(max * 10) / 10,
    attribution: ATTRIBUTION,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(resolve(outDir, 'heightmap.json'), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`Elevation ${meta.minElevationM}–${meta.maxElevationM} m → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
