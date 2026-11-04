import { CONFIG } from '../../shared/config';
import type { Category, GameAction } from '../../shared/types';
import { answerPoints } from '../logic/scoring';
import { resolveVote, type Vote } from '../logic/votes';
import type { Player } from '../players';
import { pick, randomBetween, shuffle } from '../util';
import { botAnswer, McRound } from './common';
import type { GameContext, GameMode } from './types';

/** 🎯 Classico: voto della categoria (con Joker), poi 4 domande a punteggio per velocità. */
export class ClassicGame implements GameMode {
  private step: 'vote' | 'voteResult' | 'question' | 'reveal' = 'vote';
  private votes = new Map<string, Vote>();
  private options: Category[] = [];
  private category: Category | null = null;
  private round: McRound | null = null;
  private n = 0;

  constructor(private ctx: GameContext) {}

  start() {
    this.options = shuffle(this.ctx.pool.categoriesWithMc(2)).slice(0, 4);
    if (this.options.length < 2) {
      this.category = this.options[0] ?? null;
      return this.next();
    }
    this.step = 'vote';
    this.ctx.setStep({ step: 'vote', categories: this.options }, this.ctx.dur('VOTE'), () => this.endVote());
  }

  private endVote() {
    const outcome = resolveVote(this.options.map((c) => c.id), [...this.votes.values()]);
    this.category = this.options.find((c) => c.id === outcome.categoryId)!;
    this.step = 'voteResult';
    this.ctx.setStep(
      { step: 'voteResult', categories: this.options, category: this.category, tally: outcome.tally, jokerBy: outcome.jokerBy },
      this.ctx.dur('VOTE_RESULT'),
      () => this.next()
    );
  }

  private next() {
    if (this.n >= CONFIG.CLASSIC_QUESTIONS) return this.ctx.finish();
    this.n++;
    const def = this.ctx.pool.drawMc({ categoryId: this.category?.id });
    const pub = this.ctx.publicMc(def, this.n, CONFIG.CLASSIC_QUESTIONS);
    this.round = new McRound(def, pub, this.ctx.dur('QUESTION'), this.ctx.now);
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
    if (a.type === 'vote') {
      if (this.step !== 'vote') return 'Non è il momento di votare';
      if (this.votes.has(p.id)) return 'Hai già votato';
      if (!this.options.some((c) => c.id === a.categoryId)) return 'Categoria non valida';
      if (a.useJoker && p.jokerLeft <= 0) return 'Hai già usato il Joker';
      // Un solo Joker per voto: il secondo non viene consumato e il voto va rifatto senza.
      if (a.useJoker && this.jokerPlayed()) return 'Il Joker è già stato giocato da qualcun altro: vota senza';
      if (a.useJoker) p.jokerLeft--;
      this.votes.set(p.id, { playerId: p.id, categoryId: a.categoryId, joker: !!a.useJoker, at: Date.now() });
      return null;
    }
    if (this.step === 'question' && this.round) return this.round.answer(p, a);
    return 'Azione non valida ora';
  }

  private jokerPlayed() {
    return [...this.votes.values()].some((v) => v.joker);
  }

  hasActed(p: Player) {
    if (this.step === 'vote') return this.votes.has(p.id);
    if (this.step === 'question') return !!this.round?.answers.has(p.id);
    return true;
  }

  privateFor(p: Player) {
    return {
      myVote: this.votes.get(p.id)?.categoryId ?? null,
      myAnswer: this.step === 'question' ? (this.round?.answers.get(p.id)?.optionIndex ?? null) : null
    };
  }

  bot(b: Player) {
    if (this.step === 'vote') {
      this.ctx.later(
        () => this.ctx.act(b, { type: 'vote', categoryId: pick(this.options).id, useJoker: b.jokerLeft > 0 && !this.jokerPlayed() && Math.random() < 0.1 }),
        this.ctx.scale(randomBetween(1200, 4000))
      );
    }
    if (this.step === 'question' && this.round) {
      const r = this.round;
      botAnswer(this.ctx, r, b, (i) => this.ctx.act(b, { type: 'answer', questionId: r.def.id, optionIndex: i }));
    }
  }
}
