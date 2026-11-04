// Regole di «Bomba Verbale»: la bomba gira tra i giocatori vivi; la miccia ha una durata segreta.

import { pick, randInt, type Deck, type Rng } from '../rng';
import type { Player } from '../types';

export type BombaTrigger =
  | { kind: 'sillaba'; title: string; text: string }
  | { kind: 'categoria'; title: string; text: string }
  | { kind: 'catena'; title: string; text: string };

/** Mazzi dei contenuti (persistenti, creati da chi chiama: qui niente store). */
export interface BombaDecks {
  sillabe: Pick<Deck<string>, 'draw'>;
  categorie: Pick<Deck<string>, 'draw'>;
  lettere: Pick<Deck<string>, 'draw'>;
}

export function makeTrigger(mode: string, rng: Rng, decks: BombaDecks): BombaTrigger {
  const kind = mode === 'mix' ? pick(rng, ['sillaba', 'categoria', 'categoria', 'catena'] as const) : mode === 'sillabe' ? 'sillaba' : mode === 'catena' ? 'catena' : 'categoria';
  if (kind === 'sillaba') {
    const s = decks.sillabe.draw();
    return { kind, title: '🔤 Sillaba', text: `Una parola che contiene «${s}»` };
  }
  if (kind === 'catena') {
    const l = decks.lettere.draw();
    return { kind, title: '🔗 Catena', text: `Primo: una parola con la ${l}. Poi ognuno parte dall’ultima lettera della parola prima` };
  }
  return { kind: 'categoria', title: '🗂️ Categoria', text: decks.categorie.draw() };
}

/** Durata segreta della miccia in millisecondi. */
export function fuseRange(fuse: string): [number, number] {
  if (fuse === 'corta') return [10_000, 25_000];
  if (fuse === 'lunga') return [25_000, 60_000];
  return [15_000, 42_000];
}

/** Intervallo tra un tic e l'altro: rallentato all'inizio, frenetico verso la fine. */
export function tickInterval(elapsed: number, fuse: number): number {
  const p = Math.min(1, Math.max(0, elapsed / fuse));
  return Math.round(900 - 780 * Math.pow(p, 1.4));
}

export class BombaGame {
  readonly lives = new Map<string, number>();
  /** Eliminati, dal primo all'ultimo. */
  readonly out: string[] = [];
  holder = 0;
  /** Chi aveva la bomba prima (per «Contesta!»). */
  prevHolder: number | null = null;
  trigger!: BombaTrigger;
  fuse = 0;
  elapsed = 0;
  paused = false;
  /** «Contesta!» una sola volta per round: altrimenti ferma la miccia all'infinito. */
  contested = false;
  round = 0;

  constructor(
    readonly players: Player[],
    private readonly opts: { lives: number; trigger: string; fuse: string },
    private readonly rng: Rng,
    private readonly decks: BombaDecks
  ) {
    for (const p of players) this.lives.set(p.id, Math.max(1, opts.lives));
    this.holder = randInt(rng, 0, players.length - 1);
  }

  isAlive(i: number) {
    return (this.lives.get(this.players[i].id) ?? 0) > 0;
  }

  get alive(): Player[] {
    return this.players.filter((_, i) => this.isAlive(i));
  }

  get holderPlayer(): Player {
    return this.players[this.holder];
  }

  /** Prossimo giocatore vivo dopo l'indice `i`, nell'ordine del tavolo. */
  nextAlive(i: number): number {
    for (let k = 1; k <= this.players.length; k++) {
      const j = (i + k) % this.players.length;
      if (this.isAlive(j)) return j;
    }
    return i;
  }

  get nextPlayer(): Player {
    return this.players[this.nextAlive(this.holder)];
  }

  startRound() {
    this.round++;
    this.trigger = makeTrigger(this.opts.trigger, this.rng, this.decks);
    const [min, max] = fuseRange(this.opts.fuse);
    this.fuse = randInt(this.rng, min, max);
    this.elapsed = 0;
    this.paused = false;
    this.contested = false;
    this.prevHolder = null;
  }

  get canContest(): boolean {
    return this.prevHolder !== null && !this.contested;
  }

  /** Fa passare il tempo; restituisce true quando la bomba esplode. */
  advance(ms: number): boolean {
    if (!this.paused) this.elapsed += ms;
    return this.elapsed >= this.fuse;
  }

  pass() {
    this.prevHolder = this.holder;
    this.holder = this.nextAlive(this.holder);
  }

  contest() {
    this.paused = true;
    this.contested = true;
  }

  /** Esito della contestazione: parola valida → si continua; non valida → la bomba torna a chi l'ha passata. */
  resolveContest(valid: boolean) {
    this.paused = false;
    if (!valid && this.prevHolder !== null && this.isAlive(this.prevHolder)) {
      this.holder = this.prevHolder;
      this.prevHolder = null;
    }
  }

  /** BOOM: chi ha la bomba perde una vita. Restituisce il perdente. Il prossimo round parte da lui (o dal prossimo vivo). */
  explode(): Player {
    const loser = this.players[this.holder];
    const left = (this.lives.get(loser.id) ?? 1) - 1;
    this.lives.set(loser.id, left);
    if (left <= 0) {
      this.out.push(loser.id);
      this.holder = this.nextAlive(this.holder);
    }
    return loser;
  }

  get over(): boolean {
    return this.alive.length <= 1;
  }

  /** Classifica: il sopravvissuto, poi gli eliminati dall'ultimo al primo. */
  ranking(): Player[] {
    const byId = new Map(this.players.map((p) => [p.id, p]));
    const survivors = this.alive.sort((a, b) => (this.lives.get(b.id) ?? 0) - (this.lives.get(a.id) ?? 0));
    return [...survivors, ...this.out.slice().reverse().map((id) => byId.get(id)!)];
  }
}

/** Punti della Coppa: 1° +3, 2° +2, 3° +1. */
export const BOMBA_PODIUM = [3, 2, 1];
