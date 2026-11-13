// Loads the ghost chosen on the route screen (lot 3.6) from the stored rides.

import type { RideHeader } from '@hrt/recorder';
import { rideStore } from '../store/rides';
import { BEST_LAP_GHOST, bestLapRide, type Ghost, ghostFromBestLap, ghostFromRide } from './ghost';

const dateLabel = (h: RideHeader, language: 'fr' | 'en') =>
  new Date(h.startedAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB');

/** `id` is `BEST_LAP_GHOST` or the id of a stored ride; null when it cannot be raced. */
export async function loadGhost(
  routeId: string,
  id: string,
  language: 'fr' | 'en',
): Promise<Ghost | null> {
  try {
    if (id === BEST_LAP_GHOST) {
      const header = bestLapRide(await rideStore.listHeaders(), routeId);
      if (!header) return null;
      return ghostFromBestLap(
        header,
        await rideStore.getSamples(header.id),
        dateLabel(header, language),
      );
    }
    const header = await rideStore.getHeader(id);
    if (!header || header.route?.id !== routeId) return null;
    return ghostFromRide(await rideStore.getSamples(id), dateLabel(header, language));
  } catch {
    return null;
  }
}
