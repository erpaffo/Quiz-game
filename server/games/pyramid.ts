import { CONFIG } from '../../shared/config';
import type { AnswerResult, GameAction } from '../../shared/types';
import { pyramidMoves } from '../logic/pyramid';
import type { Player } from '../players';
import { botAnswer, McRound } from './common';
import type { GameContext, GameMode } from './types';

/** 🔺 Finale: si parte più in alto con più punti; giusto +1 gradino, il più veloce +2. */
export class PyramidGame implements GameMode {
  private step: 'question' | 'reveal' = 'question';
  private round: McRound | null = null;
  private n = 0;

  constructor(private ctx: GameContext) {}

  start() {
    // I gradini di partenza sono già stati assegnati dalla stanza durante l'introduzione.
    this.next();
  }

  private next() {
    this.n++;
    const def = this.ctx.pool.drawMc();
    const pub = this.ctx.publicMc(def, this.n, CONFIG.PYRAMID_MAX_QUESTIONS);
    this.round = new McRound(def, pub, this.ctx.dur('PYRAMID_QUESTION'));
    this.ctx.present(def);
    this.step = 'question';
    this.ctx.setStep({ step: 'question', question: pub }, this.round.durationMs, () => this.reveal());
  }

  private reveal() {
    const r = this.round!;
    const players = this.ctx.players();
    const results = r.results(players, () => 0);
    const moves = pyramidMoves(results, new Map(players.map((p) => [p.id, p.pyramidStep])), CONFIG.PYRAMID_STEPS);
    for (const m of moves) this.ctx.get(m.playerId)!.pyramidStep = m.to;
    this.step = 'reveal';
    this.ctx.setStep(
      { step: 'reveal', question: r.pub, correctIndex: r.def.correctIndex, results, moves },
      this.ctx.dur('PYRAMID_REVEAL'),
      () => this.after(results)
    );
  }

  private after(results: AnswerResult[]) {
    const top = CONFIG.PYRAMID_STEPS;
    const players = this.ctx.players();
    if (!players.some((p) => p.pyramidStep >= top) && this.n < CONFIG.PYRAMID_MAX_QUESTIONS) return this.next();
    const time = (id: string) => results.find((r) => r.playerId === id)?.timeMs ?? Infinity;
    const ranked = players.slice().sort((a, b) => {
      if (b.pyramidStep !== a.pyramidStep) return b.pyramidStep - a.pyramidStep;
      // Arrivati in cima insieme: vince chi ha risposto più in fretta all'ultima domanda.
      if (a.pyramidStep >= top) return time(a.id) - time(b.id);
      return b.score - a.score;
    });
    this.ctx.gameOver(ranked.map((p) => p.id));
  }

  action(p: Player, a: GameAction): string | null {
    if (this.step !== 'question' || !this.round) return 'Azione non valida ora';
    return this.round.answer(p, a);
  }

  hasActed(p: Player) {
    return this.step !== 'question' || !!this.round?.answers.has(p.id);
  }

  privateFor(p: Player) {
    return { myAnswer: this.step === 'question' ? (this.round?.answers.get(p.id)?.optionIndex ?? null) : null };
  }

  bot(b: Player) {
    if (this.step !== 'question' || !this.round) return;
    const r = this.round;
    botAnswer(this.ctx, r, b, (i) => this.ctx.act(b, { type: 'answer', questionId: r.def.id, optionIndex: i }), 0.6);
  }
}
