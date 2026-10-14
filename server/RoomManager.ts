import type { PackStore } from './PackStore';
import { Room, type IO } from './Room';
import { randomId } from './util';

// Niente I/O per evitare equivoci quando il codice viene letto sullo schermo.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ABANDONED_AFTER_MS = 10 * 60_000;

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private readonly io: IO, private readonly packs: PackStore, private readonly speed = 1) {
    setInterval(() => this.sweep(), 60_000).unref();
    // Pacchetti modificati dal Laboratorio o dal telefono: le lobby aperte vedono subito i numeri aggiornati.
    packs.onChange(() => {
      for (const room of this.rooms.values()) if (room.phase === 'LOBBY') room.broadcast();
    });
  }

  create(): Room {
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(this.io, code, randomId('host'), this.packs, this.speed);
    this.rooms.set(code, room);
    console.log(`[stanza ${code}] creata`);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(String(code ?? '').trim().toUpperCase());
  }

  private sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.isAbandoned(now, ABANDONED_AFTER_MS)) {
        room.destroy();
        this.rooms.delete(code);
        console.log(`[stanza ${code}] chiusa per inattività`);
      }
    }
  }
}
