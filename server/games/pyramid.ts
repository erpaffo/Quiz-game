import { isAttack } from '../../shared/cards';
import { CONFIG } from '../../shared/config';
import type { AnswerResult, CardEvent, GameAction, PowerType } from '../../shared/types';
import { pyramidMoves } from '../logic/pyramid';
import type { Player } from '../players';
import { pick, randomBetween } from '../util';
import { botAnswer, McRound } from './common';
import type { GameContext, GameMode } from './types';

const ATTACKS: PowerType[] = ['ICE', 'GOO', 'BOMB', 'LOCK'];

/**
 * 🔺 Finale: si parte più in alto con più punti; giusto +1 gradino, il più veloce +2.
 * Prima di ogni domanda gli ultimi in classifica sabotano chi vogliono (l'ultimo 2 attacchi, il penultimo 1).
 * Domande solo a risposta multipla, con difficoltà crescente.
 */
export class PyramidGame implements GameMode {
  private step: 'sabotage' | 'sabotageResult' | 'question' | 'reveal' = 'sabotage';
  private round: McRound | null = null;
  private n = 0;
  private saboteurs = new Map<string, number>();
  private plays: { from: string; card: PowerType; to: string }[] = [];

  constructor(private ctx: GameContext) {}

  start() {
    // I gradini di partenza sono già stati assegnati dalla stanza durante l'introduzione.
    this.next();
  }

  /** Difficoltà crescente: le prime domande medie, poi solo difficili. */
  private difficulty() {
    return this.n <= 2 ? 2 : 3;
  }

  /** Classifica dal basso: gradino più basso, a parità punteggio più basso. */
  private bottom(): Player[] {
    return this.ctx.players().slice().sort((a, b) => a.pyramidStep - b.pyramidStep || a.score - b.score);
  }

  private next() {
    this.n++;
    const ranked = this.bottom();
    this.saboteurs.clear();
    this.plays = [];
    if (ranked.length >= 2) this.saboteurs.set(ranked[0].id, CONFIG.SABOTAGE_LAST);
    // Con due soli giocatori il "penultimo" è il primo: sabota solo l'ultimo.
    if (ranked.length >= 3) this.saboteurs.set(ranked[1].id, CONFIG.SABOTAGE_SECOND_LAST);
    if (this.saboteurs.size === 0) return this.question();
    this.step = 'sabotage';
    this.ctx.setStep(
      { step: 'sabotage', saboteurs: [...this.saboteurs].map(([playerId, left]) => ({ playerId, left })) },
      this.ctx.dur('SABOTAGE'),
      () => this.resolveSabotage()
    );
  }

  private resolveSabotage() {
    if (this.plays.length === 0) return this.question();
    const events: CardEvent[] = [];
    for (const p of this.plays) {
      const target = this.ctx.get(p.to);
      if (!target) continue;
      this.ctx.hit(target, p.card, p.from);
      events.push({ from: p.from, card: p.card, path: [p.from, p.to], result: 'hit', defense: null });
    }
    this.step = 'sabotageResult';
    this.ctx.setStep({ step: 'sabotageResult', events }, this.ctx.dur('SABOTAGE_RESULT'), () => this.question());
  }

  private question() {
    const def = this.ctx.pool.drawMc({ difficulty: this.difficulty(), multipleOnly: true });
    const pub = this.ctx.publicMc(def, this.n, CONFIG.PYRAMID_MAX_QUESTIONS);
    this.round = new McRound(def, pub, this.ctx.dur('PYRAMID_QUESTION'), this.ctx.now);
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
    if (a.type === 'sabotage') {
      const left = this.saboteurs.get(p.id) ?? 0;
      if (this.step !== 'sabotage' || left <= 0) return 'Non puoi sabotare ora';
      if (a.card === null) {
        this.saboteurs.set(p.id, 0);
        return null;
      }
      if (!isAttack(a.card)) return 'Scegli un attacco';
      if (!a.targetId || a.targetId === p.id || !this.ctx.get(a.targetId)) return 'Bersaglio non valido';
      this.plays.push({ from: p.id, card: a.card, to: a.targetId });
      this.saboteurs.set(p.id, left - 1);
      return null;
    }
    if (this.step !== 'question' || !this.round) return 'Azione non valida ora';
    return this.round.answer(p, a);
  }

  hasActed(p: Player) {
    if (this.step === 'sabotage') return (this.saboteurs.get(p.id) ?? 0) === 0;
    return this.step !== 'question' || !!this.round?.answers.has(p.id);
  }

  privateFor(p: Player) {
    const left = this.saboteurs.get(p.id) ?? 0;
    return {
      myAnswer: this.step === 'question' ? (this.round?.answers.get(p.id)?.optionIndex ?? null) : null,
      sabotage: this.step === 'sabotage' && left > 0 ? { left } : null
    };
  }

  bot(b: Player) {
    if (this.step === 'sabotage' && (this.saboteurs.get(b.id) ?? 0) > 0) {
      // Il bot colpisce chi sta più in alto (escluso sé stesso).
      const fire = () => {
        if (this.step !== 'sabotage' || (this.saboteurs.get(b.id) ?? 0) <= 0) return;
        const leader = this.ctx.players().filter((o) => o.id !== b.id).sort((x, y) => y.pyramidStep - x.pyramidStep || y.score - x.score)[0];
        if (!leader) return;
        this.ctx.act(b, { type: 'sabotage', card: pick(ATTACKS), targetId: leader.id });
        this.ctx.later(fire, this.ctx.scale(randomBetween(500, 1200)));
      };
      this.ctx.later(fire, this.ctx.scale(randomBetween(1000, 3000)));
    }
    if (this.step === 'question' && this.round) {
      const r = this.round;
      botAnswer(this.ctx, r, b, (i) => this.ctx.act(b, { type: 'answer', questionId: r.def.id, optionIndex: i }), 0.5);
    }
  }
}
