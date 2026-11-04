import { SCALA, scalaPoints, type ScalaPrivate, type ScalaPublic, type ScalaTarget } from '../../../shared/scala';
import { BaseShow } from '../../core/BaseShow';
import { cleanText, isIntIn, payloadOf } from '../../core/input';
import type { ActionResult } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { pickFresh, randomBetween, shuffle } from '../../util';
import { SCALA_THEMES, type ScalaThemeDef } from './themes';

interface Secret {
  theme: ScalaThemeDef;
  target: ScalaTarget;
}

const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

/**
 * 📊 Scala del Nonsenso: ognuno scrive una risposta che "valga" il suo numero segreto su 10,
 * poi gli altri indovinano il numero. Round 2: il segreto è un intervallo di 3 numeri.
 * L'autore guadagna la media dei punti dei suoi indovini (conviene farsi capire).
 */
export class ScalaShow extends BaseShow<ScalaPublic, ScalaPrivate> {
  readonly id = 'scala' as const;

  private round = 0;
  private secrets = new Map<string, Secret>();
  private answers = new Map<string, string>();
  /** Autori da indovinare in questo round, in ordine casuale. */
  private queue: string[] = [];
  private index = 0;
  private guesses = new Map<string, number>();
  private lastReveal: Extract<ScalaPublic, { step: 'reveal' }> | null = null;

  start(): ActionResult {
    this.nextRound();
    return null;
  }

  private get author(): string {
    return this.queue[this.index];
  }

  private nextRound() {
    this.round++;
    this.answers.clear();
    this.secrets.clear();
    for (const p of this.ctx.players()) {
      const [theme] = pickFresh(SCALA_THEMES, 1, this.ctx.seen(this.id), (t) => t.text);
      const center = this.round === 1 ? randInt(SCALA.MIN, SCALA.MAX) : randInt(SCALA.MIN + 1, SCALA.MAX - 1);
      const target = this.round === 1 ? { lo: center, hi: center } : { lo: center - 1, hi: center + 1 };
      this.secrets.set(p.id, { theme, target });
    }
    this.go('write', SCALA.WRITE_MS, () => {
      this.queue = shuffle([...this.answers.keys()].filter((id) => this.ctx.get(id)));
      this.index = 0;
      this.nextGuess();
    });
  }

  private nextGuess() {
    if (this.index >= this.queue.length) return this.round < this.rounds ? this.nextRound() : this.finish();
    this.guesses.clear();
    this.go('guess', SCALA.GUESS_MS, () => this.reveal());
  }

  private reveal() {
    const { theme, target } = this.secrets.get(this.author)!;
    const guesses = this.ctx
      .players()
      .filter((p) => p.id !== this.author)
      .map((p) => {
        const value = this.guesses.get(p.id) ?? null;
        return { playerId: p.id, value, points: this.ctx.addScore(p, scalaPoints(value, target)) };
      });
    const voters = guesses.filter((g) => g.value !== null);
    const avg = voters.length ? Math.round(voters.reduce((s, g) => s + g.points, 0) / voters.length) : 0;
    const author = this.ctx.get(this.author);
    const authorPoints = author ? this.ctx.addScore(author, avg) : 0;
    this.lastReveal = {
      step: 'reveal',
      ...this.header(),
      theme: { text: theme.text, scale: theme.scale },
      answer: this.answers.get(this.author)!,
      target,
      guesses,
      authorPoints
    };
    this.go('reveal', SCALA.REVEAL_MS, () => {
      this.index++;
      this.nextGuess();
    });
  }

  private header() {
    return { round: this.round, total: this.rounds, authorId: this.author, index: this.index + 1, count: this.queue.length };
  }

  handleAction(p: Player, a: unknown): ActionResult {
    const answer = payloadOf(a, 'answer');
    if (answer) {
      if (this.step !== 'write') return 'Non è il momento di scrivere';
      const text = cleanText(answer.text, SCALA.MAX_CHARS);
      if (!text) return 'Scrivi una risposta';
      this.answers.set(p.id, text);
      return null;
    }
    const guess = payloadOf(a, 'guess');
    if (guess) {
      if (this.step !== 'guess') return 'Non è il momento di indovinare';
      if (p.id === this.author) return 'Non puoi indovinare la tua risposta';
      if (!isIntIn(guess.value, SCALA.MIN, SCALA.MAX)) return `Scegli un numero da ${SCALA.MIN} a ${SCALA.MAX}`;
      this.guesses.set(p.id, guess.value);
      return null;
    }
    return 'Azione non valida';
  }

  hasActed(p: Player): boolean {
    if (this.step === 'write') return this.answers.has(p.id);
    if (this.step === 'guess') return p.id === this.author || this.guesses.has(p.id);
    return false;
  }

  bot(b: Player): void {
    if (this.step === 'write') {
      const { theme, target } = this.secrets.get(b.id)!;
      const mid = (target.lo + target.hi) / 2;
      const text = mid <= 3 ? theme.low : mid <= 7 ? theme.mid : theme.high;
      this.botAct(b, 3_000, 15_000, () => ({ type: 'answer', text }));
    }
    if (this.step === 'guess' && b.id !== this.author) {
      const author = this.ctx.get(this.author);
      const { target } = this.secrets.get(this.author)!;
      // Un bot "capisce" bene i bot (risposte calibrate), meno gli umani.
      const value = author?.isBot
        ? Math.min(SCALA.MAX, Math.max(SCALA.MIN, Math.round((target.lo + target.hi) / 2 + randomBetween(-1.4, 1.4))))
        : randInt(3, 8);
      this.botAct(b, 2_000, 8_000, () => ({ type: 'guess', value }));
    }
  }

  protected stepState(): ScalaPublic | null {
    switch (this.step) {
      case 'write':
        return { step: 'write', round: this.round, total: this.rounds, submitted: [...this.answers.keys()] };
      case 'guess': {
        const { theme } = this.secrets.get(this.author)!;
        return {
          step: 'guess',
          ...this.header(),
          theme: { text: theme.text, scale: theme.scale },
          answer: this.answers.get(this.author)!,
          guessed: [...this.guesses.keys()]
        };
      }
      case 'reveal':
        return this.lastReveal;
      default:
        return null;
    }
  }

  privateState(p: Player): ScalaPrivate {
    const mine = this.step === 'write' ? this.secrets.get(p.id) : undefined;
    return {
      theme: mine ? { text: mine.theme.text, scale: mine.theme.scale } : null,
      target: mine?.target ?? null,
      myAnswer: this.answers.get(p.id) ?? null,
      myGuess: this.step === 'guess' ? (this.guesses.get(p.id) ?? null) : null,
      isAuthor: this.step === 'guess' && p.id === this.author
    };
  }
}
