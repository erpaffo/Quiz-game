// Regole di «Parola in Fronte»: un turno = una serie di parole pescate dal mazzo, ognuna indovinata o passata.

import { FRONTE_CARDS, type FronteCard } from '../data/fronte';
import { Deck, type Rng } from '../rng';
import type { Player } from '../types';

export interface FronteResult {
  word: string;
  ok: boolean;
  /** Il narratore ha detto una parola vietata (solo modalità Tabù). */
  taboo?: boolean;
}

export function fronteDeck(pack: string, rng: Rng): Deck<FronteCard> {
  const cards = pack === 'mix' ? FRONTE_CARDS : FRONTE_CARDS.filter((c) => c.pack === pack);
  return new Deck(cards.length ? cards : FRONTE_CARDS, rng);
}

/** Ordine dei turni: ognuno, nell'ordine del tavolo, ripetuto `turnsEach` volte. */
export function frontePlan(players: Player[], turnsEach: number): Player[] {
  const out: Player[] = [];
  for (let t = 0; t < Math.max(1, turnsEach); t++) out.push(...players);
  return out;
}

export class FronteTurn {
  readonly results: FronteResult[] = [];
  current: FronteCard;

  constructor(private readonly deck: Deck<FronteCard>) {
    this.current = deck.draw();
  }

  /** Indovinata (true) o passata (false): si registra e si pesca la prossima. */
  answer(ok: boolean) {
    this.results.push({ word: this.current.word, ok });
    this.current = this.deck.draw();
  }

  /** Tabù: il narratore ha detto una parola vietata. La carta si scarta e costa un punto. */
  taboo() {
    this.results.push({ word: this.current.word, ok: false, taboo: true });
    this.current = this.deck.draw();
  }

  /** Correzione dal riepilogo (tocco sbagliato): inverte indovinata/passata. Le carte Tabù restano Tabù. */
  toggle(index: number) {
    const r = this.results[index];
    if (r && !r.taboo) r.ok = !r.ok;
  }

  get correct() {
    return this.results.filter((r) => r.ok).length;
  }

  get tabooHits() {
    return this.results.filter((r) => r.taboo).length;
  }

  /** Punti del turno: indovinate meno parole vietate, mai sotto zero. */
  get score() {
    return Math.max(0, this.correct - this.tabooHits);
  }
}
