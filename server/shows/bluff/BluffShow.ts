import { BLUFF, type BluffPrivate, type BluffPublic } from '../../../shared/bluff';
import { BaseShow } from '../../core/BaseShow';
import { buildOptions, isTruth, scoreChoices, type BluffOption } from '../../core/bluff';
import { cleanText, isIntIn, payloadOf } from '../../core/input';
import type { ActionResult } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { pick, shuffle } from '../../util';
import { BLUFF_FACTS, type BluffFact } from './facts';

/**
 * 🎭 Fuffa d'Autore: fatto vero con una parola mancante → ognuno scrive una bugia credibile →
 * tutti cercano la verità tra le bugie. Punti a chi trova la verità e a chi inganna gli altri.
 */
export class BluffShow extends BaseShow<BluffPublic, BluffPrivate> {
  readonly id = 'bluff' as const;

  private facts: BluffFact[] = [];
  private n = 0;
  private lies = new Map<string, string>();
  /** Chi ha usato una bugia salvagente (inganna a metà prezzo). */
  private safetyUsers = new Set<string>();
  private safetyOffers = new Map<string, string[]>();
  private options: BluffOption[] = [];
  private choices = new Map<string, string>();
  private roundPoints: Record<string, number> = {};

  protected checkContent(): string | null {
    return BLUFF_FACTS.length < this.rounds ? 'Fatti insufficienti' : null;
  }

  start(): ActionResult {
    this.facts = shuffle(BLUFF_FACTS).slice(0, this.rounds);
    this.next();
    return null;
  }

  private get fact(): BluffFact {
    return this.facts[this.n - 1];
  }

  private get multiplier() {
    return this.opt('doubles') === 'on' && this.n > this.facts.length - BLUFF.DOUBLE_LAST ? 2 : 1;
  }

  private next() {
    if (this.n >= this.facts.length) return this.finish();
    this.n++;
    this.lies.clear();
    this.safetyUsers.clear();
    this.choices.clear();
    this.safetyOffers.clear();
    for (const p of this.ctx.players()) this.safetyOffers.set(p.id, shuffle(this.fact.lies).slice(0, BLUFF.SAFETY_CHOICES));
    this.go('lie', BLUFF.LIE_MS, () => this.choose());
  }

  private choose() {
    // Chi non ha scritto nulla riceve d'ufficio una bugia salvagente.
    for (const p of this.ctx.players()) {
      if (!this.lies.has(p.id)) {
        this.lies.set(p.id, pick(this.safetyOffers.get(p.id) ?? this.fact.lies));
        this.safetyUsers.add(p.id);
      }
    }
    this.options = buildOptions(this.fact.answer, this.lies, this.fact.lies, BLUFF.MIN_OPTIONS);
    this.go('choose', BLUFF.CHOOSE_MS, () => this.reveal());
  }

  private reveal() {
    const mult = this.multiplier;
    const pts = scoreChoices(this.options, this.choices, BLUFF.TRUTH_POINTS * mult, (author) =>
      BLUFF.FOOL_POINTS * mult * (this.safetyUsers.has(author) ? BLUFF.SAFETY_FACTOR : 1)
    );
    this.roundPoints = {};
    for (const p of this.ctx.players()) this.roundPoints[p.id] = this.ctx.addScore(p, pts.get(p.id) ?? 0);
    this.go('reveal', BLUFF.REVEAL_MS, () => this.next());
  }

  private ownOption(playerId: string): BluffOption | undefined {
    return this.options.find((o) => o.authors.includes(playerId));
  }

  handleAction(p: Player, a: unknown): ActionResult {
    const lie = payloadOf(a, 'lie');
    const safety = payloadOf(a, 'safety');
    if (lie || safety) {
      if (this.step !== 'lie') return 'Non è il momento di scrivere';
      if (safety) {
        const offers = this.safetyOffers.get(p.id) ?? [];
        if (!isIntIn(safety.index, 0, offers.length - 1)) return 'Bugia non valida';
        this.lies.set(p.id, offers[safety.index]);
        this.safetyUsers.add(p.id);
        return null;
      }
      const text = cleanText(lie!.text, BLUFF.MAX_CHARS);
      if (!text) return 'Scrivi una bugia';
      if (isTruth(text, this.fact.answer)) return 'Hai scritto la verità! Inventa una bugia';
      this.lies.set(p.id, text);
      this.safetyUsers.delete(p.id);
      return null;
    }
    const choice = payloadOf(a, 'choose');
    if (choice) {
      if (this.step !== 'choose') return 'Non è il momento di scegliere';
      const o = this.options.find((x) => x.id === choice.optionId);
      if (!o) return 'Risposta non valida';
      if (o.authors.includes(p.id)) return 'Non puoi scegliere la tua bugia!';
      this.choices.set(p.id, o.id);
      return null;
    }
    return 'Azione non valida';
  }

  hasActed(p: Player): boolean {
    if (this.step === 'lie') return this.lies.has(p.id);
    if (this.step === 'choose') return this.choices.has(p.id);
    return false;
  }

  bot(b: Player): void {
    if (this.step === 'lie') {
      this.botAct(b, 4_000, 20_000, () => ({ type: 'safety', index: Math.floor(Math.random() * BLUFF.SAFETY_CHOICES) }));
    }
    if (this.step === 'choose') {
      this.botAct(b, 3_000, 15_000, () => {
        const allowed = this.options.filter((o) => !o.authors.includes(b.id));
        const truth = allowed.find((o) => o.isTruth);
        const target = truth && Math.random() < 0.4 ? truth : pick(allowed);
        return target && { type: 'choose', optionId: target.id };
      });
    }
  }

  protected stepState(): BluffPublic | null {
    const header = { number: this.n, total: this.facts.length, double: this.multiplier > 1, question: this.fact?.text ?? '' };
    switch (this.step) {
      case 'lie':
        return { step: 'lie', ...header, submitted: [...this.lies.keys()] };
      case 'choose':
        return { step: 'choose', ...header, options: this.options.map(({ id, text }) => ({ id, text })), chosen: [...this.choices.keys()] };
      case 'reveal':
        return {
          step: 'reveal',
          ...header,
          options: this.options.map((o) => ({
            ...o,
            pickedBy: [...this.choices].filter(([, id]) => id === o.id).map(([pid]) => pid)
          })),
          points: this.roundPoints
        };
      default:
        return null;
    }
  }

  privateState(p: Player): BluffPrivate {
    return {
      myLie: this.lies.get(p.id) ?? null,
      safeties: this.step === 'lie' && !this.lies.has(p.id) ? (this.safetyOffers.get(p.id) ?? []) : [],
      myOptionId: this.step === 'choose' || this.step === 'reveal' ? (this.ownOption(p.id)?.id ?? null) : null,
      myChoice: this.choices.get(p.id) ?? null
    };
  }
}
