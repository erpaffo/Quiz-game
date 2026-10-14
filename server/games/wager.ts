import { CONFIG } from '../../shared/config';
import type { Category, GameAction } from '../../shared/types';
import type { Player } from '../players';
import { pick, randomBetween } from '../util';
import { botAnswer, McRound } from './common';
import type { GameContext, GameMode } from './types';

const round50 = (n: number) => Math.round(n / 50) * 50;

/** 🎰 Scommessa: vedi la categoria, punti una parte dei tuoi punti, poi rispondi. */
export class WagerGame implements GameMode {
  private step: 'bet' | 'question' | 'reveal' = 'bet';
  private round: McRound | null = null;
  private category: Category | null = null;
  private options = new Map<string, number[]>();
  private bets = new Map<string, number>();
  private n = 0;

  constructor(private ctx: GameContext) {}

  start() {
    this.next();
  }

  /** Puntate disponibili: minima fissa, 25%, 50%, tutto (con minimi per chi ha pochi punti). */
  private betOptions(p: Player): number[] {
    const s = Math.max(0, p.score);
    const opts = [200, Math.max(200, round50(s * 0.25)), Math.max(400, round50(s * 0.5)), Math.max(600, s)];
    return [...new Set(opts)].sort((a, b) => a - b);
  }

  private next() {
    if (this.n >= CONFIG.WAGER_QUESTIONS) return this.ctx.finish();
    this.n++;
    this.bets.clear();
    this.options.clear();
    for (const p of this.ctx.players()) this.options.set(p.id, this.betOptions(p));
    const cats = this.ctx.pool.categoriesWithMc(1);
    this.category = cats.length ? pick(cats) : null;
    this.step = 'bet';
    this.ctx.setStep(
      { step: 'bet', category: this.category ?? { id: 'mix', name: 'Domanda a sorpresa', icon: '❓', color: '#6a4c93' }, number: this.n, total: CONFIG.WAGER_QUESTIONS },
      this.ctx.dur('BET'),
      () => this.question()
    );
  }

  private question() {
    const def = this.ctx.pool.drawMc(this.category?.id);
    const pub = this.ctx.publicMc(def, this.n, CONFIG.WAGER_QUESTIONS);
    this.round = new McRound(def, pub, this.ctx.dur('QUESTION'));
    this.ctx.present(def);
    this.step = 'question';
    this.ctx.setStep({ step: 'question', question: pub }, this.round.durationMs, () => this.reveal());
  }

  private reveal() {
    const r = this.round!;
    for (const p of this.ctx.players()) {
      const bet = this.bets.get(p.id) ?? this.options.get(p.id)?.[0] ?? 200;
      if (r.answers.has(p.id)) this.ctx.recordAnswer(p, r.isCorrect(p));
      r.points.set(p.id, r.isCorrect(p) ? this.ctx.award(p, bet) : this.ctx.addScore(p, -bet));
    }
    this.step = 'reveal';
    this.ctx.setStep(
      { step: 'reveal', question: r.pub, correctIndex: r.def.correctIndex, results: r.results(this.ctx.players()) },
      this.ctx.dur('REVEAL'),
      () => this.next()
    );
  }

  action(p: Player, a: GameAction): string | null {
    if (a.type === 'bet') {
      if (this.step !== 'bet') return 'Le puntate sono chiuse';
      const value = this.options.get(p.id)?.[a.index];
      if (value === undefined) return 'Puntata non valida';
      this.bets.set(p.id, value);
      return null;
    }
    if (this.step !== 'question' || !this.round) return 'Azione non valida ora';
    return this.round.answer(p, a);
  }

  hasActed(p: Player) {
    if (this.step === 'bet') return this.bets.has(p.id);
    if (this.step === 'question') return !!this.round?.answers.has(p.id);
    return true;
  }

  privateFor(p: Player) {
    return {
      myBet: this.bets.get(p.id) ?? null,
      betOptions: this.step === 'bet' ? (this.options.get(p.id) ?? []) : [],
      myAnswer: this.step === 'question' ? (this.round?.answers.get(p.id)?.optionIndex ?? null) : null
    };
  }

  bot(b: Player) {
    if (this.step === 'bet') {
      const opts = this.options.get(b.id) ?? [200];
      this.ctx.later(() => this.ctx.act(b, { type: 'bet', index: Math.floor(Math.random() * opts.length) }), this.ctx.scale(randomBetween(1000, 4000)));
    }
    if (this.step === 'question' && this.round) {
      const r = this.round;
      botAnswer(this.ctx, r, b, (i) => this.ctx.act(b, { type: 'answer', questionId: r.def.id, optionIndex: i }));
    }
  }
}
