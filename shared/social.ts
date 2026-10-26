// ⚖️ Chi di Noi?: contratto server ↔ client.
// Telefono → SHOW_ACTION { payload: SocialAction } · TV ← show.state: SocialPublic · telefono ← me.show: SocialPrivate
// Il telefono mostra i giocatori (con selfie/avatar) come bottoni di voto: votare se stessi è permesso.

import type { ShowFinal } from './shows';

export const SOCIAL = {
  ROUNDS: 8,
  VOTE_MS: 20_000,
  REVEAL_MS: 7_000,
  /** A chi ha votato uno dei più votati (serve una maggioranza: almeno 2 voti). */
  MAJORITY_POINTS: 300,
  /** Al più votato (o ai pari merito): "eletto dal divano". */
  CROWN_POINTS: 100
} as const;

export type SocialAction = { type: 'vote'; targetId: string };

export type SocialPublic =
  | { step: 'vote'; number: number; total: number; question: string; voted: string[] }
  | {
      step: 'reveal';
      number: number;
      total: number;
      question: string;
      votes: { playerId: string; targetId: string | null }[];
      /** I più votati (vuoto se nessuno ha almeno 2 voti). */
      winners: string[];
      points: Record<string, number>;
    }
  | ShowFinal;

export interface SocialPrivate {
  myVote: string | null;
}
