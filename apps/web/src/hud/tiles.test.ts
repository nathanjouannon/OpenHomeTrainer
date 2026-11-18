import { describe, expect, it } from 'vitest';
import { zoneColor } from './colors';
import {
  DEFAULT_HUD_TILES,
  type HudTileId,
  moveHudTile,
  orderedForEditing,
  parseHudTiles,
  tilesOfRow,
  toggleHudTile,
} from './tiles';

describe('parseHudTiles', () => {
  it('drops unknown and duplicate ids, rejects non-lists', () => {
    expect(parseHudTiles(['power', 'nope', 'power', 3, 'hr'])).toEqual(['power', 'hr']);
    expect(parseHudTiles('power')).toBeNull();
    expect(parseHudTiles([])).toEqual([]);
  });
});

describe('tile editing', () => {
  it('hides and shows a tile back at its default place', () => {
    const hidden = toggleHudTile(DEFAULT_HUD_TILES, 'cadence');
    expect(hidden).not.toContain('cadence');
    expect(toggleHudTile(hidden, 'cadence')).toEqual([...DEFAULT_HUD_TILES]);
  });

  it('moves a tile within its row only', () => {
    const t: HudTileId[] = ['time', 'distance', 'power', 'hr'];
    expect(moveHudTile(t, 'distance', -1)).toEqual(['distance', 'time', 'power', 'hr']);
    expect(moveHudTile(t, 'distance', 1)).toEqual(t); // next top tile: none, power is bottom
    expect(moveHudTile(t, 'hr', -1)).toEqual(['time', 'distance', 'hr', 'power']);
    expect(moveHudTile(t, 'time', -1)).toEqual(t);
  });

  it('keeps the rows apart and lists hidden tiles last when editing', () => {
    const t: HudTileId[] = ['hr', 'time', 'power'];
    expect(tilesOfRow(t, 'top')).toEqual(['time']);
    expect(tilesOfRow(t, 'bottom')).toEqual(['hr', 'power']);
    expect(orderedForEditing(t).slice(0, 3)).toEqual(t);
    expect(orderedForEditing(t)).toHaveLength(DEFAULT_HUD_TILES.length);
  });
});

describe('zoneColor', () => {
  it('gives six distinct colours per mode', () => {
    for (const mode of ['default', 'redGreen', 'blueYellow'] as const) {
      const colours = [0.3, 0.6, 0.8, 1, 1.1, 1.5].map((f) => zoneColor(f * 200, 200, mode));
      expect(new Set(colours).size).toBe(6);
    }
  });
});
