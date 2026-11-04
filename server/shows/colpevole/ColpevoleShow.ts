import { COLPEVOLE, type ColpevoleClue, type ColpevolePrivate, type ColpevolePublic, type ColpevoleQuestion } from '../../../shared/colpevole';
import { BaseShow } from '../../core/BaseShow';
import { cleanText, isIntIn, payloadOf, tally, topKeys } from '../../core/input';
import type { ActionResult } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { pick, pickFresh, shuffle } from '../../util';

export const COLPEVOLE_SURVEY: readonly ColpevoleQuestion[] = [
  { text: 'Cane o gatto?', options: ['Cane', 'Gatto'] },
  { text: 'Mare o montagna?', options: ['Mare', 'Montagna'] },
  { text: 'Dolce o salato?', options: ['Dolce', 'Salato'] },
  { text: 'Mattina o sera?', options: ['Mattina', 'Sera'] },
  { text: 'Caffè o tè?', options: ['Caffè', 'Tè'] },
  { text: 'Film o serie TV?', options: ['Film', 'Serie TV'] },
  { text: 'Pizza o sushi?', options: ['Pizza', 'Sushi'] },
  { text: 'Estate o inverno?', options: ['Estate', 'Inverno'] },
  { text: 'Libro o videogioco?', options: ['Libro', 'Videogioco'] },
  { text: 'Città o campagna?', options: ['Città', 'Campagna'] },
  { text: 'Doccia o bagno?', options: ['Doccia', 'Bagno'] },
  { text: 'Messaggio o telefonata?', options: ['Messaggio', 'Telefonata'] },
  { text: 'Pandoro o panettone?', options: ['Pandoro', 'Panettone'] },
  { text: 'Treno o aereo?', options: ['Treno', 'Aereo'] }
];

const BOT_ALIBIS = [
  'Ero a casa a guardare la TV',
  'Io? Stavo dormendo!',
  'Chiedete a mia nonna, ero da lei',
  'Ho un alibi di ferro: ero in palestra',
  'Guardate gli indizi: non c’entro niente',
  'Ero in coda alla posta, figuratevi'
];

/**
 * 🔍 Il Colpevole: sondaggio → (per ogni caso) ruolo segreto e falsificazione → indizi → alibi → accusa.
 */
export class ColpevoleShow extends BaseShow<ColpevolePublic, ColpevolePrivate> {
  readonly id = 'colpevole' as const;

  private questions: ColpevoleQuestion[] = [];
  /** Risposte vere. */
  private answers = new Map<string, number[]>();
  private caseNo = 0;
  private culprits: string[] = [];
  private culpritId = '';
  private falsified: number | null = null;
  private clueQueue: ColpevoleClue[] = [];
  private clues: ColpevoleClue[] = [];
  private alibis = new Map<string, string>();
  private votes = new Map<string, string>();
  private lastReveal: Extract<ColpevolePublic, { step: 'reveal' }> | null = null;

  start(): ActionResult {
    this.questions = pickFresh(COLPEVOLE_SURVEY, COLPEVOLE.QUESTIONS, this.ctx.seen(this.id), (q) => q.text);
    this.go('survey', COLPEVOLE.SURVEY_MS, () => {
      // Chi non ha risposto riceve risposte a caso: il tabellone deve essere completo.
      for (const p of this.ctx.players()) {
        if (!this.answers.has(p.id)) this.answers.set(p.id, this.questions.map(() => (Math.random() < 0.5 ? 0 : 1)));
      }
      this.culprits = shuffle(this.ctx.players().map((p) => p.id));
      const online = this.culprits.filter((id) => this.ctx.get(id)?.connected);
      if (online.length) this.culprits = online;
      this.nextCase();
    });
    return null;
  }

  private nextCase() {
    if (this.caseNo >= this.rounds) return this.finish();
    this.caseNo++;
    // Modulo sulla lista dei soli connessi (con più casi che giocatori il colpevole può tornare).
    const online = this.culprits.filter((id) => this.ctx.get(id)?.connected);
    const present = online.length ? online : this.culprits.filter((id) => this.ctx.get(id));
    this.culpritId = present[(this.caseNo - 1) % present.length];
    this.falsified = null;
    this.clues = [];
    this.alibis.clear();
    this.votes.clear();
    this.go('role', COLPEVOLE.ROLE_MS, () => {
      this.clueQueue = this.pickClues();
      this.nextClue();
    });
  }

