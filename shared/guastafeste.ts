// 💥 Guastafeste (ispirato a Doominate): contratto server ↔ client.
// Telefono → SHOW_ACTION { payload: GuastaAction } · TV ← show.state: GuastaPublic · telefono ← me.show: GuastaPrivate

import type { ShowFinal } from './shows';

export const GUASTA = {
  ROUNDS: 3,
  ROUND_NAMES: ['Rovina!', 'Il tuo preferito', 'Ripara!'],
  FAVORITE_MS: 30_000,
  WRITE_MS: 75_000,
  VOTE_MS: 15_000,
  RESULT_MS: 6_000,
  MAX_CHARS: 90,
  /** Punti per voto ricevuto (× numero del round). */
  POINTS_PER_VOTE: 100,
  /** Bonus se prendi tutti i voti (almeno 2 votanti), × numero del round. */
  SWEEP_BONUS: 250,
  /** Testo mostrato al posto di una risposta mancante. */
  NO_ANSWER: '(nessuna risposta)'
} as const;

export type GuastaAction =
  /** Round 2: la cosa che ami (che gli altri dovranno rovinare). */
  | { type: 'favorite'; text: string }
  | { type: 'answer'; promptId: string; text: string }
  /** 0 = prima risposta, 1 = seconda. */
  | { type: 'vote'; side: number };

interface GuastaHeader {
  round: number;
  total: number;
  roundName: string;
}

export type GuastaPublic =
  | ({ step: 'favorite'; submitted: string[] } & GuastaHeader)
  /** `submitted`: chi ha risposto a tutti i suoi temi. */
  | ({ step: 'write'; submitted: string[] } & GuastaHeader)
  | ({
      step: 'vote';
      index: number;
      count: number;
      prompt: string;
      /** Anonime durante il voto. */
      answers: [string, string];
      /** Chi è in sfida (non vota). */
      contenders: [string, string];
      voted: string[];
    } & GuastaHeader)
  | ({
      step: 'result';
      index: number;
      count: number;
      prompt: string;
      answers: { playerId: string; text: string; votes: number; points: number }[];
      sweep: boolean;
    } & GuastaHeader)
  | ShowFinal;

export interface GuastaPrivate {
  /** I miei temi del round (passo write). */
  prompts: { id: string; text: string; answer: string | null }[];
  favorite: string | null;
  /** Nel passo vote: sono in sfida (quindi non voto). */
  contender: boolean;
  myVote: number | null;
}
