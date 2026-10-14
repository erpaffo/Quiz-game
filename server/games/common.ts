import type { AnswerResult, GameAction, QuestionPublic } from '../../shared/types';
import type { Player } from '../players';
import type { McDef } from '../QuestionPool';
import { pick, randomBetween } from '../util';
import type { GameContext } from './types';

/** Una domanda a scelta multipla in corso: raccoglie risposte e tempi. */
export class McRound {
  readonly startedAt = Date.now();
  readonly answers = new Map<string, { optionIndex: number; timeMs: number }>();
  /** Punti assegnati durante la domanda (giochi che premiano subito, es. Il Più Veloce). */
  readonly points = new Map<string, number>();

  constructor(readonly def: McDef, readonly pub: QuestionPublic, readonly durationMs: number) {}

  answer(p: Player, a: GameAction): string | null {
    if (a.type !== 'answer' || a.questionId !== this.def.id) return 'Domanda non attiva';
    if (this.answers.has(p.id)) return 'Hai già risposto';
    if (!Number.isInteger(a.optionIndex) || a.optionIndex < 0 || a.optionIndex >= this.def.options.length) return 'Risposta non valida';
    this.answers.set(p.id, { optionIndex: a.optionIndex, timeMs: Date.now() - this.startedAt });
    return null;
  }

  isCorrect(p: Player) {
    return this.answers.get(p.id)?.optionIndex === this.def.correctIndex;
  }

  results(players: Player[], points: (p: Player) => number = (p) => this.points.get(p.id) ?? 0): AnswerResult[] {
    return players.map((p) => {
      const a = this.answers.get(p.id);
      return {
        playerId: p.id,
        optionIndex: a?.optionIndex ?? null,
        correct: a?.optionIndex === this.def.correctIndex,
        points: points(p),
        timeMs: a?.timeMs ?? null
      };
    });
  }
}

/** Il bot risponde dopo un tempo realistico (più lento se colpito da poteri), giusto con probabilità `accuracy`. */
export function botAnswer(ctx: GameContext, round: McRound, bot: Player, answer: (index: number) => void, accuracy = 0.6) {
  const slowdown = (bot.cur?.incoming.length ?? 0) * 2500;
  const delay = Math.min(round.durationMs * 0.9, ctx.scale(randomBetween(2000, 7500) + slowdown));
  const right = Math.random() < accuracy;
  const wrong = round.def.options.map((_, i) => i).filter((i) => i !== round.def.correctIndex);
  ctx.later(() => answer(right ? round.def.correctIndex : pick(wrong)), delay);
}

/** Il giocatore più ricco tra gli altri: bersaglio preferito di bot e scelte automatiche. */
export function richestOther(ctx: GameContext, self: Player): Player | undefined {
  return ctx
    .players()
    .filter((o) => o.id !== self.id)
    .sort((a, b) => b.score - a.score)[0];
}
