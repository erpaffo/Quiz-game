// 🕵️ L'Impostore: contratto server ↔ client.
// Telefono → SHOW_ACTION { payload: ImpostorAction } · TV ← show.state: ImpostorPublic · telefono ← me.show: ImpostorPrivate

import type { ShowFinal } from './shows';

export const IMPOSTOR = {
  ROUNDS: 3,
  SECRET_MS: 8_000,
  CLUE_MS: 40_000,
  DISCUSS_MS: 30_000,
  VOTE_MS: 20_000,
  GUESS_MS: 20_000,
  REVEAL_MS: 9_000,
  CLUE_MAX_CHARS: 20,
  /** A chi vota l'impostore. */
  CATCH_POINTS: 500,
  /** All'impostore se la fa franca, o se smascherato indovina la parola. */
  IMPOSTOR_POINTS: 1000,
  /** Alla squadra se l'impostore smascherato sbaglia la parola. */
  CREW_BONUS: 200
} as const;

export type ImpostorAction =
  | { type: 'clue'; text: string }
  /** Durante la discussione: "sono pronto a votare" (chiude prima se lo dicono tutti). */
  | { type: 'ready' }
  | { type: 'vote'; targetId: string }
  /** Solo l'impostore smascherato: prova a indovinare la parola segreta. */
  | { type: 'guess'; text: string };

export interface ImpostorClue {
  playerId: string;
  clue: string | null;
}

interface ImpostorHeader {
  round: number;
  total: number;
  category: string;
}

export type ImpostorPublic =
  | ({ step: 'secret' } & ImpostorHeader)
  | ({ step: 'clue'; submitted: string[] } & ImpostorHeader)
  | ({ step: 'discuss'; clues: ImpostorClue[]; ready: string[] } & ImpostorHeader)
  | ({ step: 'vote'; clues: ImpostorClue[]; voted: string[] } & ImpostorHeader)
  | ({ step: 'guess'; clues: ImpostorClue[]; impostorId: string } & ImpostorHeader)
  | ({
      step: 'reveal';
      word: string;
      impostorId: string;
      caught: boolean;
      /** Solo se smascherato: la parola tentata e se era giusta. */
      impostorGuess: string | null;
      guessedRight: boolean;
      votes: { playerId: string; targetId: string | null }[];
      points: Record<string, number>;
    } & ImpostorHeader)
  | ShowFinal;

export interface ImpostorPrivate {
  role: 'crew' | 'impostor' | null;
  /** La parola segreta (null per l'impostore, che vede solo la categoria). */
  word: string | null;
  myClue: string | null;
  myVote: string | null;
}