  /** Indizi più informativi: domande su cui il colpevole NON la pensa come tutti gli altri. */
  private pickClues(): ColpevoleClue[] {
    const truth = this.answers.get(this.culpritId)!;
    const all = this.questions.map((_, qi) => ({ questionIndex: qi, answer: truth[qi] }));
    const sameAsAll = (c: ColpevoleClue) => [...this.answers.values()].every((a) => a[c.questionIndex] === c.answer);
    const useful = shuffle(all.filter((c) => !sameAsAll(c)));
    const rest = shuffle(all.filter(sameAsAll));
    return [...useful, ...rest].slice(0, COLPEVOLE.CLUES);
  }

  private nextClue() {
    const clue = this.clueQueue.shift();
    if (!clue) return this.go('vote', COLPEVOLE.VOTE_MS, () => this.reveal());
    this.clues.push(clue);
    // Dopo il 2° indizio: alibi. Poi l'ultimo indizio e il voto.
    const after = this.clues.length === 2 ? () => this.go('alibi', COLPEVOLE.ALIBI_MS, () => this.nextClue()) : () => this.nextClue();
    this.go('clue', COLPEVOLE.CLUE_MS, after);
  }

  /** Risposte pubbliche: quelle vere, tranne quella falsificata dal colpevole. */
  private board() {
    return this.ctx.players().map((p) => {
      const answers = [...(this.answers.get(p.id) ?? [])];
      if (p.id === this.culpritId && this.falsified !== null) answers[this.falsified] = 1 - answers[this.falsified];
      return { playerId: p.id, answers };
    });
  }

  private suspects(): string[] {
    return this.board()
      .filter((row) => this.clues.every((c) => row.answers[c.questionIndex] === c.answer))
      .map((row) => row.playerId);
  }

  private get caught(): boolean {
    const top = topKeys(tally(this.votes.values()));
    return top.length === 1 && top[0] === this.culpritId;
  }

  private reveal() {
    const caught = this.caught;
    const points: Record<string, number> = {};
    const onInnocents = [...this.votes.values()].filter((t) => t !== this.culpritId).length;
    for (const p of this.ctx.players()) {
      let pts = 0;
      if (p.id === this.culpritId) {
        if (!caught) pts += COLPEVOLE.ESCAPE_POINTS;
        pts += onInnocents * COLPEVOLE.MISLEAD_POINTS;
      } else {
        if (this.votes.get(p.id) === this.culpritId) pts += COLPEVOLE.CATCH_POINTS;
        if (caught) pts += COLPEVOLE.TEAM_BONUS;
      }
      points[p.id] = this.ctx.addScore(p, pts);
    }
    this.lastReveal = {
      step: 'reveal',
      ...this.caseState(),
      culpritId: this.culpritId,
      falsified: this.falsified,
      caught,
      votes: this.ctx.players().map((p) => ({ playerId: p.id, targetId: this.votes.get(p.id) ?? null })),
      points
    };
    this.go('reveal', COLPEVOLE.REVEAL_MS, () => this.nextCase());
  }

  private caseState() {
    return {
      case: this.caseNo,
      cases: this.rounds,
      questions: this.questions,
      board: this.board(),
      clues: [...this.clues],
      suspects: this.suspects()
    };
  }

