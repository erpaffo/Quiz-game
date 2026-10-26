// 🔍 Il Colpevole (ispirato a Suspectives): contratto server ↔ client.
// Telefono → SHOW_ACTION { payload: ColpevoleAction } · TV ← show.state: ColpevolePublic · telefono ← me.show: ColpevolePrivate
//
// Tutti rispondono a un sondaggio a 2 opzioni. In ogni caso un giocatore è il colpevole: può falsificare
// UNA sua risposta nel tabellone pubblico. Gli indizi rivelano le risposte VERE del colpevole: chi ha
// falsificato la domanda giusta sembra innocente. Alibi, poi accusa.

import type { ShowFinal } from './shows';

export const COLPEVOLE = {
  CASES: 2,
  QUESTIONS: 6,
  CLUES: 3,
  SURVEY_MS: 45_000,
  ROLE_MS: 12_000,
  CLUE_MS: 9_000,
  ALIBI_MS: 35_000,
  VOTE_MS: 25_000,
  REVEAL_MS: 10_000,
  ALIBI_MAX: 80,
  /** A chi vota il colpevole. */
  CATCH_POINTS: 500,
  /** A tutti gli investigatori se la maggioranza lo smaschera. */
  TEAM_BONUS: 300,
  /** Al colpevole se la fa franca. */
  ESCAPE_POINTS: 1500,
  /** Al colpevole, per ogni voto finito su un innocente. */
  MISLEAD_POINTS: 200
} as const;

export type ColpevoleAction =
  /** Risposte al sondaggio: un indice (0 o 1) per ognuna delle QUESTIONS domande. */
  | { type: 'survey'; answers: number[] }
  /** Solo il colpevole, solo nel passo role: inverte la sua risposta pubblica a quella domanda. */
  | { type: 'falsify'; questionIndex: number }
  | { type: 'alibi'; text: string }
  | { type: 'vote'; targetId: string };

export interface ColpevoleQuestion {
  text: string;
  options: [string, string];
}

/** «Il colpevole ha risposto options[answer] a questions[questionIndex]». */
export interface ColpevoleClue {
  questionIndex: number;
  answer: number;
}

interface ColpevoleCase {
  case: number;
  cases: number;
  questions: ColpevoleQuestion[];
  /** Tabellone pubblico: le risposte di tutti (quella falsificata compresa). */
  board: { playerId: string; answers: number[] }[];
  clues: ColpevoleClue[];
  /** Chi, secondo il tabellone, combacia con tutti gli indizi finora. */
  suspects: string[];
}

export type ColpevolePublic =
  | { step: 'survey'; questions: ColpevoleQuestion[]; submitted: string[] }
  | { step: 'role'; case: number; cases: number }
  | ({ step: 'clue' } & ColpevoleCase)
  | ({ step: 'alibi'; submitted: string[] } & ColpevoleCase)
  | ({ step: 'vote'; alibis: { playerId: string; text: string | null }[]; voted: string[] } & ColpevoleCase)
  | ({
      step: 'reveal';
      culpritId: string;
      /** La domanda falsificata dal colpevole (null se non ha barato). */
      falsified: number | null;
      caught: boolean;
      votes: { playerId: string; targetId: string | null }[];
      points: Record<string, number>;
    } & ColpevoleCase)
  | ShowFinal;

export interface ColpevolePrivate {
  role: 'culprit' | 'detective' | null;
  /** Le mie risposte vere al sondaggio. */
  myAnswers: number[] | null;
  /** Colpevole nel passo role: può ancora falsificare. */
  canFalsify: boolean;
  falsified: number | null;
  myAlibi: string | null;
  myVote: string | null;
}
