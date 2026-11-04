// Regole di «Lunghezza d'Onda»: bersaglio segreto tra 0 e 100, punti in base alla distanza dall'ago.

import { randInt, type Rng } from '../rng';
import type { Player } from '../types';

/** Bersaglio: mai attaccato ai bordi, così l'indizio ha senso. */
export function ondaTarget(rng: Rng): number {
  return randInt(rng, 6, 94);
}

/** 🎯 ±4 → 4 punti · 🟩 ±10 → 3 · 🟨 ±16 → 2 · altrimenti 0. */
export function ondaScore(needle: number, target: number): number {
  const d = Math.abs(needle - target);
  if (d <= 4) return 4;
  if (d <= 10) return 3;
  if (d <= 16) return 2;
  return 0;
}

/** Scommessa del vicino: il bersaglio è a sinistra o a destra dell'ago? (Centro perfetto = scommessa persa.) */
export function betWins(needle: number, target: number, bet: 'left' | 'right'): boolean {
  if (Math.abs(needle - target) <= 4) return false;
  return bet === 'left' ? target < needle : target > needle;
}

/** Ordine dei sensitivi: ognuno, `rounds` volte. */
export function ondaPlan(players: Player[], rounds: number): Player[] {
  const out: Player[] = [];
  for (let r = 0; r < Math.max(1, rounds); r++) out.push(...players);
  return out;
}
