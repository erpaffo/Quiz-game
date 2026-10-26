import { CONFIG } from '../../shared/config';
import type { GameAction } from '../../shared/types';
import type { Player } from '../players';
import { pick, randomBetween } from '../util';
import { botAnswer, McRound, richestOther } from './common';
import type { GameContext, GameMode } from './types';

const MAX_QUESTIONS = 15;

/**
 * 💣 Bomba a Orologeria: la miccia (segreta) brucia durante domande e passaggi.
 * Chi ha la bomba deve rispondere giusto per lanciarla a un avversario; allo scoppio paga.
 */
export class BombGame implements GameMode {
  private step: 'question' | 'reveal' | 'pass' | 'boom' = 'question';
  private round: McRound | null = null;
  private holder = '';
  private fuseTotal = 0;
  private fuseLeft = 0;
  private tickFrom = 0;
  /** Annulla il timer della miccia; null = miccia ferma. */
  private cancelFuse: (() => void) | null = null;
  private holderCorrect = false;
  private exploded = false;
  private n = 0;

  constructor(private ctx: GameContext) {}

  start() {
    const players = this.ctx.connected().length ? this.ctx.connected() : this.ctx.players();
    this.holder = pick(players).id;
    this.fuseTotal = this.ctx.scale(randomBetween(CONFIG.BOMB_FUSE_MIN, CONFIG.BOMB_FUSE_MAX));
    this.fuseLeft = this.fuseTotal;
    this.next();
  }

  private heat() {
    return Math.max(0, Math.min(1, 1 - this.fuseLeft / this.fuseTotal));
  }

  /**
   * Accende la miccia: se si esaurisce, BOOM. È un timer di gioco (non di passo), così
   * endStep() non lo cancella durante la breve pausa prima del passo successivo.
   */
  private burn() {
    this.stopBurn();
    this.tickFrom = Date.now();
    this.cancelFuse = this.ctx.gameTimer(() => {
      this.cancelFuse = null;
      this.fuseLeft = 0;
      this.boom();
    }, Math.max(0, this.fuseLeft));
  }

  /** Spegne la miccia conservando il tempo residuo. Idempotente: chiamarla due volte non scala il tempo due volte. */
  private stopBurn() {
    if (!this.cancelFuse) return;
    this.cancelFuse();
    this.cancelFuse = null;
    this.fuseLeft -= Date.now() - this.tickFrom;
  }

  private next() {
    if (this.n >= MAX_QUESTIONS) return this.boom();
    // Il portatore è uscito: la bomba passa a un giocatore connesso, altrimenti nessuno potrebbe lanciarla.
    if (!this.ctx.get(this.holder)?.connected) {
      const holder = this.ctx.get(this.holder);
      const heir = holder ? richestOther(this.ctx, holder) : pick(this.ctx.connected());
      if (heir?.connected) this.holder = heir.id;
    }
    this.n++;
    this.holderCorrect = false;
    const def = this.ctx.pool.drawMc();
    const pub = this.ctx.publicMc(def, this.n, 0);
    this.round = new McRound(def, pub, this.ctx.dur('QUESTION'));
    this.ctx.present(def);
    this.step = 'question';
    this.ctx.setStep({ step: 'question', question: pub, holder: this.holder, fuse: this.heat() }, this.round.durationMs, () => this.endQuestion());
    this.burn();
  }

  private endQuestion() {
    this.stopBurn();
    if (this.fuseLeft <= 0) return this.boom();
    const r = this.round!;
    if (this.holderCorrect) {
      this.step = 'pass';
      this.ctx.setStep({ step: 'pass', holder: this.holder, fuse: this.heat() }, this.ctx.dur('PASS'), () => {
        const holder = this.ctx.get(this.holder);
        this.passTo(holder ? (richestOther(this.ctx, holder)?.id ?? this.holder) : this.holder);
      });
      this.burn();
    } else {
      this.step = 'reveal';
      this.ctx.setStep(
        { step: 'reveal', question: r.pub, correctIndex: r.def.correctIndex, results: r.results(this.ctx.players()), holder: this.holder },
        this.ctx.dur('REVEAL'),
        () => this.next()
      );
    }
  }

  private passTo(targetId: string) {
    this.stopBurn();
    if (this.fuseLeft <= 0) return this.boom();
    this.holder = targetId;
    this.next();
  }

  private boom() {
    if (this.exploded) return;
    this.exploded = true;
    this.stopBurn();
    const holder = this.ctx.get(this.holder);
    const penalty = holder ? -this.ctx.addScore(holder, -CONFIG.BOMB_PENALTY) : 0;
    this.step = 'boom';
    this.ctx.setStep({ step: 'boom', holder: this.holder, penalty }, this.ctx.dur('BOOM'), () => this.ctx.finish());
  }

  action(p: Player, a: GameAction): string | null {
    if (a.type === 'target') {
      if (this.step !== 'pass' || p.id !== this.holder) return 'Non hai la bomba';
      if (a.targetId === p.id || !this.ctx.get(a.targetId)) return 'Bersaglio non valido';
      this.passTo(a.targetId);
      return null;
    }
    const r = this.round;
    if (this.step !== 'question' || !r) return 'Azione non valida ora';
    const err = r.answer(p, a);
    if (err) return err;
    const correct = r.isCorrect(p);
    this.ctx.recordAnswer(p, correct);
    if (p.id === this.holder) {
      if (correct) {
        this.holderCorrect = true;
        // Ha risposto in tempo: la miccia si ferma ora, la pausa prima del lancio non la consuma.
        this.stopBurn();
        this.ctx.endStep(this.ctx.scale(400));
      }
    } else if (correct) {
      r.points.set(p.id, this.ctx.award(p, CONFIG.BOMB_CORRECT_POINTS));
    }
    return null;
  }

  hasActed(p: Player) {
    if (this.step === 'question') return !!this.round?.answers.has(p.id);
    if (this.step === 'pass') return p.id !== this.holder;
    return true;
  }

  privateFor(p: Player) {
    return {
      myAnswer: this.step === 'question' ? (this.round?.answers.get(p.id)?.optionIndex ?? null) : null,
      choose: this.step === 'pass' && p.id === this.holder ? { kind: 'pass' as const, amount: 0, done: false } : null
    };
  }

  bot(b: Player) {
    if (this.step === 'question' && this.round) {
      const r = this.round;
      botAnswer(this.ctx, r, b, (i) => this.ctx.act(b, { type: 'answer', questionId: r.def.id, optionIndex: i }), b.id === this.holder ? 0.65 : 0.55);
    }
    if (this.step === 'pass' && b.id === this.holder) {
      this.ctx.later(() => {
        const others = this.ctx.players().filter((o) => o.id !== b.id);
        const target = Math.random() < 0.5 ? richestOther(this.ctx, b) : pick(others);
        if (target) this.ctx.act(b, { type: 'target', targetId: target.id });
      }, this.ctx.scale(randomBetween(1000, 2500)));
    }
  }
}
