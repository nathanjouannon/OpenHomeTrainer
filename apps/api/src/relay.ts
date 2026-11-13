// Rooms of the smartphone remote: one game ("host") and any number of phones
// ("remote") share a room identifier. The relay forwards what a phone presses
// to the games of its room, and the game's notices to the phones.

import { parseNotice, parsePhoneMessage, ROOM_ID_PATTERN } from '@hrt/controls';

export interface Peer {
  send(data: string): void;
  close(): void;
}

export type Role = 'host' | 'remote';

interface Room {
  hosts: Map<string, Peer>;
  remotes: Map<string, Peer>;
}

export interface RelayOptions {
  /** More rooms than this are refused (a home network has one rider). */
  maxRooms?: number;
  maxPeersPerRoom?: number;
}

export class RoomRelay {
  private readonly rooms = new Map<string, Room>();
  private nextId = 1;
  private readonly maxRooms: number;
  private readonly maxPeersPerRoom: number;

  constructor(opts: RelayOptions = {}) {
    this.maxRooms = opts.maxRooms ?? 8;
    this.maxPeersPerRoom = opts.maxPeersPerRoom ?? 8;
  }

  get roomCount() {
    return this.rooms.size;
  }

  /**
   * Adds a peer. Returns the function to call when it disconnects and the one
   * to call for each message it sends, or null when the join is refused.
   */
  join(
    roomId: string,
    role: Role,
    peer: Peer,
  ): { id: string; onMessage: (raw: string) => void; leave: () => void } | null {
    if (!ROOM_ID_PATTERN.test(roomId)) return null;
    let room = this.rooms.get(roomId);
    if (!room) {
      if (this.rooms.size >= this.maxRooms) return null;
      room = { hosts: new Map(), remotes: new Map() };
      this.rooms.set(roomId, room);
    }
    if (room.hosts.size + room.remotes.size >= this.maxPeersPerRoom) return null;

    const id = String(this.nextId++);
    const mine = role === 'host' ? room.hosts : room.remotes;
    mine.set(id, peer);
    this.announce(room);

    const onMessage = (raw: string) => {
      if (raw.length > 256) return;
      if (role === 'remote') {
        const msg = parsePhoneMessage(raw);
        if (!msg) return;
        const out = JSON.stringify({ ...msg, r: id });
        for (const h of room.hosts.values()) h.send(out);
      } else {
        const msg = parseNotice(raw);
        if (!msg) return;
        const out = JSON.stringify(msg);
        for (const r of room.remotes.values()) r.send(out);
      }
    };

    const leave = () => {
      if (mine.get(id) !== peer) return;
      mine.delete(id);
      if (role === 'remote') {
        const out = JSON.stringify({ t: 'left', r: id });
        for (const h of room.hosts.values()) h.send(out);
      }
      if (room.hosts.size + room.remotes.size === 0) this.rooms.delete(roomId);
      else this.announce(room);
    };

    return { id, onMessage, leave };
  }

  /** Tells each side how many of the other side are there. */
  private announce(room: Room) {
    const toHosts = JSON.stringify({ t: 'peers', remotes: room.remotes.size });
    const toRemotes = JSON.stringify({ t: 'peers', hosts: room.hosts.size });
    for (const h of room.hosts.values()) h.send(toHosts);
    for (const r of room.remotes.values()) r.send(toRemotes);
  }
}
