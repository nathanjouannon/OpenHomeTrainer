// Web Mercator tile math and Terrarium elevation decoding.
// Terrarium encoding: elevation (m) = R * 256 + G + B / 256 - 32768.

export const TILE_SIZE = 256;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

export const decodeTerrarium = (r: number, g: number, b: number): number =>
  r * 256 + g + b / 256 - 32768;

/** Global pixel coordinates (at zoom z) of a lat/lon. */
export function lonLatToPixel(lon: number, lat: number, z: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Ground size of one pixel at zoom z and latitude lat, in meters. */
export const metersPerPixel = (lat: number, z: number): number =>
  (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * 2 ** z);

/** Converts local east/north offsets (meters) around a center into lat/lon. */
export function offsetToLonLat(
  center: { lat: number; lon: number },
  eastM: number,
  northM: number,
): { lat: number; lon: number } {
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((center.lat * Math.PI) / 180);
  return { lat: center.lat + northM / metersPerDegLat, lon: center.lon + eastM / metersPerDegLon };
}
