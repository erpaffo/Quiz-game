// Regole di «Duello al Tavolo»: affermazioni vere/false a raffica tra due sfidanti, chi vince resta campione.

import { DUELLO_FACTS, STROOP_COLORS } from '../data/duello';
import { pick, randInt, shuffle, type Rng } from '../rng';
import type { Player } from '../types';

export type DuelPrompt =
  | { kind: 'stroop'; truth: boolean; question: string; word: string; ink: string }
  | { kind: 'math'; truth: boolean; question: string; text: string }
  | { kind: 'fact'; truth: boolean; question: string; text: string }
  | { kind: 'count'; truth: boolean; question: string; blue: number; red: number };

export function makePrompt(rng: Rng): DuelPrompt {
  const kind = pick(rng, ['stroop', 'math', 'fact', 'count'] as const);
  const truth = rng() < 0.5;
  if (kind === 'stroop') {
    const word = pick(rng, STROOP_COLORS);
    const ink = truth ? word : pick(rng, STROOP_COLORS.filter((c) => c !== word));
    return { kind, truth, question: 'Il colore è quello scritto?', word: word.name, ink: ink.hex };
  }
  if (kind === 'math') {
    const a = randInt(rng, 2, 9);
    const b = randInt(rng, 2, 9);
    const mul = rng() < 0.6;
    const right = mul ? a * b : a + b;
    const wrong = right + pick(rng, [-3, -2, -1, 1, 2, 3, 10]);
    return { kind, truth, question: 'Il conto è giusto?', text: `${a} ${mul ? '×' : '+'} ${b} = ${truth ? right : Math.max(0, wrong === right ? right + 1 : wrong)}` };
  }
  if (kind === 'count') {
    // mai pari: deve esserci un vincitore chiaro
    let blue = randInt(rng, 2, 7);
    let red = randInt(rng, 2, 7);
    if (blue === red) red = blue + (rng() < 0.5 ? -1 : 1);
    if (truth !== blue > red) [blue, red] = [red, blue];
    return { kind, truth, question: 'Più cerchi blu che quadrati rossi?', blue, red };
  }
  const facts = DUELLO_FACTS.filter((x) => x.truth === truth);
  const fact = pick(rng, facts);
  return { kind: 'fact', truth, question: 'Vero?', text: fact.text };
}

/** Ogni quanto cambia la frase (ms). */
export function promptInterval(speed: string): number {
  return speed === 'slow' ? 3200 : speed === 'fast' ? 1800 : 2500;
}

export type TapResult = 'point' | 'penalty' | 'ignored';

export class DuelloMatch {
  readonly scores: [number, number] = [0, 0];
  prompt!: DuelPrompt;
  /** Qualcuno ha già preso il punto su questa frase. */
  private taken = false;
  private penalized: [boolean, boolean] = [false, false];

  constructor(
    readonly sides: [Player, Player],
    readonly target: number
  ) {}

  next(prompt: DuelPrompt) {
    this.prompt = prompt;
    this.taken = false;
    this.penalized = [false, false];
  }

  /** Tocco del lato 0 (in basso) o 1 (in alto). */
  tap(side: 0 | 1): TapResult {
    if (this.winner !== null) return 'ignored';
    if (this.prompt.truth) {
      if (this.taken) return 'ignored';
      this.taken = true;
      this.scores[side]++;
      return 'point';
    }
    if (this.penalized[side]) return 'ignored';
    this.penalized[side] = true;
    this.scores[side] = Math.max(0, this.scores[side] - 1);
    return 'penalty';
  }

  /** La frase attuale è già stata presa: si può passare subito alla prossima. */
  get resolved(): boolean {
    return this.taken;
  }

  get winner(): 0 | 1 | null {
    if (this.scores[0] >= this.target) return 0;
    if (this.scores[1] >= this.target) return 1;
    return null;
  }
}

/** Torneo «re del tavolo»: i primi due si sfidano, chi vince resta contro il prossimo in fila. */
export class DuelloLadder {
  private readonly queue: Player[];
  champion: Player;
  challenger: Player | null;
  readonly wins = new Map<string, number>();

  constructor(players: Player[], rng?: Rng) {
    const order = rng ? shuffle(rng, players) : players.slice();
    if (order.length < 2) throw new Error('Servono almeno 2 giocatori');
    this.champion = order[0];
    this.challenger = order[1];
    this.queue = order.slice(2);
  }

  /** Registra il vincitore del duello e prepara il prossimo. Restituisce false se il torneo è finito. */
  record(winner: Player): boolean {
    this.wins.set(winner.id, (this.wins.get(winner.id) ?? 0) + 1);
    this.champion = winner;
    this.challenger = this.queue.shift() ?? null;
    return this.challenger !== null;
  }
}

export const DUELLO_WIN_POINTS = 2;
