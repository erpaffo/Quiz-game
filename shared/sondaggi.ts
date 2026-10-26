// ⛏️ Miniera dei Sondaggi (ispirato a The Poll Mine): contratto server ↔ client.
// Telefono → SHOW_ACTION { payload: SondaggiAction } · TV ← show.state: SondaggiPublic · telefono ← me.show: SondaggiPrivate

import type { ShowFinal } from './shows';

export const SONDAGGI = {
  ROUNDS: 4,
  POLL_MS: 25_000,
  GUESS_MS: 25_000,
  REVEAL_MS: 9_000,
  OPTIONS: 8,
  /** Quante opzioni si scelgono (in ordine di preferenza nel sondaggio). */
  PICKS: 3,
  /** Peso nel sondaggio della 1ª, 2ª e 3ª scelta. */
  WEIGHTS: [3, 2, 1],
  /** Punti per aver indovinato la 1ª, 2ª o 3ª opzione della top 3 del gruppo. */
  RANK_POINTS: [300, 200, 100]
} as const;

/** `options`: indici (0–7) distinti, esattamente SONDAGGI.PICKS. Nel sondaggio l'ordine conta, nell'ipotesi no. */
export type SondaggiAction = { type: 'poll'; options: number[] } | { type: 'guess'; options: number[] };

interface SondaggiHeader {
  number: number;
  total: number;
  question: string;
  options: string[];
}

export type SondaggiPublic =
  | ({ step: 'poll'; submitted: string[] } & SondaggiHeader)
  | ({ step: 'guess'; submitted: string[] } & SondaggiHeader)
  | ({
      step: 'reveal';
      /** Tutte le opzioni dalla più votata (score = somma dei pesi). */
      ranking: { index: number; score: number }[];
      /** Indici della top 3 del gruppo. */
      top: number[];
      results: { playerId: string; guess: number[] | null; points: number }[];
    } & SondaggiHeader)
  | ShowFinal;

export interface SondaggiPrivate {
  myPoll: number[] | null;
  myGuess: number[] | null;
}
