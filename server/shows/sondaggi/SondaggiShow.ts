import { SONDAGGI, type SondaggiPrivate, type SondaggiPublic } from '../../../shared/sondaggi';
import { BaseShow } from '../../core/BaseShow';
import { isIntIn, payloadOf } from '../../core/input';
import type { ActionResult } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { pickFresh, shuffle } from '../../util';

export interface SondaggiQuestion {
  text: string;
  options: string[];
}

export const SONDAGGI_QUESTIONS: readonly SondaggiQuestion[] = [
  { text: 'Cosa porteresti su un’isola deserta?', options: ['Coltellino', 'Libro', 'Telefono', 'Amico', 'Cibo', 'Chitarra', 'Tenda', 'Crema solare'] },
  { text: 'Il miglior condimento per la pasta?', options: ['Pomodoro', 'Pesto', 'Carbonara', 'Ragù', 'Cacio e pepe', 'Amatriciana', 'Burro', 'Aglio e olio'] },
  { text: 'Il superpotere più utile?', options: ['Volare', 'Teletrasporto', 'Invisibilità', 'Leggere nel pensiero', 'Fermare il tempo', 'Super forza', 'Guarire', 'Parlare con gli animali'] },
  { text: 'La cosa più fastidiosa in un viaggio?', options: ['Ritardi', 'Valigia persa', 'Code', 'Vicino rumoroso', 'Caldo', 'Zanzare', 'Wi-Fi assente', 'Mal di mare'] },
  { text: 'L’animale domestico ideale?', options: ['Cane', 'Gatto', 'Coniglio', 'Pesce rosso', 'Pappagallo', 'Criceto', 'Tartaruga', 'Cavallo'] },
  { text: 'Cosa non può mancare a una festa?', options: ['Musica', 'Cibo', 'Amici', 'Torta', 'Giochi', 'Palloncini', 'Bevande', 'Balli'] },
  { text: 'La vacanza perfetta?', options: ['Mare', 'Montagna', 'Città d’arte', 'Crociera', 'Campeggio', 'Terme', 'Safari', 'Parco divertimenti'] },
  { text: 'Il modo migliore di passare la domenica?', options: ['Dormire', 'Pranzo in famiglia', 'Gita fuori porta', 'Serie TV', 'Sport', 'Videogiochi', 'Leggere', 'Shopping'] },
  { text: 'La colazione migliore?', options: ['Cornetto', 'Biscotti', 'Uova e bacon', 'Yogurt', 'Pane e marmellata', 'Cereali', 'Frutta', 'Solo caffè'] },
  { text: 'Cosa compreresti vincendo alla lotteria?', options: ['Casa', 'Auto', 'Viaggio', 'Barca', 'Isola', 'Azienda', 'Beneficenza', 'Niente, risparmio'] },
  { text: 'La stagione più bella?', options: ['Primavera', 'Estate', 'Autunno', 'Inverno', 'Fine estate', 'Inizio autunno', 'Natale', 'Ferragosto'] },
  { text: 'Il lavoro dei sogni?', options: ['Astronauta', 'Chef', 'Attore', 'Calciatore', 'Medico', 'Scrittore', 'Youtuber', 'Pilota'] }
];

/** Opzioni valide: esattamente PICKS indici distinti tra 0 e OPTIONS-1. */
function validPicks(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length !== SONDAGGI.PICKS) return null;
  if (!v.every((i) => isIntIn(i, 0, SONDAGGI.OPTIONS - 1)) || new Set(v).size !== v.length) return null;
  return v as number[];
}

/**
 * ⛏️ Miniera dei Sondaggi: ognuno sceglie le sue 3 opzioni preferite (in ordine), poi tutti
 * indovinano la top 3 del gruppo. Punti per ogni opzione indovinata, di più per la prima.
 */
export class SondaggiShow extends BaseShow<SondaggiPublic, SondaggiPrivate> {
  readonly id = 'sondaggi' as const;

