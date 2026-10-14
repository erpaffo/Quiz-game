import { CONFIG } from '../../shared/config';
import { clamp } from '../util';

/** Risposta corretta: da 500 (allo scadere) a 1000 punti (istantanea). Sbagliata o assente: 0. */
export function answerPoints(correct: boolean, timeMs: number | null, durationMs: number): number {
  if (!correct || timeMs === null) return 0;
  const speed = clamp(1 - timeMs / durationMs, 0, 1);
  return Math.round(CONFIG.SCORE_MIN_CORRECT + (CONFIG.SCORE_MAX_CORRECT - CONFIG.SCORE_MIN_CORRECT) * speed);
}

/** Classifica "da competizione": a pari punteggio, pari posizione (1, 2, 2, 4). */
export function computeRanks(players: { id: string; score: number }[]): Map<string, number> {
  const sorted = players.slice().sort((a, b) => b.score - a.score);
  const ranks = new Map<string, number>();
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    ranks.set(p.id, prev && prev.score === p.score ? ranks.get(prev.id)! : i + 1);
  });
  return ranks;
}
