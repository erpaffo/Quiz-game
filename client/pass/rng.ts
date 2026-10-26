// Casualità «controllabile»: nel gioco vero usa Math.random, nei test un seme fisso (risultati ripetibili).

export type Rng = () => number;

/** Generatore pseudo-casuale con seme (mulberry32): stessa sequenza a ogni esecuzione. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

export function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Mazzo di carte: pesca senza ripetizioni finché non finisce, poi rimescola
 * (evitando che l'ultima carta uscita sia di nuovo la prima).
 */
export class Deck<T> {
  private pile: T[] = [];
  private last: T | undefined;

  constructor(
    private readonly cards: readonly T[],
    private readonly rng: Rng
  ) {
    if (cards.length === 0) throw new Error('Mazzo vuoto');
  }

  draw(): T {
    if (this.pile.length === 0) {
      this.pile = shuffle(this.rng, this.cards);
      if (this.pile.length > 1 && this.pile[this.pile.length - 1] === this.last) this.pile.unshift(this.pile.pop()!);
    }
    this.last = this.pile.pop()!;
    return this.last;
  }

  get size() {
    return this.cards.length;
  }
}
