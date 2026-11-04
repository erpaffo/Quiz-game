import { GEMELLE, type GemellePrivate, type GemellePublic, type GemelleSharedWord } from '../../../shared/gemelle';
import { BaseShow } from '../../core/BaseShow';
import { cleanText, payloadOf, wordKey } from '../../core/input';
import type { ActionResult } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { pickFresh, shuffle } from '../../util';
import { GEMELLE_FALLBACK, GEMELLE_PROMPTS, type GemellePrompt } from './prompts';

/**
 * 💞 Anime Gemelle: data una parola, scrivi tutte le associazioni che puoi.
 * Ogni tua parola vale 100 punti per ogni altro giocatore che l'ha scritta.
 * Round 3–4: il prompt è la parola più condivisa scritta dal gruppo (twist di MegaPals).
 */
export class GemelleShow extends BaseShow<GemellePublic, GemellePrivate> {
  readonly id = 'gemelle' as const;

  private round = 0;
  private prompt: GemellePrompt = GEMELLE_PROMPTS[0];
  private usedPrompts = new Set<string>();
  /** Parole del round: giocatore → (chiave → testo originale). */
  private words = new Map<string, Map<string, string>>();
  private done = new Set<string>();
  private shared: GemelleSharedWord[] = [];
  private roundPoints: Record<string, number> = {};
  /** Parole in comune per coppia di giocatori ("a|b" con a < b), su tutta la partita. */
  private common = new Map<string, number>();
  /** Parola più condivisa in assoluto finora: candidata a prompt dei round 3–4. */
  private bestShared: { word: string; count: number } | null = null;

  start(): ActionResult {
    this.nextRound();
    return null;
  }

  private nextRound() {
    this.round++;
    this.words.clear();
    this.done.clear();
    const fromGroup = this.round > 2 && this.bestShared && !this.usedPrompts.has(wordKey(this.bestShared.word));
    if (fromGroup) {
      this.prompt = { word: capitalize(this.bestShared!.word), associations: [] };
      this.bestShared = null;
    } else {
      this.prompt = pickFresh(GEMELLE_PROMPTS, 1, this.ctx.seen(this.id), (p) => wordKey(p.word))[0];
    }
    this.usedPrompts.add(wordKey(this.prompt.word));
    this.go('write', GEMELLE.WRITE_MS, () => this.score());
  }

  private score() {
    // Chiave → giocatori che l'hanno scritta.
    const writers = new Map<string, string[]>();
    const display = new Map<string, string>();
    for (const [pid, list] of this.words) {
      for (const [key, text] of list) {
        if (!writers.has(key)) {
          writers.set(key, []);
          display.set(key, text);
        }
        writers.get(key)!.push(pid);
      }
    }
    this.roundPoints = {};
    for (const p of this.ctx.players()) {
      let pts = 0;
      for (const key of this.words.get(p.id)?.keys() ?? []) pts += (writers.get(key)!.length - 1) * GEMELLE.POINTS_PER_MATCH;
      this.roundPoints[p.id] = this.ctx.addScore(p, pts);
    }
    this.shared = [...writers]
      .filter(([, by]) => by.length >= 2)
      .map(([key, by]) => ({ word: display.get(key)!, by }))
      .sort((a, b) => b.by.length - a.by.length || a.word.localeCompare(b.word));
    for (const { word, by } of this.shared) {
      if (!this.bestShared || by.length > this.bestShared.count) this.bestShared = { word, count: by.length };
      for (let i = 0; i < by.length; i++) {
        for (let j = i + 1; j < by.length; j++) {
          const pair = [by[i], by[j]].sort().join('|');
          this.common.set(pair, (this.common.get(pair) ?? 0) + 1);
        }
      }
    }
    // Una parola-prompt deve essere diversa dalla parola di partenza del round.
    if (this.bestShared && wordKey(this.bestShared.word) === wordKey(this.prompt.word)) this.bestShared = null;
    this.go('matches', GEMELLE.MATCHES_MS, () => (this.round < this.rounds ? this.nextRound() : this.soulmates()));
  }

  private soulmates() {
    this.go('soulmates', GEMELLE.SOULMATES_MS, () => this.finish());
  }

  private soulmatePairs() {
    const best = Math.max(0, ...this.common.values());
    if (best === 0) return [];
    return [...this.common].filter(([, n]) => n === best).map(([pair, common]) => {
      const [a, b] = pair.split('|');
      return { a, b, common };
    });
  }

  handleAction(p: Player, a: unknown): ActionResult {
    if (this.step !== 'write') return 'Non è il momento di scrivere';
    if (payloadOf(a, 'done')) {
      this.done.add(p.id);
      return null;
    }
    const add = payloadOf(a, 'word');
    const remove = payloadOf(a, 'removeWord');
    const text = cleanText((add ?? remove)?.text, GEMELLE.WORD_MAX_CHARS);
    if (!text) return 'Scrivi una parola';
    const key = wordKey(text);
    if (!key) return 'Parola non valida';
    const list = this.words.get(p.id) ?? new Map<string, string>();
    this.words.set(p.id, list);
    if (remove) {
      list.delete(key);
      return null;
    }
    if (key === wordKey(this.prompt.word)) return 'Non vale scrivere la parola di partenza!';
    if (list.has(key)) return 'L’hai già scritta';
    if (list.size >= GEMELLE.MAX_WORDS) return `Massimo ${GEMELLE.MAX_WORDS} parole`;
    list.set(key, text);
    this.done.delete(p.id);
    return null;
  }

  hasActed(p: Player): boolean {
    return this.step === 'write' && this.done.has(p.id);
  }

  bot(b: Player): void {
    if (this.step !== 'write') return;
    const pool = this.prompt.associations.length ? this.prompt.associations : GEMELLE_FALLBACK;
    const chosen = shuffle(pool).slice(0, 4 + Math.floor(Math.random() * 4));
    chosen.forEach((word, i) => this.botAct(b, 2_000 + i * 2_500, 3_500 + i * 2_500, () => ({ type: 'word', text: word })));
    this.botAct(b, 3_500 + chosen.length * 2_500, 5_000 + chosen.length * 2_500, () => ({ type: 'done' }));
  }

  protected stepState(): GemellePublic | null {
    const base = { round: this.round, total: this.rounds, prompt: this.prompt.word };
    switch (this.step) {
      case 'write':
        return {
          step: 'write' as const,
          ...base,
          counts: Object.fromEntries(this.ctx.players().map((p) => [p.id, this.words.get(p.id)?.size ?? 0])),
          done: [...this.done]
        };
      case 'matches':
        return { step: 'matches' as const, ...base, shared: this.shared, points: this.roundPoints };
      case 'soulmates':
        return { step: 'soulmates' as const, pairs: this.soulmatePairs() };
      default:
        return null;
    }
  }

  privateState(p: Player): GemellePrivate {
    return { words: this.step === 'write' ? [...(this.words.get(p.id)?.values() ?? [])] : [], done: this.done.has(p.id) };
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
