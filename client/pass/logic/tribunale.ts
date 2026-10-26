// Regole di «Il Tribunale degli Amici»: il giudice prevede il verdetto, il tavolo indica.

import type { Player } from '../types';

/** Giudici, a rotazione, per `questions` domande. */
export function tribunaleJudges(players: Player[], questions: number): Player[] {
  return Array.from({ length: Math.max(1, questions) }, (_, i) => players[i % players.length]);
}

/**
 * Punti di una domanda.
 * - Il giudice che aveva previsto uno dei più indicati: +2.
 * - Plebiscito (tutti hanno indicato la stessa persona): +1 a tutti.
 */
export function tribunalePoints(players: Player[], judgeId: string, prediction: string, selected: string[], unanimous: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string, n: number) => (out[id] = (out[id] ?? 0) + n);
  if (selected.includes(prediction)) add(judgeId, 2);
  if (unanimous && selected.length === 1) for (const p of players) add(p.id, 1);
  return out;
}
