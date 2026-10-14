import { CONFIG } from '../../shared/config';
import type { GameAction, Transfer } from '../../shared/types';
import type { Player } from '../players';
import { randomBetween } from '../util';
import { botAnswer, McRound, richestOther } from './common';
import type { GameContext, GameMode } from './types';

/** 🦝 Ruba Punti: chi risponde giusto sceglie a chi rubare (il più veloce ruba di più). */
export class StealGame implements GameMode {
  private step: 'question' | 'reveal' | 'steal' | 'transfers' = 'question';
  private round: McRound | null = null;
  private thieves = new Map<string, number>();
  private choices = new Map<string, string>();
  private n = 0;

  constructor(private ctx: GameContext) {}

  start() {
    this.next();
  }

  private next() {
    if (this.n >= CONFIG.STEAL_QUESTIONS) return this.ctx.finish();
    this.n++;
    this.thieves.clear();
    this.choices.clear();
    const def = this.ctx.pool.drawMc();
    const pub = this.ctx.publicMc(def, this.n, CONFIG.STEAL_QUESTIONS);
    this.round = new McRound(def, pub, this.ctx.dur('QUESTION'));
    this.ctx.present(def);
    this.step = 'question';
    this.ctx.setStep({ step: 'question', question: pub }, this.round.durationMs, () => this.reveal());
  }

  private reveal() {
    const r = this.round!;
    const players = this.ctx.players();
    for (const p of players) if (r.answers.has(p.id)) this.ctx.recordAnswer(p, r.isCorrect(p));
    const correct = players.filter((p) => r.isCorrect(p)).sort((a, b) => r.answers.get(a.id)!.timeMs - r.answers.get(b.id)!.timeMs);
    correct.forEach((p, i) => this.thieves.set(p.id, this.ctx.boost(p, i === 0 ? CONFIG.STEAL_FASTEST : CONFIG.STEAL_OTHERS)));
    const results = r.results(players);

    if (this.thieves.size === 0 || players.length < 2) {
      this.step = 'reveal';
      return this.ctx.setStep({ step: 'reveal', question: r.pub, correctIndex: r.def.correctIndex, results }, this.ctx.dur('REVEAL'), () => this.next());
    }
    this.step = 'steal';
    this.ctx.setStep(
      {
        step: 'steal',
        question: r.pub,
        correctIndex: r.def.correctIndex,
        results,
        thieves: [...this.thieves].map(([playerId, amount]) => ({ playerId, amount }))
      },
      this.ctx.dur('STEAL'),
      () => this.doTransfers()
    );
  }

  private doTransfers() {
    const transfers: Transfer[] = [];
    const robbed = new Map<string, number>();
    for (const [thiefId, amount] of this.thieves) {
      const thief = this.ctx.get(thiefId);
      if (!thief) continue;
      const victim = this.ctx.get(this.choices.get(thiefId) ?? '') ?? richestOther(this.ctx, thief);
      if (!victim) continue;
      // La vittima perde al massimo i punti che ha; il ladro incassa comunque l'intera cifra
      // (il resto lo paga la banca), così il gioco funziona anche a inizio serata.
      // Oltre MAX_ROBBED_PER_QUESTION furti sulla stessa persona paga la banca (niente linciaggi).
      const times = robbed.get(victim.id) ?? 0;
      if (times < CONFIG.MAX_ROBBED_PER_QUESTION) this.ctx.addScore(victim, -amount);
      robbed.set(victim.id, times + 1);
      this.ctx.addScore(thief, amount);
      transfers.push({ from: victim.id, to: thief.id, amount });
    }
    this.step = 'transfers';
    this.ctx.setStep({ step: 'transfers', transfers }, this.ctx.dur('TRANSFERS'), () => this.next());
  }

  action(p: Player, a: GameAction): string | null {
    if (a.type === 'target') {
      if (this.step !== 'steal' || !this.thieves.has(p.id)) return 'Non puoi rubare ora';
      if (this.choices.has(p.id)) return 'Hai già scelto';
      if (a.targetId === p.id || !this.ctx.get(a.targetId)) return 'Bersaglio non valido';
      this.choices.set(p.id, a.targetId);
      return null;
    }
    if (this.step !== 'question' || !this.round) return 'Azione non valida ora';
    return this.round.answer(p, a);
  }

  hasActed(p: Player) {
    if (this.step === 'question') return !!this.round?.answers.has(p.id);
    if (this.step === 'steal') return !this.thieves.has(p.id) || this.choices.has(p.id);
    return true;
  }

  privateFor(p: Player) {
    const amount = this.thieves.get(p.id);
    return {
      myAnswer: this.step === 'question' ? (this.round?.answers.get(p.id)?.optionIndex ?? null) : null,
      choose: this.step === 'steal' && amount !== undefined ? { kind: 'steal' as const, amount, done: this.choices.has(p.id) } : null
    };
  }

  bot(b: Player) {
    if (this.step === 'question' && this.round) {
      const r = this.round;
      botAnswer(this.ctx, r, b, (i) => this.ctx.act(b, { type: 'answer', questionId: r.def.id, optionIndex: i }));
    }
    if (this.step === 'steal' && this.thieves.has(b.id)) {
      this.ctx.later(() => {
        const target = richestOther(this.ctx, b);
        if (target) this.ctx.act(b, { type: 'target', targetId: target.id });
      }, this.ctx.scale(randomBetween(1000, 3000)));
    }
  }
}
