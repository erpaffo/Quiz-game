// Memoria del telefono (localStorage): giocatori al tavolo, nomi usati, Coppa del Tavolo, regole scelte.
// Se il browser non permette di salvare (navigazione privata), si usa una memoria temporanea: il gioco funziona lo stesso.

import { sanitizePassOptions } from './catalog';
import type { PassGameId, Player } from './types';

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Memoria di riserva quando localStorage non c'è o è bloccato. */
export class MemoryStore implements KeyValue {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

export function browserStore(): KeyValue {
  try {
    const ls = window.localStorage;
    const probe = '__sep_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return new MemoryStore();
  }
}

export const PLAYER_COLORS = ['#52d273', '#ff9f1c', '#c77dff', '#4cc9f0', '#ffd60a', '#ff4d6d', '#06d6a0', '#ff85a1', '#8ecae6', '#f4a261', '#b5e48c', '#e9c46a', '#a0c4ff', '#ffadad', '#cdb4db', '#90e0ef'];
export const MAX_PLAYERS = 16;
export const NAME_MAX = 14;

const K = {
  players: 'sep:pass:players',
  history: 'sep:pass:names',
  scores: 'sep:pass:scores',
  options: 'sep:pass:options'
};

function read<T>(kv: KeyValue, key: string, fallback: T): T {
  try {
    const raw = kv.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(kv: KeyValue, key: string, value: unknown) {
  try {
    kv.setItem(key, JSON.stringify(value));
  } catch {
    /* memoria piena o bloccata: pazienza, si gioca lo stesso */
  }
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** Stato persistente della serata. Ogni modifica viene salvata subito. */
export class PassStore {
  constructor(private readonly kv: KeyValue) {}

  // ---------------------------------------------------------------- giocatori

  players(): Player[] {
    const list = read<Player[]>(this.kv, K.players, []);
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string').slice(0, MAX_PLAYERS) : [];
  }

  private savePlayers(list: Player[]) {
    write(this.kv, K.players, list);
  }

  /** Aggiunge un giocatore. Restituisce un messaggio d'errore oppure null. */
  addPlayer(rawName: string): string | null {
    const name = cleanName(rawName);
    if (!name) return 'Scrivi un nome';
    const list = this.players();
    if (list.length >= MAX_PLAYERS) return `Al massimo ${MAX_PLAYERS} giocatori`;
    if (list.some((p) => p.name.toLowerCase() === name.toLowerCase())) return `«${name}» è già al tavolo`;
    const used = new Set(list.map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[list.length % PLAYER_COLORS.length];
    list.push({ id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, name, color });
    this.savePlayers(list);
    this.remember(name);
    return null;
  }

  removePlayer(id: string) {
    this.savePlayers(this.players().filter((p) => p.id !== id));
  }

  /** Sposta un giocatore di un posto nel giro (-1 = prima, +1 = dopo). */
  movePlayer(id: string, dir: -1 | 1) {
    const list = this.players();
    const i = list.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.savePlayers(list);
  }

  shufflePlayers(rng: () => number = Math.random) {
    const list = this.players();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    this.savePlayers(list);
  }

  /** Nomi usati nelle serate precedenti (per aggiungerli con un tocco). */
  history(): string[] {
    const h = read<string[]>(this.kv, K.history, []);
    return Array.isArray(h) ? h.filter((x) => typeof x === 'string').slice(0, 30) : [];
  }

  private remember(name: string) {
    const h = this.history().filter((x) => x.toLowerCase() !== name.toLowerCase());
    write(this.kv, K.history, [name, ...h].slice(0, 30));
  }

  forget(name: string) {
    write(this.kv, K.history, this.history().filter((x) => x !== name));
  }

  // ---------------------------------------------------------------- Coppa del Tavolo

  scores(): Record<string, number> {
    const s = read<Record<string, number>>(this.kv, K.scores, {});
    return s && typeof s === 'object' ? s : {};
  }

  addPoints(playerId: string, points: number) {
    if (!Number.isFinite(points) || points === 0) return;
    const s = this.scores();
    s[playerId] = Math.max(0, (s[playerId] ?? 0) + Math.round(points));
    write(this.kv, K.scores, s);
  }

  /** Classifica della serata: solo i giocatori ancora al tavolo, dal più alto. */
  standings(): { player: Player; points: number }[] {
    const s = this.scores();
    return this.players()
      .map((player) => ({ player, points: s[player.id] ?? 0 }))
      .sort((a, b) => b.points - a.points);
  }

  resetScores() {
    write(this.kv, K.scores, {});
  }

  // ---------------------------------------------------------------- regole scelte

  options(id: PassGameId): Record<string, string> {
    const all = read<Record<string, unknown>>(this.kv, K.options, {});
    return sanitizePassOptions(id, all?.[id]);
  }

  setOption(id: PassGameId, optionId: string, choice: string) {
    const all = read<Record<string, Record<string, string>>>(this.kv, K.options, {});
    const next = sanitizePassOptions(id, { ...(all[id] ?? {}), [optionId]: choice });
    write(this.kv, K.options, { ...all, [id]: next });
  }
}