  private questions: SondaggiQuestion[] = [];
  private n = 0;
  private polls = new Map<string, number[]>();
  private guesses = new Map<string, number[]>();
  private lastReveal: Extract<SondaggiPublic, { step: 'reveal' }> | null = null;

  start(): ActionResult {
    this.questions = pickFresh(SONDAGGI_QUESTIONS, this.rounds, this.ctx.seen(this.id), (q) => q.text);
    this.next();
    return null;
  }

  private next() {
    if (this.n >= this.questions.length) return this.finish();
    this.n++;
    this.polls.clear();
    this.guesses.clear();
    this.go('poll', SONDAGGI.POLL_MS, () => this.go('guess', SONDAGGI.GUESS_MS, () => this.reveal()));
  }

  private reveal() {
    const scores = new Array<number>(SONDAGGI.OPTIONS).fill(0);
    for (const picks of this.polls.values()) picks.forEach((i, rank) => (scores[i] += SONDAGGI.WEIGHTS[rank]));
    const ranking = scores.map((score, index) => ({ index, score })).sort((a, b) => b.score - a.score || a.index - b.index);
    const top = ranking.filter((r) => r.score > 0).slice(0, SONDAGGI.PICKS).map((r) => r.index);
    const results = this.ctx.players().map((p) => {
      const guess = this.guesses.get(p.id) ?? null;
      const pts = (guess ?? []).reduce((sum, i) => (top.includes(i) ? sum + SONDAGGI.RANK_POINTS[top.indexOf(i)] : sum), 0);
      return { playerId: p.id, guess, points: this.ctx.addScore(p, pts) };
    });
    this.lastReveal = { step: 'reveal', ...this.header(), ranking, top, results };
    this.go('reveal', SONDAGGI.REVEAL_MS, () => this.next());
  }

  private header() {
    const q = this.questions[this.n - 1];
    return { number: this.n, total: this.questions.length, question: q.text, options: q.options };
  }

  handleAction(p: Player, a: unknown): ActionResult {
    const poll = payloadOf(a, 'poll');
    const guess = payloadOf(a, 'guess');
    const picks = validPicks((poll ?? guess)?.options);
    if (!poll && !guess) return 'Azione non valida';
    if (!picks) return `Scegli ${SONDAGGI.PICKS} opzioni diverse`;
    if (poll) {
      if (this.step !== 'poll') return 'Il sondaggio è chiuso';
      this.polls.set(p.id, picks);
    } else {
      if (this.step !== 'guess') return 'Non è il momento di indovinare';
      this.guesses.set(p.id, picks);
    }
    return null;
  }

  hasActed(p: Player): boolean {
    if (this.step === 'poll') return this.polls.has(p.id);
    if (this.step === 'guess') return this.guesses.has(p.id);
    return false;
  }

  bot(b: Player): void {
    const random = () => shuffle([...Array(SONDAGGI.OPTIONS).keys()]).slice(0, SONDAGGI.PICKS);
    if (this.step === 'poll') this.botAct(b, 3_000, 15_000, () => ({ type: 'poll', options: random() }));
    if (this.step === 'guess') {
      // Metà dei bot pensa che il gruppo la pensi come lui.
      this.botAct(b, 3_000, 15_000, () => ({ type: 'guess', options: Math.random() < 0.5 ? (this.polls.get(b.id) ?? random()) : random() }));
    }
  }

  protected stepState(): SondaggiPublic | null {
    if (this.step === 'poll') return { step: 'poll', ...this.header(), submitted: [...this.polls.keys()] };
    if (this.step === 'guess') return { step: 'guess', ...this.header(), submitted: [...this.guesses.keys()] };
    if (this.step === 'reveal') return this.lastReveal;
    return null;
  }

  privateState(p: Player): SondaggiPrivate {
    return { myPoll: this.polls.get(p.id) ?? null, myGuess: this.guesses.get(p.id) ?? null };
  }
}
