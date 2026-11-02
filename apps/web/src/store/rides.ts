import { IdbRideStore, MemoryRideStore, type RideStore } from '@hrt/recorder';

/** Local ride storage (IndexedDB; in memory when IndexedDB is unavailable). */
export const rideStore: RideStore =
  typeof indexedDB !== 'undefined' ? new IdbRideStore() : new MemoryRideStore();