  handleAction(p: Player, a: unknown): ActionResult {
    const survey = payloadOf(a, 'survey');
    if (survey) {
      if (this.step !== 'survey') return 'Il sondaggio è chiuso';
      const ans = survey.answers;
      if (!Array.isArray(ans) || ans.length !== this.questions.length || !ans.every((v) => isIntIn(v, 0, 1))) return 'Rispondi a tutte le domande';
      this.answers.set(p.id, [...(ans as number[])]);
      return null;
    }
    const falsify = payloadOf(a, 'falsify');
    if (falsify) {
      if (this.step !== 'role' || p.id !== this.culpritId) return 'Solo il colpevole può falsificare, all’inizio del caso';
      if (this.falsified !== null) return 'Hai già falsificato una risposta';
      if (!isIntIn(falsify.questionIndex, 0, this.questions.length - 1)) return 'Domanda non valida';
      this.falsified = falsify.questionIndex;
      return null;
    }
    const alibi = payloadOf(a, 'alibi');
    if (alibi) {
      if (this.step !== 'alibi') return 'Non è il momento dell’alibi';
      const text = cleanText(alibi.text, COLPEVOLE.ALIBI_MAX);
      if (!text) return 'Scrivi il tuo alibi';
      this.alibis.set(p.id, text);
      return null;
    }
    const vote = payloadOf(a, 'vote');
    if (vote) {
      if (this.step !== 'vote') return 'Non è il momento di accusare';
      if (vote.targetId === p.id) return 'Non puoi accusare te stesso';
      if (typeof vote.targetId !== 'string' || !this.ctx.get(vote.targetId)) return 'Giocatore non valido';
      this.votes.set(p.id, vote.targetId);
      return null;
    }
    return 'Azione non valida';
  }

  hasActed(p: Player): boolean {
    switch (this.step) {
      case 'survey':
        return this.answers.has(p.id);
      case 'role':
        // Solo il colpevole ha qualcosa da fare (o niente: falsificare è facoltativo).
        return p.id !== this.culpritId || this.falsified !== null;
      case 'alibi':
        return this.alibis.has(p.id);
      case 'vote':
        return this.votes.has(p.id);
      default:
        return false;
    }
  }

  bot(b: Player): void {
    if (this.step === 'survey') {
      this.botAct(b, 3_000, 20_000, () => ({ type: 'survey', answers: this.questions.map(() => (Math.random() < 0.5 ? 0 : 1)) }));
    }
    if (this.step === 'role' && b.id === this.culpritId && Math.random() < 0.6) {
      this.botAct(b, 2_000, 6_000, () => ({ type: 'falsify', questionIndex: Math.floor(Math.random() * this.questions.length) }));
    }
    if (this.step === 'alibi') this.botAct(b, 3_000, 15_000, () => ({ type: 'alibi', text: pick(BOT_ALIBIS) }));
    if (this.step === 'vote') {
      this.botAct(b, 3_000, 15_000, () => {
        const others = this.ctx.players().filter((o) => o.id !== b.id).map((o) => o.id);
        const suspects = this.suspects().filter((id) => id !== b.id);
        const target = suspects.length ? pick(suspects) : pick(others);
        return target && { type: 'vote', targetId: target };
      });
    }
  }

  protected stepState(): ColpevolePublic | null {
    switch (this.step) {
      case 'survey':
        return { step: 'survey', questions: this.questions, submitted: [...this.answers.keys()] };
      case 'role':
        return { step: 'role', case: this.caseNo, cases: this.rounds };
      case 'clue':
        return { step: 'clue', ...this.caseState() };
      case 'alibi':
        return { step: 'alibi', ...this.caseState(), submitted: [...this.alibis.keys()] };
      case 'vote':
        return {
          step: 'vote',
          ...this.caseState(),
          alibis: this.ctx.players().map((p) => ({ playerId: p.id, text: this.alibis.get(p.id) ?? null })),
          voted: [...this.votes.keys()]
        };
      case 'reveal':
        return this.lastReveal;
      default:
        return null;
    }
  }

  privateState(p: Player): ColpevolePrivate {
    const inCase = this.caseNo > 0 && this.step !== 'final';
    const isCulprit = inCase && p.id === this.culpritId;
    return {
      role: inCase ? (isCulprit ? 'culprit' : 'detective') : null,
      myAnswers: this.answers.get(p.id) ?? null,
      canFalsify: isCulprit && this.step === 'role' && this.falsified === null,
      falsified: isCulprit ? this.falsified : null,
      myAlibi: this.alibis.get(p.id) ?? null,
      myVote: this.votes.get(p.id) ?? null
    };
  }
}
