import { CONFIG } from '../../shared/config';
import type { BlitzProgress, GameAction } from '../../shared/types';
import type { Player } from '../players';
import type { McDef } from '../QuestionPool';
import { pick, randomBetween } from '../util';
import { McRound } from './common';
import type { GameContext, GameMode } from './types';

interface Lane {
  deck: McDef[];
  idx: number;
  round: McRound;
  answered: number;
  correct: number;
  streak: number;
  multiplier: number;
  points: number;
  feedback: 'correct' | 'wrong' | null;
}

/** 🔥 Raffica: 45 secondi, ognuno al suo ritmo; le serie di risposte giuste alzano il moltiplicatore. */
export class BlitzGame implements GameMode {
  private step: 'blitz' | 'blitzEnd' = 'blitz';
  private lanes = new Map<string, Lane>();

  constructor(private ctx: GameContext) {}

  start() {
    for (const p of this.ctx.players()) {
      const deck = this.ctx.pool.blitzDeck();
      this.lanes.set(p.id, { deck, idx: -1, round: null!, answered: 0, correct: 0, streak: 0, multiplier: 1, points: 0, feedback: null });
      this.serve(p);
    }
    this.ctx.setStep({ step: 'blitz', progress: this.progress() }, this.ctx.dur('BLITZ'), () => this.end());
  }

  private serve(p: Player) {
    const lane = this.lanes.get(p.id)!;
    lane.idx++;
    const def = lane.deck[lane.idx % lane.deck.length];
    // Id univoco per corsia: la stessa domanda può tornare se il mazzo finisce.
    const unique = { ...def, id: `${def.id}#${lane.idx}` };
    lane.round = new McRound(unique, this.ctx.publicMc(unique, lane.answered + 1, 0), this.ctx.dur('BLITZ'));
    this.ctx.present(unique, [p]);
  }

  private progress(): BlitzProgress[] {
    return [...this.lanes].map(([playerId, l]) => ({
      playerId,
      answered: l.answered,
      correct: l.correct,
      streak: l.streak,
      multiplier: l.multiplier,
      points: l.points
    }));
  }

  private end() {
    this.step = 'blitzEnd';
    this.ctx.setStep({ step: 'blitzEnd', progress: this.progress() }, this.ctx.dur('BLITZ_END'), () => this.ctx.finish());
  }

  action(p: Player, a: GameAction): string | null {
    const lane = this.lanes.get(p.id);
    if (this.step !== 'blitz' || !lane) return 'La Raffica è finita';
    const err = lane.round.answer(p, a);
    if (err) return err;
    const correct = lane.round.isCorrect(p);
    lane.answered++;
    if (correct) {
      lane.points += this.ctx.award(p, CONFIG.BLITZ_BASE_POINTS * lane.multiplier);
      lane.correct++;
      lane.streak++;
      lane.multiplier = Math.min(CONFIG.BLITZ_MAX_MULTIPLIER, 1 + Math.floor(lane.streak / 3));
    } else {
      lane.streak = 0;
      lane.multiplier = 1;
    }
    lane.feedback = correct ? 'correct' : 'wrong';
    this.ctx.recordAnswer(p, correct);
    this.serve(p);
    this.ctx.patchStep({ step: 'blitz', progress: this.progress() });
    return null;
  }

  hasActed() {
    // A tempo: nessuna chiusura anticipata.
    return this.step !== 'blitz';
  }

  privateFor(p: Player) {
    const lane = this.lanes.get(p.id);
    if (!lane || this.step !== 'blitz') return { blitz: null };
    return { blitz: { question: lane.round.pub, streak: lane.streak, multiplier: lane.multiplier, points: lane.points, feedback: lane.feedback } };
  }

  bot(b: Player) {
    if (this.step !== 'blitz') return;
    const tick = () => {
      const lane = this.lanes.get(b.id);
      if (!lane || this.step !== 'blitz') return;
      const def = lane.round.def;
      const wrong = def.options.map((_, i) => i).filter((i) => i !== def.correctIndex);
      this.ctx.act(b, { type: 'answer', questionId: def.id, optionIndex: Math.random() < 0.65 ? def.correctIndex : pick(wrong) });
      this.ctx.later(tick, this.ctx.scale(randomBetween(1800, 4200)));
    };
    this.ctx.later(tick, this.ctx.scale(randomBetween(2000, 4000) + (b.cur?.incoming.length ?? 0) * 2500));
  }
}
