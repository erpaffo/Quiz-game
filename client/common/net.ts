import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/events';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(): GameSocket {
  return io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 2000 });
}

/** Orologio allineato al server: i timer si basano su `endsAt` (ora del server). */
export const clock = {
  offset: 0,
  initialized: false,
  divergenceCount: 0,
  sync(serverNow: number) {
    const sample = serverNow - Date.now();
    if (!this.initialized) {
      this.offset = sample;
      this.initialized = true;
      this.divergenceCount = 0;
      return;
    }
    const diff = Math.abs(sample - this.offset);
    if (diff > 1500) {
      this.divergenceCount++;
      if (this.divergenceCount > 3) {
        this.offset = sample;
        this.divergenceCount = 0;
      }
    } else {
      this.divergenceCount = 0;
      this.offset = this.offset * 0.8 + sample * 0.2;
    }
  },
  now() {
    return Date.now() + this.offset;
  },
  remaining(endsAt: number | null) {
    return endsAt === null ? null : Math.max(0, endsAt - this.now());
  }
};

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

export const OPTION_COLORS = ['#3a86ff', '#fb8500', '#2a9d8f', '#e9a800'];
export const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
export const PLAYER_COLORS = [
  '#ff4d6d', '#4cc9f0', '#ffd60a', '#7bd389', '#c77dff', '#ff9f1c', '#f15bb5', '#00bbf9',
  '#b5e48c', '#e76f51', '#9b5de5', '#2ec4b6', '#fee440', '#ff006e', '#8ecae6', '#cdb4db'
];
/** Forma del giocatore (stesso indice del colore): chi non distingue i colori riconosce comunque la propria. */
export const PLAYER_SHAPES = ['●', '▲', '■', '◆', '★', '♥', '♣', '♠'];
export const playerShape = (index: number) => PLAYER_SHAPES[Math.max(0, index) % PLAYER_SHAPES.length];
