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

/** Dove il mazzo ricorda le chiavi delle carte già uscite (es. localStorage). */
export interface SeenStore {
  get(): string[];
  set(keys: string[]): void;
}

/** Chiave stabile di una carta: testo minuscolo, senza accenti né punteggiatura (non dipende dalla posizione). */
export function normKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const defaultKey = (c: unknown) => normKey(typeof c === 'string' ? c : JSON.stringify(c));

/**
 * Mazzo di carte: pesca senza ripetizioni finché non finisce, poi rimescola
 * (le ultime N carte uscite, N = min(10, 25% del mazzo), tornano solo in fondo).
 * Con `seen` ricorda le carte uscite anche tra una partita e l'altra; chiavi non più nel mazzo sono ignorate.
 */
export class Deck<T> {
  private pile: T[] = [];
  private seen: string[];

  constructor(
    private readonly cards: readonly T[],
    private readonly rng: Rng,
    private readonly store?: SeenStore,
    private readonly keyOf: (card: T) => string = defaultKey
  ) {
    if (cards.length === 0) throw new Error('Mazzo vuoto');
    const live = new Set(cards.map(keyOf));
    this.seen = (store?.get() ?? []).filter((k) => live.has(k));
  }

  draw(): T {
    if (this.pile.length === 0) this.refill();
    const card = this.pile.pop()!;
    this.seen.push(this.keyOf(card));
    this.store?.set(this.seen);
    return card;
  }

  private refill() {
    const seen = new Set(this.seen);
    const fresh = this.cards.filter((c) => !seen.has(this.keyOf(c)));
    if (fresh.length > 0) {
      this.pile = shuffle(this.rng, fresh);
      return;
    }
    // ciclo finito: si ricomincia, ma le ultime uscite vanno in fondo al nuovo mazzo (la pila si pesca dalla fine)
    const n = this.cards.length > 1 ? Math.min(10, Math.max(1, Math.floor(this.cards.length / 4))) : 0;
    const recent = new Set(this.seen.slice(-n));
    const isRecent = (c: T) => recent.has(this.keyOf(c));
    this.pile = [...shuffle(this.rng, this.cards.filter(isRecent)), ...shuffle(this.rng, this.cards.filter((c) => !isRecent(c)))];
    this.seen = [];
  }

  get size() {
    return this.cards.length;
  }
}
