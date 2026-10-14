import { CONFIG } from '../../shared/config';
import type { GameAction } from '../../shared/types';
import type { Player } from '../players';
import { botAnswer, McRound } from './common';
import type { GameContext, GameMode } from './types';

/** Quota del tempo in cui la domanda viene svelata; il resto serve per rispondere a testo completo. */
const REVEAL_SHARE = 0.65;

/** 🧩 Indizio dopo Indizio: la domanda appare parola per parola, prima rispondi più vinci. */
export class CluesGame implements GameMode {
  private step: 'question' | 'reveal' = 'question';
  private round: McRound | null = null;
  private revealMs = 0;
  private n = 0;

  constructor(private ctx: GameContext) {}

  start() {
    this.next();
  }

  private next() {
    if (this.n >= CONFIG.CLUES_QUESTIONS) return this.ctx.finish();
    this.n++;
    const def = this.ctx.pool.drawMc();
    const duration = this.ctx.dur('CLUE_QUESTION');
    this.revealMs = duration * REVEAL_SHARE;
    const words = def.text.split(/\s+/).length;
    const pub = this.ctx.publicMc(def, this.n, CONFIG.CLUES_QUESTIONS, { startedAt: Date.now(), wordMs: this.revealMs / words });
    this.round = new McRound(def, pub, duration);
    this.ctx.present(def);
    this.step = 'question';
    this.ctx.setStep({ step: 'question', question: pub }, duration, () => this.reveal());
  }

  private reveal() {
    const r = this.round!;
    this.step = 'reveal';
    this.ctx.setStep(
      { step: 'reveal', question: r.pub, correctIndex: r.def.correctIndex, results: r.results(this.ctx.players()) },
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
    if (correct) {
      const shown = Math.min(1, r.answers.get(p.id)!.timeMs / this.revealMs);
      r.points.set(p.id, this.ctx.award(p, Math.round(300 + 900 * (1 - shown))));
    } else {
      r.points.set(p.id, this.ctx.addScore(p, -CONFIG.CLUES_WRONG_PENALTY));
    }
    return null;
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
