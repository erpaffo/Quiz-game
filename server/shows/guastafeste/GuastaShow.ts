import { GUASTA, type GuastaPrivate, type GuastaPublic } from '../../../shared/guastafeste';
import { BaseShow } from '../../core/BaseShow';
import { cleanText, isIntIn, payloadOf } from '../../core/input';
import { circularPairs } from '../../core/matchup';
import type { ActionResult } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { pick, pickFresh, shuffle } from '../../util';
import { GUASTA_FAVORITE_FALLBACK, GUASTA_FIX, GUASTA_PROMPTS, GUASTA_RUIN } from './content';

interface Matchup {
  id: string;
  prompt: string;
  players: [string, string];
  answers: Map<string, string>;
}

/**
 * 💥 Guastafeste: 3 round di battute 1 contro 1 votate dal pubblico.
 * 1 Rovina una situazione bella · 2 Rovina la cosa preferita di un amico · 3 Ripara una situazione rovinata.
 */
export class GuastaShow extends BaseShow<GuastaPublic, GuastaPrivate> {
  readonly id = 'guastafeste' as const;

  private round = 0;
  private order: string[] = [];
  private favorites = new Map<string, string>();
  private matchups: Matchup[] = [];
  private index = 0;
  private votes = new Map<string, number>();
  /** Battute vincenti dei round 1–2: diventano i temi da riparare nel round 3. */
  private ruined: string[] = [];
  private lastResult: Extract<GuastaPublic, { step: 'result' }> | null = null;

  start(): ActionResult {
    this.order = shuffle(this.ctx.players().map((p) => p.id));
    this.nextRound();
    return null;
  }

  private get current(): Matchup {
    return this.matchups[this.index];
  }

  private header() {
    return { round: this.round, total: this.rounds, roundName: GUASTA.ROUND_NAMES[this.round - 1] };
  }

  private nextRound() {
    if (this.round >= this.rounds) return this.finish();
    this.round++;
    this.order = this.order.filter((id) => this.ctx.get(id));
    if (this.round === 2) {
      this.favorites.clear();
      this.go('favorite', GUASTA.FAVORITE_MS, () => this.write());
    } else {
      this.write();
    }
  }

  private write() {
    const n = this.order.length;
    let prompts: string[];
    let pairs: [string, string][];
    if (this.round === 2) {
      // Il preferito di order[i] va rovinato da altri due: offset 1 evita che tocchi a lui.
      prompts = this.order.map((id) => this.favorites.get(id) ?? pick(GUASTA_FAVORITE_FALLBACK));
      pairs = circularPairs(this.order, 1);
    } else {
      const pool = this.round === 1 ? pickFresh(GUASTA_PROMPTS, n, this.ctx.seen(this.id), (p) => p) : shuffle(this.ruined);
      prompts = Array.from({ length: n }, (_, i) => pool[i % pool.length] ?? pick(GUASTA_PROMPTS));
      pairs = circularPairs(shuffle(this.order));
    }
    this.matchups = prompts.map((prompt, i) => ({ id: `r${this.round}m${i + 1}`, prompt, players: pairs[i], answers: new Map() }));
    this.go('write', GUASTA.WRITE_MS, () => {
      // Le sfide senza nessuna risposta si saltano.
      this.matchups = this.matchups.filter((m) => m.answers.size > 0);
      this.index = 0;
      this.nextVote();
    });
  }

  private nextVote() {
    if (this.index >= this.matchups.length) return this.nextRound();
    this.votes.clear();
    this.go('vote', GUASTA.VOTE_MS, () => this.result());
  }

  private result() {
    const m = this.current;
    const mult = this.round;
    // Gli offline che non hanno votato non contano (altrimenti il cappotto è impossibile).
    const voters = this.ctx.players().filter((p) => !m.players.includes(p.id) && (p.connected || this.votes.has(p.id))).length;
    const counts = [0, 0];
    for (const side of this.votes.values()) counts[side]++;
    const sweep = voters >= 2 && counts.some((c) => c === voters);
    const answers = m.players.map((pid, side) => {
      const p = this.ctx.get(pid);
      let pts = counts[side] * GUASTA.POINTS_PER_VOTE * mult;
      if (sweep && counts[side] === voters) pts += GUASTA.SWEEP_BONUS * mult;
      return { playerId: pid, text: this.answerOf(m, side), votes: counts[side], points: p ? this.ctx.addScore(p, pts) : 0 };
    });
    if (this.round < 3) {
      const best = counts[0] >= counts[1] ? 0 : 1;
      if (m.answers.has(m.players[best])) this.ruined.push(`${m.prompt}… ma ${lowerFirst(this.answerOf(m, best))}`);
    }
    this.lastResult = { step: 'result', ...this.header(), index: this.index + 1, count: this.matchups.length, prompt: m.prompt, answers, sweep };
    this.go('result', GUASTA.RESULT_MS, () => {
      this.index++;
      this.nextVote();
    });
  }

