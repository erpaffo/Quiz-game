import { CONFIG } from '../../shared/config';
import type { GameAction } from '../../shared/types';
import type { Player } from '../players';
import { botAnswer, McRound } from './common';
import type { GameContext, GameMode } from './types';

/** ⚡ Il Più Veloce: solo il primo che risponde giusto prende i punti; chi sbaglia paga ed è fuori. */
export class FastestGame implements GameMode {
  private step: 'question' | 'reveal' = 'question';
  private round: McRound | null = null;
  private winners: string[] = [];
  private n = 0;

  constructor(private ctx: GameContext) {}

  start() {
    this.next();
  }

  private next() {
    if (this.n >= CONFIG.FASTEST_QUESTIONS) return this.ctx.finish();
    this.n++;
    this.winners = [];
    const def = this.ctx.pool.drawMc();
    const pub = this.ctx.publicMc(def, this.n, CONFIG.FASTEST_QUESTIONS);
    this.round = new McRound(def, pub, this.ctx.dur('QUESTION'), this.ctx.now);
    this.ctx.present(def);
    this.step = 'question';
    this.ctx.setStep({ step: 'question', question: pub, firstCorrect: null }, this.round.durationMs, () => this.reveal());
  }

  private reveal() {
    const r = this.round!;
    this.step = 'reveal';
    this.ctx.setStep(
      {
        step: 'reveal',
        question: r.pub,
        correctIndex: r.def.correctIndex,
        results: r.results(this.ctx.players()),
        winner: this.winners[0] ?? null,
        podium: this.winners
      },
      this.ctx.dur('REVEAL'),
      () => this.next()
    );
  }

  action(p: Player, a: GameAction): string | null {
    const r = this.round;
    if (this.step !== 'question' || !r) return 'Azione non valida ora';
    const err = r.answer(p, a);
    if (err) return err;
    const correct = r.isCorrect(p);
    this.ctx.recordAnswer(p, correct);
    // Gruppi numerosi: premiano i primi tre (1000/600/300), altrimenti solo il primo.
    const prizes = this.ctx.isLargeGroup() ? CONFIG.FASTEST_PODIUM : [CONFIG.FASTEST_WIN];
    if (correct && this.winners.length < prizes.length) {
      r.points.set(p.id, this.ctx.award(p, prizes[this.winners.length]));
      this.winners.push(p.id);
      if (this.winners.length === prizes.length) this.ctx.endStep(this.ctx.scale(700));
    } else if (!correct) {
      r.points.set(p.id, this.ctx.addScore(p, -CONFIG.FASTEST_PENALTY));
    }
    return null;
  }

  hasActed(p: Player) {
    return this.step !== 'question' || !!this.round?.answers.has(p.id);
  }

  privateFor(p: Player) {
    const a = this.step === 'question' ? this.round?.answers.get(p.id) : undefined;
    return { myAnswer: a?.optionIndex ?? null, blocked: !!a && !this.round!.isCorrect(p) };
  }

  bot(b: Player) {
    if (this.step !== 'question' || !this.round) return;
    const r = this.round;
    botAnswer(this.ctx, r, b, (i) => this.ctx.act(b, { type: 'answer', questionId: r.def.id, optionIndex: i }), 0.55);
  }
}
