// Regole di «5 Secondi di Panico»: chi sbaglia passa la stessa sfida al prossimo, con risposte nuove.

import { PANICO_PROMPTS } from '../data/panico';
import { Deck, type Rng } from '../rng';
import type { Player } from '../types';

export type PanicoEvent =
  | { kind: 'point'; playerId: string }
  /** La sfida passa al giocatore successivo (stessa domanda). */
  | { kind: 'bounce'; playerId: string }
  /** Nessuno ce l'ha fatta: punto di consolazione a chi l'aveva ricevuta per primo. */
  | { kind: 'consolation'; playerId: string };

export class PanicoGame {
  private readonly queue: number[] = [];
  private readonly deck: Deck<string>;
  /** Indice di chi è sotto esame adesso. */
  examinee = 0;
  /** Chi aveva ricevuto la sfida per primo. */
  origin = 0;
  private tried = new Set<number>();
  prompt = '';
  turn = 0;
  readonly totalTurns: number;

  constructor(
    readonly players: Player[],
    turnsEach: number,
    rng: Rng
  ) {
    for (let t = 0; t < Math.max(1, turnsEach); t++) for (let i = 0; i < players.length; i++) this.queue.push(i);
    this.totalTurns = this.queue.length;
    this.deck = new Deck(PANICO_PROMPTS, rng);
  }

  get done(): boolean {
    return this.queue.length === 0;
  }

  /** Nuova sfida per il prossimo della fila. Restituisce false se la partita è finita. */
  nextTurn(): boolean {
    const i = this.queue.shift();
    if (i === undefined) return false;
    this.turn++;
    this.examinee = this.origin = i;
    this.tried = new Set([i]);
    this.prompt = this.deck.draw();
    return true;
  }

  get examineePlayer(): Player {
    return this.players[this.examinee];
  }

  /** Chi legge la sfida: il vicino di destra di chi è sotto esame. */
  get readerPlayer(): Player {
    return this.players[(this.examinee + 1) % this.players.length];
  }

  /** Ce l'ha fatta: punto a chi è sotto esame, turno finito. */
  success(): PanicoEvent {
    return { kind: 'point', playerId: this.players[this.examinee].id };
  }

  /** Scaduto o ripetuto: la stessa sfida passa al prossimo che non l'ha ancora provata. */
  fail(): PanicoEvent {
    for (let k = 1; k < this.players.length; k++) {
      const j = (this.examinee + k) % this.players.length;
      if (!this.tried.has(j)) {
        this.tried.add(j);
        this.examinee = j;
        return { kind: 'bounce', playerId: this.players[j].id };
      }
    }
    return { kind: 'consolation', playerId: this.players[this.origin].id };
  }
}
