import { CONFIG } from '../../shared/config';
import type { GameAction, NumericGuess, NumericPublic } from '../../shared/types';
import type { Player } from '../players';
import type { NumDef } from '../QuestionPool';
import { randomBetween } from '../util';
import type { GameContext, GameMode } from './types';

/** 📏 La Stima: risposta numerica, vince chi si avvicina di più. */
export class EstimateGame implements GameMode {
  private step: 'numeric' | 'numericReveal' = 'numeric';
  private def: NumDef | null = null;
  private pub: NumericPublic | null = null;
  private guesses = new Map<string, number>();
  private n = 0;

  constructor(private ctx: GameContext) {}

  start() {
    this.next();
  }

  private next() {
    if (this.n >= CONFIG.ESTIMATE_QUESTIONS) return this.ctx.finish();
    const def = this.ctx.pool.drawNumeric();
    if (!def) return this.ctx.finish();
    this.n++;
    this.def = def;
    this.guesses.clear();
    this.pub = { id: def.id, category: def.category, text: def.text, unit: def.unit, number: this.n, total: CONFIG.ESTIMATE_QUESTIONS, ...(def.image ? { image: def.image } : {}) };
    this.ctx.presentNumeric(def);
    this.step = 'numeric';
    this.ctx.setStep({ step: 'numeric', question: this.pub }, this.ctx.dur('NUMERIC'), () => this.reveal());
  }

  private reveal() {
    const def = this.def!;
    const players = this.ctx.players();
    const ranked = players
      .filter((p) => this.guesses.has(p.id))
      .map((p) => ({ p, diff: Math.abs(this.guesses.get(p.id)! - def.answer) }))
      .sort((a, b) => a.diff - b.diff);
    const ranks = new Map<string, number>();
    ranked.forEach((r, i) => ranks.set(r.p.id, i > 0 && r.diff === ranked[i - 1].diff ? ranks.get(ranked[i - 1].p.id)! : i + 1));

    const guesses: NumericGuess[] = players.map((p) => {
      const value = this.guesses.get(p.id) ?? null;
      const rank = ranks.get(p.id) ?? null;
      let points = 0;
      if (value !== null && rank !== null) {
        const exact = Math.abs(value - def.answer) <= Math.abs(def.answer) * 0.001;
        const base = (CONFIG.ESTIMATE_POINTS[rank - 1] ?? 0) + (exact ? CONFIG.ESTIMATE_EXACT_BONUS : 0);
        points = base > 0 ? this.ctx.award(p, base) : 0;
        this.ctx.recordAnswer(p, rank === 1);
      }
      return { playerId: p.id, value, points, rank };
    });
    this.step = 'numericReveal';
    this.ctx.setStep({ step: 'numericReveal', question: this.pub!, answer: def.answer, guesses }, this.ctx.dur('NUMERIC_REVEAL'), () => this.next());
  }

  action(p: Player, a: GameAction): string | null {
    if (this.step !== 'numeric' || a.type !== 'numeric' || a.questionId !== this.def?.id) return 'Domanda non attiva';
    if (this.guesses.has(p.id)) return 'Hai già risposto';
    const value = Number(a.value);
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) return 'Numero non valido';
    this.guesses.set(p.id, value);
    return null;
  }

  hasActed(p: Player) {
    return this.step !== 'numeric' || this.guesses.has(p.id);
  }

  privateFor(p: Player) {
    return { myNumeric: this.step === 'numeric' ? (this.guesses.get(p.id) ?? null) : null };
  }

  bot(b: Player) {
    if (this.step !== 'numeric' || !this.def) return;
    const def = this.def;
    // Stima "umana": errore casuale fino al ±40%, arrotondata come la risposta.
    const decimals = String(def.answer).split('.')[1]?.length ?? 0;
    const guess = Number((def.answer * (1 + (Math.random() - 0.5) * 0.8)).toFixed(decimals));
    this.ctx.later(() => this.ctx.act(b, { type: 'numeric', questionId: def.id, value: guess }), this.ctx.scale(randomBetween(3000, 10000)));
  }
}
