// 🕰️ Macchina del Tempo: contratto condiviso tra server (server/shows/tempo) e client.
// Il telefono invia SHOW_ACTION { payload: TempoAction }; la TV legge RoomSnapshot.show.state (TempoPublic),
// il telefono legge anche RoomSnapshot.me.show (TempoPrivate).

export const TEMPO = {
  ROUNDS: 8,
  MIN_YEAR: 1000,
  MAX_YEAR: 2026,
  QUESTION_MS: 20_000,
  REVEAL_MS: 7_000,
  FINAL_MS: 15_000,
  /** Punti di una risposta: MAX_POINTS - errore in anni (mai sotto zero). */
  MAX_POINTS: 100,
  /** Bonus per l'anno esatto (si somma a MAX_POINTS). */
  EXACT_BONUS: 50
} as const;

export type TempoAction = { type: 'year'; value: number };

export interface TempoGuess {
  playerId: string;
  year: number | null;
  /** Distanza in anni dalla risposta giusta (null = nessuna risposta). */
  error: number | null;
  points: number;
}

export interface TempoRanking {
  playerId: string;
  points: number;
  /** Somma degli errori in anni (le domande senza risposta contano TEMPO.MAX_POINTS). */
  totalError: number;
  exact: number;
}

export type TempoPublic =
  | { step: 'question'; number: number; total: number; event: string; answered: number }
  | { step: 'reveal'; number: number; total: number; event: string; year: number; guesses: TempoGuess[] }
  | { step: 'final'; ranking: TempoRanking[] };

export interface TempoPrivate {
  /** L'anno scelto per la domanda corrente (null = non ancora risposto). */
  myYear: number | null;
}

/** Punti per una risposta: più ti avvicini più guadagni; l'anno esatto vale il bonus. */
export function tempoPoints(error: number | null): number {
  if (error === null) return 0;
  if (error === 0) return TEMPO.MAX_POINTS + TEMPO.EXACT_BONUS;
  return Math.max(0, TEMPO.MAX_POINTS - error);
}
