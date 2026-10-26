import { SMIST, type SmistPrivate, type SmistPublic, type SmistSide, type SmistTeam, type SmistTeamState } from '../../../shared/smistatori';
import { BaseShow } from '../../core/BaseShow';
import { payloadOf } from '../../core/input';
import type { ActionResult } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { shuffle } from '../../util';
import { SMIST_PAIRS, type SmistPair } from './pairs';

interface TeamRun {
  members: string[];
  index: number;
  turn: number;
  score: number;
  streak: number;
}

const TEAMS: SmistTeam[] = ['A', 'B'];

/**
 * 🗂️ Smistatori: due squadre, due categorie, parole a raffica. Ogni parola arriva sul telefono di un solo
 * membro (a turno); giusto +100 (×2 in serie), sbagliato −50. Vince il round la squadra con più punti.
 */
export class SmistShow extends BaseShow<SmistPublic, SmistPrivate> {
  readonly id = 'smistatori' as const;

  private teams: Record<SmistTeam, string[]> = { A: [], B: [] };
  private round = 0;
  private pairs: SmistPair[] = [];
  private words: { id: string; text: string; side: SmistSide }[] = [];
  private run: Record<SmistTeam, TeamRun> = { A: this.emptyRun([]), B: this.emptyRun([]) };
  private feed: Extract<SmistPublic, { step: 'round' }>['feed'] = [];
  private winner: SmistTeam | null = null;

  start(): ActionResult {
    // Squadre bilanciate: umani divisi equamente, poi i bot.
    const players = this.ctx.players();
    const ordered = [...shuffle(players.filter((p) => !p.isBot)), ...shuffle(players.filter((p) => p.isBot))];
    ordered.forEach((p, i) => this.teams[TEAMS[i % 2]].push(p.id));
    this.pairs = shuffle(SMIST_PAIRS).slice(0, this.rounds);
    this.go('teams', SMIST.TEAMS_MS, () => this.nextRound());
    return null;
  }

  private emptyRun(members: string[]): TeamRun {
    return { members, index: 0, turn: 0, score: 0, streak: 0 };
  }

  private get pair(): SmistPair {
    return this.pairs[this.round - 1];
  }

  private nextRound() {
    if (this.round >= this.pairs.length) return this.finish();
    this.round++;
    this.words = shuffle(this.pair.words).map((w, i) => ({ id: `w${i + 1}`, ...w }));
    this.run = { A: this.emptyRun(this.teams.A), B: this.emptyRun(this.teams.B) };
    this.feed = [];
    this.go('round', SMIST.ROUND_MS, () => this.result());
  }

  private result() {
    const { A, B } = this.run;
    this.winner = A.score === B.score ? null : A.score > B.score ? 'A' : 'B';
    if (this.winner) {
      for (const id of this.teams[this.winner]) {
        const p = this.ctx.get(id);
        if (p) this.ctx.addScore(p, SMIST.WIN_BONUS);
      }
    }
    this.go('result', SMIST.RESULT_MS, () => this.nextRound());
  }

  private teamOf(playerId: string): SmistTeam | null {
    return this.teams.A.includes(playerId) ? 'A' : this.teams.B.includes(playerId) ? 'B' : null;
  }

  /** Chi ha la parola: a turno tra i membri CONNESSI (se uno esce, tocca subito al successivo). */
  private assignee(team: SmistTeam): string | null {
    const r = this.run[team];
    if (r.index >= this.words.length) return null;
    const online = r.members.filter((id) => this.ctx.get(id)?.connected);
    return online.length ? online[r.turn % online.length] : null;
  }

  private teamState(team: SmistTeam): SmistTeamState {
    const r = this.run[team];
    return { members: r.members, score: r.score, streak: r.streak, done: r.index, total: this.words.length, assignee: this.assignee(team) };
  }

  handleAction(p: Player, a: unknown): ActionResult {
    const sort = payloadOf(a, 'sort');
    if (!sort) return 'Azione non valida';
    if (this.step !== 'round') return 'Non è il momento';
    const team = this.teamOf(p.id);
    if (!team) return 'Non sei in squadra';
    if (this.assignee(team) !== p.id) return 'Non tocca a te';
    const r = this.run[team];
    const word = this.words[r.index];
    if (sort.wordId !== word.id) return 'Parola già smistata';
    if (sort.side !== 'left' && sort.side !== 'right') return 'Lato non valido';
    const side: SmistSide = sort.side;
    const correct = side === word.side;
    let delta: number;
    if (correct) {
      r.streak++;
      delta = SMIST.RIGHT * (r.streak >= SMIST.STREAK ? SMIST.STREAK_MULT : 1);
    } else {
      r.streak = 0;
      delta = SMIST.WRONG;
    }
    r.score = Math.max(0, r.score + delta);
    this.ctx.addScore(p, delta);
    r.index++;
    r.turn++;
    this.feed = [{ team, playerId: p.id, word: word.text, side, correct }, ...this.feed].slice(0, SMIST.FEED);
    if (TEAMS.every((t) => this.run[t].index >= this.words.length)) this.endEarly(800);
    else this.scheduleBot(team);
    return null;
  }

  /** Se ora tocca a un bot, smista dopo un po' (75% di precisione). */
  private scheduleBot(team: SmistTeam) {
    const id = this.assignee(team);
    const b = id ? this.ctx.get(id) : undefined;
    if (!b?.isBot) return;
    const word = this.words[this.run[team].index];
    this.botAct(b, 1_500, 3_000, () => {
      if (this.assignee(team) !== b.id || this.words[this.run[team].index]?.id !== word.id) return null;
      const side: SmistSide = Math.random() < 0.75 ? word.side : word.side === 'left' ? 'right' : 'left';
      return { type: 'sort', wordId: word.id, side };
    });
  }

  onPlayerDisconnect(p: Player): void {
    // La parola passa al compagno successivo: se è un bot, deve ripartire lui.
    const team = this.teamOf(p.id);
    if (team && this.step === 'round') this.scheduleBot(team);
  }

  hasActed(): boolean {
    return false;
  }

  bot(b: Player): void {
    const team = this.teamOf(b.id);
    if (this.step === 'round' && team && this.assignee(team) === b.id) this.scheduleBot(team);
  }

  protected stepState(): SmistPublic | null {
    const teams = { A: this.teamState('A'), B: this.teamState('B') };
    const head = { round: this.round, total: this.pairs.length, left: this.pair?.left ?? '', right: this.pair?.right ?? '' };
    switch (this.step) {
      case 'teams':
        return { step: 'teams', teams: { A: [...this.teams.A], B: [...this.teams.B] } };
      case 'round':
        return { step: 'round', ...head, teams, feed: this.feed };
      case 'result':
        return { step: 'result', ...head, teams, winner: this.winner };
      default:
        return null;
    }
  }

  privateState(p: Player): SmistPrivate {
    const team = this.teamOf(p.id);
    const mine = this.step === 'round' && team && this.assignee(team) === p.id;
    const w = mine ? this.words[this.run[team].index] : null;
    return {
      team,
      word: w ? { id: w.id, text: w.text } : null,
      left: this.step === 'round' ? this.pair.left : null,
      right: this.step === 'round' ? this.pair.right : null
    };
  }
}
