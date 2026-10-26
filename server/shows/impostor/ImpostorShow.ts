import { IMPOSTOR, type ImpostorClue, type ImpostorPrivate, type ImpostorPublic } from '../../../shared/impostor';
import { BaseShow } from '../../core/BaseShow';
import { cleanText, normalize, payloadOf, tally, topKeys, wordKey } from '../../core/input';
import type { ActionResult } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { pick, shuffle } from '../../util';
import { IMPOSTOR_CATEGORIES, type ImpostorCategory } from './words';

/**
 * 🕵️ L'Impostore: tutti vedono la parola segreta tranne uno, che conosce solo la categoria.
 * Indizi di una parola → discussione → voto. Se l'impostore è smascherato può ancora vincere
 * indovinando la parola. 3 round, impostore diverso ogni volta.
 */
export class ImpostorShow extends BaseShow<ImpostorPublic, ImpostorPrivate> {
  readonly id = 'impostor' as const;

  private round = 0;
  private order: string[] = [];
  private impostorId = '';
  private category: ImpostorCategory = IMPOSTOR_CATEGORIES[0];
  private word = { word: '', clues: [] as string[] };
  private usedWords = new Set<string>();
  private clues = new Map<string, string>();
  private ready = new Set<string>();
  private votes = new Map<string, string>();
  private impostorGuess: string | null = null;
  private lastReveal: Extract<ImpostorPublic, { step: 'reveal' }> | null = null;

  start(): ActionResult {
    this.order = shuffle(this.ctx.players().map((p) => p.id));
    this.nextRound();
    return null;
  }

  private nextRound() {
    if (this.round >= this.rounds) return this.finish();
    this.round++;
    this.clues.clear();
    this.ready.clear();
    this.votes.clear();
    this.impostorGuess = null;
    const candidates = this.order.filter((id) => this.ctx.get(id));
    this.impostorId = candidates[(this.round - 1) % candidates.length];
    this.category = pick(IMPOSTOR_CATEGORIES);
    const fresh = this.category.words.filter((w) => !this.usedWords.has(w.word));
    this.word = pick(fresh.length ? fresh : this.category.words);
    this.usedWords.add(this.word.word);
    this.go('secret', IMPOSTOR.SECRET_MS, () => this.go('clue', IMPOSTOR.CLUE_MS, () => this.discuss()));
  }

  private discuss() {
    this.go('discuss', IMPOSTOR.DISCUSS_MS, () => this.go('vote', IMPOSTOR.VOTE_MS, () => this.afterVote()));
  }

  /** Smascherato = l'impostore è l'unico più votato. */
  private get caught(): boolean {
    const top = topKeys(tally(this.votes.values()));
    return top.length === 1 && top[0] === this.impostorId;
  }

  private afterVote() {
    if (this.opt('lastChance') === 'on' && this.caught && this.ctx.get(this.impostorId)) this.go('guess', IMPOSTOR.GUESS_MS, () => this.reveal());
    else this.reveal();
  }

  private reveal() {
    const caught = this.caught;
    const guessedRight = caught && this.impostorGuess !== null && wordKey(this.impostorGuess) === wordKey(this.word.word);
    const points: Record<string, number> = {};
    for (const p of this.ctx.players()) {
      let pts = 0;
      if (p.id === this.impostorId) {
        if (!caught || guessedRight) pts += IMPOSTOR.IMPOSTOR_POINTS;
      } else {
        if (this.votes.get(p.id) === this.impostorId) pts += IMPOSTOR.CATCH_POINTS;
        if (caught && !guessedRight) pts += IMPOSTOR.CREW_BONUS;
      }
      points[p.id] = this.ctx.addScore(p, pts);
    }
    this.lastReveal = {
      step: 'reveal',
      ...this.header(),
      word: this.word.word,
      impostorId: this.impostorId,
      caught,
      impostorGuess: caught ? this.impostorGuess : null,
      guessedRight,
      votes: this.ctx.players().map((p) => ({ playerId: p.id, targetId: this.votes.get(p.id) ?? null })),
      points
    };
    this.go('reveal', IMPOSTOR.REVEAL_MS, () => this.nextRound());
  }

  private header() {
    return { round: this.round, total: this.rounds, category: this.category.name };
  }

  private clueList(): ImpostorClue[] {
    return this.ctx.players().map((p) => ({ playerId: p.id, clue: this.clues.get(p.id) ?? null }));
  }

