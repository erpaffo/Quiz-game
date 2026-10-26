import { getShowMeta, optionFor, PACE_FACTOR, roundsFor } from '../../../shared/shows';
import { TEMPO, tempoPoints, type TempoAction, type TempoGuess, type TempoPrivate, type TempoPublic, type TempoRanking } from '../../../shared/tempo';
import type { LobbySettings } from '../../../shared/types';
import type { ActionResult, RoomSessionContext, ShowPlugin } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { randomBetween, shuffle } from '../../util';
import { TEMPO_EVENTS, type TempoEvent } from './events';

type Step = 'idle' | 'question' | 'reveal' | 'final';

/**
 * 🕰️ Macchina del Tempo (ispirato a Time Jinx): in che anno è successo?
 * Passi: question (20s) → reveal (7s) × round scelti nel menù (8 di default) → final (15s) → ritorno all'Hub.
 */
export class TempoShowPlugin implements ShowPlugin<TempoPublic | null, TempoPrivate, TempoAction> {
  readonly id = 'tempo' as const;
  readonly meta = getShowMeta('tempo');

  private step: Step = 'idle';
  private events: TempoEvent[] = [];
  private n = 0;
  private rounds: number = TEMPO.ROUNDS;
  private pace = 1;
  private guesses = new Map<string, number>();
  private lastGuesses: TempoGuess[] = [];
  private stats = new Map<string, { totalError: number; exact: number }>();

  constructor(
    private readonly ctx: RoomSessionContext,
    private readonly pool: readonly TempoEvent[] = TEMPO_EVENTS
  ) {}

  private get current(): TempoEvent {
    return this.events[this.n - 1];
  }

  canStart(_players: Player[], settings?: LobbySettings): string | null {
    this.rounds = roundsFor(settings, 'tempo');
    this.pace = PACE_FACTOR[optionFor(settings, 'tempo', 'pace')] ?? 1;
    return this.pool.length < this.rounds ? `Servono almeno ${this.rounds} eventi` : null;
  }

  start(): ActionResult {
    this.events = shuffle(this.pool).slice(0, this.rounds);
    this.n = 0;
    this.stats.clear();
    this.question();
    return null;
  }

  private question() {
    this.n++;
    this.guesses.clear();
    this.step = 'question';
    this.ctx.setStep(this.publicState(), this.ctx.scale(TEMPO.QUESTION_MS * this.pace), () => this.reveal());
  }

  private reveal() {
    const year = this.current.year;
    this.lastGuesses = this.ctx.players().map((p) => {
      const guess = this.guesses.get(p.id) ?? null;
      const error = guess === null ? null : Math.abs(guess - year);
      const points = this.ctx.addScore(p, tempoPoints(error));
      const s = this.stats.get(p.id) ?? { totalError: 0, exact: 0 };
      // Chi non risponde paga l'errore massimo: non conviene restare a guardare.
      s.totalError += error ?? TEMPO.MAX_POINTS;
      if (error === 0) s.exact++;
      this.stats.set(p.id, s);
      return { playerId: p.id, year: guess, error, points };
    });
    this.step = 'reveal';
    this.ctx.setStep(this.publicState(), this.ctx.scale(TEMPO.REVEAL_MS * this.pace), () => (this.n < this.events.length ? this.question() : this.final()));
  }

  private final() {
    this.step = 'final';
    this.ctx.setStep(this.publicState(), this.ctx.scale(TEMPO.FINAL_MS), () => this.ctx.returnToHub());
  }

  handleAction(p: Player, a: TempoAction): ActionResult {
    // Il payload arriva dal telefono così com'è: va validato tutto.
    if (!a || typeof a !== 'object' || a.type !== 'year') return 'Azione non valida';
    if (this.step !== 'question') return 'Non è il momento di rispondere';
    if (!Number.isInteger(a.value) || a.value < TEMPO.MIN_YEAR || a.value > TEMPO.MAX_YEAR) {
      return `Scegli un anno tra ${TEMPO.MIN_YEAR} e ${TEMPO.MAX_YEAR}`;
    }
    this.guesses.set(p.id, a.value);
    return null;
  }

  hasActed(p: Player): boolean {
    // Fuori dalla domanda nessuno "ha agito": un'uscita durante la rivelazione non deve accorciarla.
    return this.step === 'question' && this.guesses.has(p.id);
  }

  bot(b: Player): void {
    if (this.step !== 'question') return;
    const n = this.n;
    const target = this.current.year;
    // Errore "umano": gaussiana con deviazione di 25 anni (Box-Muller).
    const noise = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()) * 25;
    const value = Math.min(TEMPO.MAX_YEAR, Math.max(TEMPO.MIN_YEAR, Math.round(target + noise)));
    this.ctx.later(() => {
      if (this.step === 'question' && this.n === n) this.ctx.act(b, { type: 'year', value });
    }, this.ctx.scale(randomBetween(3_000, 12_000) * this.pace));
  }

  publicState(): TempoPublic | null {
    const base = { number: this.n, total: this.events.length, event: this.current?.text ?? '' };
    switch (this.step) {
      case 'idle':
        return null;
      case 'question':
        return { step: 'question', ...base, answered: this.guesses.size };
      case 'reveal':
        return { step: 'reveal', ...base, year: this.current.year, guesses: this.lastGuesses };
      case 'final':
        return { step: 'final', ranking: this.ranking() };
    }
  }

  privateState(p: Player): TempoPrivate {
    return { myYear: this.step === 'question' ? (this.guesses.get(p.id) ?? null) : null };
  }

  private ranking(): TempoRanking[] {
    return this.ctx
      .players()
      .map((p) => ({ playerId: p.id, points: p.score, ...(this.stats.get(p.id) ?? { totalError: 0, exact: 0 }) }))
      .sort((a, b) => b.points - a.points || a.totalError - b.totalError);
  }
}
