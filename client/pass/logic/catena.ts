// Regole di «Catena Scarabocchiata»: frase → disegno → titolo → disegno… un passo per giocatore.

import type { Player } from '../types';

export type ChainKind = 'phrase' | 'draw' | 'guess';

export interface ChainStep {
  kind: ChainKind;
  playerId: string;
  /** Testo (frase o titolo) oppure immagine del disegno (data URL). Vuoto = saltato / tempo scaduto. */
  content: string;
}

/** Tipo del passo n: il primo è la frase, poi si alterna disegno e titolo. */
export function chainKind(index: number): ChainKind {
  if (index === 0) return 'phrase';
  return index % 2 === 1 ? 'draw' : 'guess';
}

export class CatenaChain {
  readonly steps: ChainStep[] = [];

  constructor(readonly players: Player[]) {
    if (players.length < 3) throw new Error('Servono almeno 3 giocatori');
  }

  get length(): number {
    return this.players.length;
  }

  get complete(): boolean {
    return this.steps.length >= this.length;
  }

  get currentKind(): ChainKind {
    return chainKind(this.steps.length);
  }

  get currentPlayer(): Player {
    return this.players[this.steps.length];
  }

  /** Cosa può vedere chi è di turno: SOLO il passo precedente (null per il primo). */
  get visible(): ChainStep | null {
    return this.steps[this.steps.length - 1] ?? null;
  }

  /** Ultimo testo valido nella catena (serve se qualcuno non ha scritto nulla). */
  lastText(): string {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const s = this.steps[i];
      if (s.kind !== 'draw' && s.content.trim()) return s.content;
    }
    return '';
  }

  add(content: string) {
    if (this.complete) throw new Error('Catena completa');
    this.steps.push({ kind: this.currentKind, playerId: this.currentPlayer.id, content });
  }

  /** Chi può ricevere i premi finali: i disegnatori (capolavoro) e chi ha scritto un titolo (fraintendimento). */
  candidates(kind: 'draw' | 'guess'): string[] {
    return this.steps.filter((s) => s.kind === kind).map((s) => s.playerId);
  }
}

export const CATENA_AWARD_POINTS = 2;