  handleAction(p: Player, a: unknown): ActionResult {
    const clue = payloadOf(a, 'clue');
    if (clue) {
      if (this.step !== 'clue') return 'Non è il momento degli indizi';
      const text = cleanText(clue.text, IMPOSTOR.CLUE_MAX_CHARS);
      if (!text) return 'Scrivi un indizio';
      if (text.includes(' ')) return 'Una sola parola!';
      if (p.id !== this.impostorId && (wordKey(text) === wordKey(this.word.word) || normalize(text).includes(normalize(this.word.word)))) {
        return 'Non puoi scrivere la parola segreta!';
      }
      this.clues.set(p.id, text);
      return null;
    }
    if (payloadOf(a, 'ready')) {
      if (this.step !== 'discuss') return 'Non è il momento';
      this.ready.add(p.id);
      return null;
    }
    const vote = payloadOf(a, 'vote');
    if (vote) {
      if (this.step !== 'vote') return 'Non è il momento di votare';
      if (vote.targetId === p.id) return 'Non puoi votare te stesso';
      if (typeof vote.targetId !== 'string' || !this.ctx.get(vote.targetId)) return 'Giocatore non valido';
      this.votes.set(p.id, vote.targetId);
      return null;
    }
    const guess = payloadOf(a, 'guess');
    if (guess) {
      if (this.step !== 'guess' || p.id !== this.impostorId) return 'Solo l’impostore smascherato può tentare';
      const text = cleanText(guess.text, 30);
      if (!text) return 'Scrivi la parola';
      this.impostorGuess = text;
      return null;
    }
    return 'Azione non valida';
  }

  hasActed(p: Player): boolean {
    switch (this.step) {
      case 'clue':
        return this.clues.has(p.id);
      case 'discuss':
        return this.ready.has(p.id);
      case 'vote':
        return this.votes.has(p.id);
      case 'guess':
        return p.id !== this.impostorId || this.impostorGuess !== null;
      default:
        return false;
    }
  }

  bot(b: Player): void {
    const isImpostor = b.id === this.impostorId;
    if (this.step === 'clue') {
      const text = pick(isImpostor ? this.category.generic : this.word.clues);
      this.botAct(b, 3_000, 15_000, () => ({ type: 'clue', text }));
    }
    if (this.step === 'discuss') this.botAct(b, 4_000, 12_000, () => ({ type: 'ready' }));
    if (this.step === 'vote') {
      this.botAct(b, 2_000, 10_000, () => {
        const others = this.ctx.players().filter((o) => o.id !== b.id);
        // Un bot della squadra sospetta chi ha dato un indizio "fuori tema" (o nessun indizio).
        const odd = others.filter((o) => !this.word.clues.includes(this.clues.get(o.id) ?? ''));
        const target = !isImpostor && odd.length && Math.random() < 0.7 ? pick(odd) : pick(others);
        return target && { type: 'vote', targetId: target.id };
      });
    }
    if (this.step === 'guess' && isImpostor) {
      this.botAct(b, 3_000, 10_000, () => ({ type: 'guess', text: pick(this.category.words).word }));
    }
  }

  protected stepState(): ImpostorPublic | null {
    const h = this.header();
    switch (this.step) {
      case 'secret':
        return { step: 'secret', ...h };
      case 'clue':
        return { step: 'clue', ...h, submitted: [...this.clues.keys()] };
      case 'discuss':
        return { step: 'discuss', ...h, clues: this.clueList(), ready: [...this.ready] };
      case 'vote':
        return { step: 'vote', ...h, clues: this.clueList(), voted: [...this.votes.keys()] };
      case 'guess':
        return { step: 'guess', ...h, clues: this.clueList(), impostorId: this.impostorId };
      case 'reveal':
        return this.lastReveal;
      default:
        return null;
    }
  }

  privateState(p: Player): ImpostorPrivate {
    const inRound = this.step !== 'final' && this.step !== 'idle';
    const isImpostor = p.id === this.impostorId;
    return {
      role: inRound ? (isImpostor ? 'impostor' : 'crew') : null,
      word: inRound && !isImpostor ? this.word.word : null,
      myClue: this.clues.get(p.id) ?? null,
      myVote: this.votes.get(p.id) ?? null
    };
  }
}
