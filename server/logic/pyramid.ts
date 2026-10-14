import { CONFIG } from '../../shared/config';
import type { AnswerResult, PyramidMove } from '../../shared/types';

/** Il gradino di partenza è proporzionale al punteggio: il primo parte da PYRAMID_MAX_START. */
export function startingSteps(players: { id: string; score: number }[]): Map<string, number> {
  const max = Math.max(0, ...players.map((p) => p.score));
  return new Map(players.map((p) => [p.id, max > 0 ? Math.floor((CONFIG.PYRAMID_MAX_START * p.score) / max) : 0]));
}

/** Risposta giusta: +1 gradino. Il più veloce tra chi ha risposto giusto: +2. */
export function pyramidMoves(results: AnswerResult[], positions: Map<string, number>, steps: number): PyramidMove[] {
  const correct = results.filter((r) => r.correct && r.timeMs !== null).sort((a, b) => a.timeMs! - b.timeMs!);
  const fastest = correct[0]?.playerId;
  return correct.map((r) => {
    const from = positions.get(r.playerId) ?? 0;
    return { playerId: r.playerId, from, to: Math.min(steps, from + (r.playerId === fastest ? 2 : 1)) };
  });
}
