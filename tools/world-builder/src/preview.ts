// Shaded relief map of a heightmap, with contour lines, a 1 km grid and
// optional route overlays. Used to design the loops of a world.

import { PNG } from 'pngjs';
import { type Heightmap, heightAt } from './dem';

export interface PreviewOverlay {
  /** Points in world meters (x east, y north). */
  points: readonly (readonly [number, number])[];
  color: readonly [number, number, number];
  closed?: boolean;
  /** Control points drawn as dots with their index. */
  markers?: readonly (readonly [number, number])[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hypsometric(h: number, waterLevelM: number | null): [number, number, number] {
  if (waterLevelM !== null && h <= waterLevelM + 0.5) return [70, 120, 170];
  const stops: [number, [number, number, number]][] = [
    [400, [96, 140, 80]],
    [700, [140, 160, 90]],
    [1000, [170, 150, 100]],
    [1400, [150, 120, 90]],
    [1800, [200, 200, 200]],
  ];
  if (h <= (stops[0] as [number, unknown])[0]) return stops[0]?.[1] as [number, number, number];
  for (let i = 1; i < stops.length; i++) {
    const [h1, c1] = stops[i] as [number, [number, number, number]];
    const [h0, c0] = stops[i - 1] as [number, [number, number, number]];
    if (h <= h1) {
      const t = (h - h0) / (h1 - h0);
      return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    }
  }
  return stops.at(-1)?.[1] as [number, number, number];
}

export function renderPreview(
  hm: Heightmap,
  options: { pixels?: number; overlays?: PreviewOverlay[]; waterLevelM?: number | null } = {},
): Buffer {
  const W = options.pixels ?? 1000;
  const png = new PNG({ width: W, height: W });
  const half = hm.sizeM / 2;
  const mPerPx = hm.sizeM / W;
  const toWorld = (px: number, py: number) =>
    [-half + (px + 0.5) * mPerPx, half - (py + 0.5) * mPerPx] as const;
  const set = (px: number, py: number, c: readonly [number, number, number], a = 1) => {
    if (px < 0 || py < 0 || px >= W || py >= W) return;
    const i = (py * W + Math.round(px)) * 4;
    const d = png.data;
    d[i] = lerp(d[i] ?? 0, c[0], a);
    d[i + 1] = lerp(d[i + 1] ?? 0, c[1], a);
    d[i + 2] = lerp(d[i + 2] ?? 0, c[2], a);
    d[i + 3] = 255;
  };

  for (let py = 0; py < W; py++) {
    for (let px = 0; px < W; px++) {
      const [x, y] = toWorld(px, py);
      const h = heightAt(hm, x, y);
      // Hillshade, light from the north-west.
      const dx = heightAt(hm, x + mPerPx, y) - heightAt(hm, x - mPerPx, y);
      const dy = heightAt(hm, x, y + mPerPx) - heightAt(hm, x, y - mPerPx);
      const nx = -dx / (2 * mPerPx);
      const ny = -dy / (2 * mPerPx);
      const len = Math.hypot(nx, ny, 1);
      const shade = Math.max(0, (nx * -0.5 + ny * 0.5 + 0.7) / len);
      const base = hypsometric(h, options.waterLevelM ?? null);
      const k = 0.45 + 0.75 * shade;
      set(px, py, [base[0] * k, base[1] * k, base[2] * k]);
      // Contours every 50 m, thicker every 250 m.
      const band = Math.floor(h / 50);
      const right = Math.floor(heightAt(hm, x + mPerPx, y) / 50);
      const down = Math.floor(heightAt(hm, x, y - mPerPx) / 50);
      if (band !== right || band !== down) {
        const major = Math.max(band, right, down) % 5 === 0;
        set(px, py, [40, 30, 20], major ? 0.55 : 0.25);
      }
    }
  }
  // 1 km grid.
  for (let km = -Math.floor(half / 1000); km <= Math.floor(half / 1000); km++) {
    const p = Math.round((km * 1000 + half) / mPerPx);
    for (let i = 0; i < W; i++) {
      set(p, i, [255, 255, 255], km === 0 ? 0.6 : 0.3);
      set(i, W - 1 - p, [255, 255, 255], km === 0 ? 0.6 : 0.3);
    }
  }
  const toPx = (x: number, y: number) => [(x + half) / mPerPx, (half - y) / mPerPx] as const;
  for (const o of options.overlays ?? []) {
    const pts = o.closed ? [...o.points, o.points[0] as readonly [number, number]] : o.points;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = toPx(...(pts[i - 1] as readonly [number, number]));
      const [bx, by] = toPx(...(pts[i] as readonly [number, number]));
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let s = 0; s <= steps; s++) {
        const px = lerp(ax, bx, s / Math.max(1, steps));
        const py = lerp(ay, by, s / Math.max(1, steps));
        for (let ox = -1; ox <= 1; ox++)
          for (let oy = -1; oy <= 1; oy++) set(px + ox, Math.round(py) + oy, o.color);
      }
    }
    o.markers?.forEach(([mx, my], idx) => {
      const [px, py] = toPx(mx, my);
      const r = idx === 0 ? 6 : 4;
      for (let ox = -r; ox <= r; ox++) {
        for (let oy = -r; oy <= r; oy++) {
          if (ox * ox + oy * oy <= r * r)
            set(px + ox, Math.round(py) + oy, idx === 0 ? [255, 255, 255] : [20, 20, 20]);
        }
      }
    });
  }
  return PNG.sync.write(png);
}
