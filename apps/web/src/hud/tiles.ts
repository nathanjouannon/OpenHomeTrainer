// Configurable HUD tiles (lot 3.12): which tiles are shown and in which order.
// Context tiles (lap, ghost, ERG target, segment, workout) stay automatic.

export type HudTileId =
  | 'time'
  | 'distance'
  | 'ascent'
  | 'power'
  | 'wkg'
  | 'cadence'
  | 'hr'
  | 'speed'
  | 'gear';

/** Every configurable tile, in default order, with the HUD row it lives in. */
export const HUD_TILE_CATALOG: readonly { id: HudTileId; row: 'top' | 'bottom' }[] = [
  { id: 'time', row: 'top' },
  { id: 'distance', row: 'top' },
  { id: 'ascent', row: 'top' },
  { id: 'power', row: 'bottom' },
  { id: 'wkg', row: 'bottom' },
  { id: 'cadence', row: 'bottom' },
  { id: 'hr', row: 'bottom' },
  { id: 'speed', row: 'bottom' },
  { id: 'gear', row: 'bottom' },
];

const IDS = new Set<string>(HUD_TILE_CATALOG.map((t) => t.id));

export const DEFAULT_HUD_TILES: readonly HudTileId[] = HUD_TILE_CATALOG.map((t) => t.id);

/** A saved list cleaned up: unknown and duplicate ids dropped; null when it is not a list. */
export function parseHudTiles(v: unknown): HudTileId[] | null {
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  const out: HudTileId[] = [];
  for (const id of v) {
    if (typeof id === 'string' && IDS.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id as HudTileId);
    }
  }
  return out;
}

/** The shown tiles of one row, in the saved order. */
export const tilesOfRow = (tiles: readonly HudTileId[], row: 'top' | 'bottom'): HudTileId[] =>
  tiles.filter((id) => HUD_TILE_CATALOG.find((t) => t.id === id)?.row === row);

/** Every tile in display order for the settings list: shown ones first, then hidden ones. */
export const orderedForEditing = (tiles: readonly HudTileId[]): HudTileId[] => [
  ...tiles,
  ...DEFAULT_HUD_TILES.filter((id) => !tiles.includes(id)),
];

export function toggleHudTile(tiles: readonly HudTileId[], id: HudTileId): HudTileId[] {
  if (tiles.includes(id)) return tiles.filter((t) => t !== id);
  // A tile shown again goes back to its default place among the shown ones.
  const rank = (t: HudTileId) => DEFAULT_HUD_TILES.indexOf(t);
  const at = tiles.findIndex((t) => rank(t) > rank(id));
  return at === -1 ? [...tiles, id] : [...tiles.slice(0, at), id, ...tiles.slice(at)];
}

/** Moves a shown tile one step earlier (-1) or later (+1) among the shown tiles of its row. */
export function moveHudTile(tiles: readonly HudTileId[], id: HudTileId, dir: -1 | 1): HudTileId[] {
  const i = tiles.indexOf(id);
  if (i === -1) return [...tiles];
  const row = HUD_TILE_CATALOG.find((t) => t.id === id)?.row;
  let j = i + dir;
  while (
    j >= 0 &&
    j < tiles.length &&
    tilesOfRow([tiles[j] as HudTileId], row ?? 'top').length === 0
  ) {
    j += dir;
  }
  if (j < 0 || j >= tiles.length) return [...tiles];
  const next = [...tiles];
  [next[i], next[j]] = [next[j] as HudTileId, next[i] as HudTileId];
  return next;
}
