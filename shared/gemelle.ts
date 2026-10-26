// 💞 Anime Gemelle (ispirato a MegaPals): contratto server ↔ client.
// Telefono → SHOW_ACTION { payload: GemelleAction } · TV ← show.state: GemellePublic · telefono ← me.show: GemellePrivate

import type { ShowFinal } from './shows';

export const GEMELLE = {
  ROUNDS: 4,
  WRITE_MS: 45_000,
  MATCHES_MS: 9_000,
  SOULMATES_MS: 8_000,
  MAX_WORDS: 15,
  WORD_MAX_CHARS: 24,
  /** Punti per ogni altro giocatore che ha scritto la tua stessa parola. */
  POINTS_PER_MATCH: 100
} as const;

export type GemelleAction =
  | { type: 'word'; text: string }
  | { type: 'removeWord'; text: string }
  /** "Ho finito": chiude il round in anticipo quando lo dicono tutti. */
  | { type: 'done' };

export interface GemelleSharedWord {
  /** Parola come l'ha scritta il primo giocatore. */
  word: string;
  /** Chi l'ha scritta (almeno 2 giocatori). */
  by: string[];
}

export type GemellePublic =
  | {
      step: 'write';
      round: number;
      total: number;
      prompt: string;
      /** Quante parole ha scritto ciascuno (le parole restano segrete fino alla fine del round). */
      counts: Record<string, number>;
      done: string[];
    }
  | {
      step: 'matches';
      round: number;
      total: number;
      prompt: string;
      /** Parole scritte da 2+ giocatori, dalla più condivisa. */
      shared: GemelleSharedWord[];
      /** Punti guadagnati in questo round. */
      points: Record<string, number>;
    }
  | {
      step: 'soulmates';
      /** Le coppie con più parole in comune in tutta la partita (pareggi inclusi). */
      pairs: { a: string; b: string; common: number }[];
    }
  | ShowFinal;

export interface GemellePrivate {
  /** Le mie parole del round corrente. */
  words: string[];
  done: boolean;
}
