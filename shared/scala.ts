// 📊 Scala del Nonsenso (ispirato a Nonsensory): contratto server ↔ client.
// Telefono → SHOW_ACTION { payload: ScalaAction } · TV ← show.state: ScalaPublic · telefono ← me.show: ScalaPrivate

import type { ShowFinal } from './shows';

export const SCALA = {
  ROUNDS: 2,
  WRITE_MS: 60_000,
  GUESS_MS: 15_000,
  REVEAL_MS: 6_000,
  MAX_CHARS: 80,
  MIN: 1,
  MAX: 10,
  /** Punti di chi indovina in base alla distanza dal numero (o dall'intervallo): 0, 1, 2. */
  GUESS_POINTS: [300, 150, 50]
} as const;

export type ScalaAction = { type: 'answer'; text: string } | { type: 'guess'; value: number };

/** Il segreto di un autore: un numero (round 1) o un intervallo di 3 numeri (round 2). */
export type ScalaTarget = { lo: number; hi: number };

export interface ScalaTheme {
  /** Es. "Una scusa per arrivare in ritardo". */
  text: string;
  /** Cosa misura la scala, es. "credibile". */
  scale: string;
}

export type ScalaPublic =
  | { step: 'write'; round: number; total: number; submitted: string[] }
  | {
      step: 'guess';
      round: number;
      total: number;
      authorId: string;
      theme: ScalaTheme;
      answer: string;
      /** Risposta n. index su count del round. */
      index: number;
      count: number;
      guessed: string[];
    }
  | {
      step: 'reveal';
      round: number;
      total: number;
      authorId: string;
      theme: ScalaTheme;
      answer: string;
      index: number;
      count: number;
      target: ScalaTarget;
      guesses: { playerId: string; value: number | null; points: number }[];
      authorPoints: number;
    }
  | ShowFinal;

export interface ScalaPrivate {
  /** Il mio tema e il mio segreto (solo nel passo di scrittura). */
  theme: ScalaTheme | null;
  target: ScalaTarget | null;
  myAnswer: string | null;
  /** Nel passo guess: il mio voto, e se la risposta in gioco è la mia (allora non voto). */
  myGuess: number | null;
  isAuthor: boolean;
}

/** Punti di un tentativo: distanza dal numero/intervallo segreto. */
export function scalaPoints(value: number | null, target: ScalaTarget): number {
  if (value === null) return 0;
  const dist = value < target.lo ? target.lo - value : value > target.hi ? value - target.hi : 0;
  return SCALA.GUESS_POINTS[dist] ?? 0;
}
