// 🗂️ Smistatori (ispirato a Idol Factions): contratto server ↔ client.
// Telefono → SHOW_ACTION { payload: SmistAction } · TV ← show.state: SmistPublic · telefono ← me.show: SmistPrivate
//
// Due squadre smistano le STESSE parole nello stesso ordine tra due categorie (sinistra/destra).
// Ogni parola arriva sul telefono di un solo membro della squadra, a turno: gli altri suggeriscono a voce.

import type { ShowFinal } from './shows';

export const SMIST = {
  ROUNDS: 3,
  TEAMS_MS: 7_000,
  ROUND_MS: 45_000,
  RESULT_MS: 7_000,
  RIGHT: 100,
  WRONG: -50,
  /** Dalla STREAK-esima risposta giusta di fila i punti valgono ×STREAK_MULT. */
  STREAK: 5,
  STREAK_MULT: 2,
  /** A ogni membro della squadra che vince il round. */
  WIN_BONUS: 200,
  /** Quanti smistamenti recenti mostra la TV. */
  FEED: 6
} as const;

export type SmistTeam = 'A' | 'B';
export type SmistSide = 'left' | 'right';

export type SmistAction = { type: 'sort'; wordId: string; side: SmistSide };

export interface SmistTeamState {
  members: string[];
  score: number;
  streak: number;
  /** Parole smistate nel round / totale. */
  done: number;
  total: number;
  /** Chi ha la parola adesso. */
  assignee: string | null;
}

export type SmistPublic =
  | { step: 'teams'; teams: Record<SmistTeam, string[]> }
  | {
      step: 'round';
      round: number;
      total: number;
      left: string;
      right: string;
      teams: Record<SmistTeam, SmistTeamState>;
      feed: { team: SmistTeam; playerId: string; word: string; side: SmistSide; correct: boolean }[];
    }
  | {
      step: 'result';
      round: number;
      total: number;
      left: string;
      right: string;
      teams: Record<SmistTeam, SmistTeamState>;
      /** null = pareggio. */
      winner: SmistTeam | null;
    }
  | ShowFinal;

export interface SmistPrivate {
  team: SmistTeam | null;
  /** La parola da smistare, solo se tocca a me. */
  word: { id: string; text: string } | null;
  left: string | null;
  right: string | null;
}