  private answerOf(m: Matchup, side: number): string {
    return m.answers.get(m.players[side]) ?? GUASTA.NO_ANSWER;
  }

  private myMatchups(playerId: string): Matchup[] {
    return this.matchups.filter((m) => m.players.includes(playerId));
  }

  handleAction(p: Player, a: unknown): ActionResult {
    const fav = payloadOf(a, 'favorite');
    if (fav) {
      if (this.step !== 'favorite') return 'Non è il momento';
      const text = cleanText(fav.text, GUASTA.MAX_CHARS);
      if (!text) return 'Scrivi la cosa che ami';
      this.favorites.set(p.id, text);
      return null;
    }
    const answer = payloadOf(a, 'answer');
    if (answer) {
      if (this.step !== 'write') return 'Non è il momento di scrivere';
      const m = this.matchups.find((x) => x.id === answer.promptId && x.players.includes(p.id));
      if (!m) return 'Tema non valido';
      const text = cleanText(answer.text, GUASTA.MAX_CHARS);
      if (!text) return 'Scrivi una risposta';
      m.answers.set(p.id, text);
      return null;
    }
    const vote = payloadOf(a, 'vote');
    if (vote) {
      if (this.step !== 'vote') return 'Non è il momento di votare';
      if (this.current.players.includes(p.id)) return 'Sei in sfida: non puoi votare';
      if (!isIntIn(vote.side, 0, 1)) return 'Voto non valido';
      this.votes.set(p.id, vote.side);
      return null;
    }
    return 'Azione non valida';
  }

  hasActed(p: Player): boolean {
    switch (this.step) {
      case 'favorite':
        return this.favorites.has(p.id);
      case 'write':
        return this.myMatchups(p.id).every((m) => m.answers.has(p.id));
      case 'vote':
        return this.current.players.includes(p.id) || this.votes.has(p.id) || !p.connected;
      default:
        return false;
    }
  }

  bot(b: Player): void {
    if (this.step === 'favorite') this.botAct(b, 2_000, 10_000, () => ({ type: 'favorite', text: pick(GUASTA_FAVORITE_FALLBACK) }));
    if (this.step === 'write') {
      const lines = shuffle(this.round === 3 ? GUASTA_FIX : GUASTA_RUIN);
      this.myMatchups(b.id).forEach((m, i) =>
        this.botAct(b, 5_000 + i * 8_000, 12_000 + i * 8_000, () => ({ type: 'answer', promptId: m.id, text: lines[i % lines.length] }))
      );
    }
    if (this.step === 'vote' && !this.current.players.includes(b.id)) {
      this.botAct(b, 2_000, 9_000, () => ({ type: 'vote', side: Math.random() < 0.5 ? 0 : 1 }));
    }
  }

  protected stepState(): GuastaPublic | null {
    const h = this.header();
    const done = () => this.ctx.players().filter((p) => this.hasActed(p)).map((p) => p.id);
    switch (this.step) {
      case 'favorite':
        return { step: 'favorite', ...h, submitted: [...this.favorites.keys()] };
      case 'write':
        return { step: 'write', ...h, submitted: done() };
      case 'vote': {
        const m = this.current;
        return {
          step: 'vote',
          ...h,
          index: this.index + 1,
          count: this.matchups.length,
          prompt: m.prompt,
          answers: [this.answerOf(m, 0), this.answerOf(m, 1)],
          contenders: m.players,
          voted: [...this.votes.keys()]
        };
      }
      case 'result':
        return this.lastResult;
      default:
        return null;
    }
  }

  privateState(p: Player): GuastaPrivate {
    return {
      prompts:
        this.step === 'write'
          ? this.myMatchups(p.id).map((m) => ({ id: m.id, text: m.prompt, answer: m.answers.get(p.id) ?? null }))
          : [],
      favorite: this.favorites.get(p.id) ?? null,
      contender: this.step === 'vote' && this.current.players.includes(p.id),
      myVote: this.step === 'vote' ? (this.votes.get(p.id) ?? null) : null
    };
  }
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
