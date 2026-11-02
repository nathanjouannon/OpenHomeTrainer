// Real elevation model (DEM) around a point, as a square heightmap.
// Source: Terrain Tiles (AWS Open Data, Terrarium encoding), free and keyless.

import { PNG } from 'pngjs';
import {
  decodeTerrarium,
  lonLatToPixel,
  metersPerPixel,
  offsetToLonLat,
  TILE_SIZE,
} from './terrarium';

const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const DEM_ATTRIBUTION =
  'Terrain Tiles (AWS Open Data / Mapzen). Sources include SRTM, GMTED, ETOPO1, NED, ' +
  'EU-DEM (© Copernicus, EEA) and others — see https://github.com/tilezen/joerd/blob/master/docs/attribution.md';

export interface DemRequest {
  center: { lat: number; lon: number };
  sizeM: number;
  samples: number;
  zoom: number;
  log?: (msg: string) => void;
}

/** Square heightmap: float32, row-major, row 0 = north edge, column 0 = west edge. */
export interface Heightmap {
  sizeM: number;
  samples: number;
  heights: Float32Array;
  minElevationM: number;
  maxElevationM: number;
}

type Tile = { data: Buffer; width: number };

export async function fetchHeightmap(req: DemRequest): Promise<Heightmap> {
  const { center, sizeM, samples, zoom } = req;
  const tiles = new Map<string, Tile>();

  const fetchTile = async (x: number, y: number) => {
    const url = TILE_URL.replace('{z}', String(zoom))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
    tiles.set(`${x}/${y}`, { data: png.data, width: png.width });
  };

  const elevationAtPixel = (px: number, py: number) => {
    const tx = Math.floor(px / TILE_SIZE);
    const ty = Math.floor(py / TILE_SIZE);
    const tile = tiles.get(`${tx}/${ty}`);
    if (!tile) throw new Error(`Tile ${tx}/${ty} not loaded`);
    const ix = Math.min(TILE_SIZE - 1, Math.floor(px - tx * TILE_SIZE));
    const iy = Math.min(TILE_SIZE - 1, Math.floor(py - ty * TILE_SIZE));
    const i = (iy * tile.width + ix) * 4;
    return decodeTerrarium(tile.data[i] ?? 0, tile.data[i + 1] ?? 0, tile.data[i + 2] ?? 0);
  };

  // Bilinear, pixel centers at +0.5.
  const elevationBilinear = (px: number, py: number) => {
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
  };

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
  req.log?.(
    `Zone ${sizeM} m around ${center.lat}, ${center.lon} — zoom ${zoom} ` +
      `(${metersPerPixel(center.lat, zoom).toFixed(1)} m/px), ${count} tile(s)`,
  );
  const jobs: Promise<void>[] = [];
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) jobs.push(fetchTile(tx, ty));
  await Promise.all(jobs);

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
  return { sizeM, samples, heights, minElevationM: min, maxElevationM: max };
}

/** Bilinear altitude at (x east, y north), meters from the center. Clamped at the edges. */
export function heightAt(hm: Heightmap, x: number, y: number): number {
  const n = hm.samples - 1;
  const half = hm.sizeM / 2;
  const gx = Math.min(n, Math.max(0, ((x + half) / hm.sizeM) * n));
  const gz = Math.min(n, Math.max(0, ((half - y) / hm.sizeM) * n));
  const c0 = Math.min(n - 1, Math.floor(gx));
  const r0 = Math.min(n - 1, Math.floor(gz));
  const fx = gx - c0;
  const fz = gz - r0;
  const s = hm.samples;
  const h = hm.heights;
  const h00 = h[r0 * s + c0] ?? 0;
  const h10 = h[r0 * s + c0 + 1] ?? 0;
  const h01 = h[(r0 + 1) * s + c0] ?? 0;
  const h11 = h[(r0 + 1) * s + c0 + 1] ?? 0;
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}
