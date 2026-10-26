import { CONFIG } from '../../shared/config';
import type { GameAction } from '../../shared/types';
import { answerPoints } from '../logic/scoring';
import type { Player } from '../players';
import { botAnswer, McRound } from './common';
import type { GameContext, GameMode } from './types';

/**
 * 🎵 Indovina il Brano: lo schermo principale suona un brano (campo `audio` della domanda),
 * i telefoni mostrano le risposte. Punti per velocità come nel Classico.
 */
export class MusicGame implements GameMode {
  private step: 'question' | 'reveal' = 'question';
  private round: McRound | null = null;
  private n = 0;

  constructor(private ctx: GameContext) {}

  start() {
    this.next();
  }

  private next() {
    if (this.n >= CONFIG.MUSIC_QUESTIONS) return this.ctx.finish();
    this.n++;
    const def = this.ctx.pool.drawMc({ audio: true });
    const pub = this.ctx.publicMc(def, this.n, CONFIG.MUSIC_QUESTIONS);
    this.round = new McRound(def, pub, this.ctx.dur('MUSIC_QUESTION'), this.ctx.now);
    this.ctx.present(def);
    this.step = 'question';
    this.ctx.setStep({ step: 'question', question: pub }, this.round.durationMs, () => this.reveal());
  }

  private reveal() {
    const r = this.round!;
    for (const p of this.ctx.players()) {
      const a = r.answers.get(p.id);
      if (!a) continue;
      const correct = r.isCorrect(p);
      this.ctx.recordAnswer(p, correct);
      if (correct) r.points.set(p.id, this.ctx.award(p, answerPoints(true, a.timeMs, r.durationMs)));
    }
    this.step = 'reveal';
    this.ctx.setStep(
      { step: 'reveal', question: r.pub, correctIndex: r.def.correctIndex, results: r.results(this.ctx.players()) },
      this.ctx.dur('REVEAL'),
      () => this.next()
    );
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
    botAnswer(this.ctx, r, b, (i) => this.ctx.act(b, { type: 'answer', questionId: r.def.id, optionIndex: i }), 0.55);
  }
}
