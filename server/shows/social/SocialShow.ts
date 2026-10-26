import { SOCIAL, type SocialPrivate, type SocialPublic } from '../../../shared/social';
import { BaseShow } from '../../core/BaseShow';
import { payloadOf, tally, topKeys } from '../../core/input';
import type { ActionResult } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { pick, shuffle } from '../../util';

export const SOCIAL_QUESTIONS: readonly string[] = [
  'Chi di noi finirebbe per sbaglio in un altro continente?',
  'Chi di noi sopravvivrebbe più a lungo su un’isola deserta?',
  'Chi di noi diventerà famoso per un motivo assurdo?',
  'Chi di noi ride alle proprie battute prima di finirle?',
  'Chi di noi ha più app inutili sul telefono?',
  'Chi di noi si perderebbe in un centro commerciale?',
  'Chi di noi vincerebbe un reality show?',
  'Chi di noi arriva sempre in ritardo con una scusa incredibile?',
  'Chi di noi adotterebbe dieci gatti?',
  'Chi di noi scoppia a piangere ai film d’animazione?',
  'Chi di noi sarebbe il primo a scappare in un film horror?',
  'Chi di noi conosce tutti i pettegolezzi del quartiere?',
  'Chi di noi mangerebbe la pizza con l’ananas senza vergogna?',
  'Chi di noi ha la playlist più imbarazzante?',
  'Chi di noi organizzerebbe la festa a sorpresa perfetta?',
  'Chi di noi si addormenta al cinema?',
  'Chi di noi diventerebbe presidente del condominio?',
  'Chi di noi parla con le piante?',
  'Chi di noi riesce a dimenticare le chiavi dentro casa ogni settimana?',
  'Chi di noi sarebbe il miglior concorrente di un quiz in TV?',
  'Chi di noi farebbe amicizia con un alieno?',
  'Chi di noi ha più foto di cibo sul telefono?',
  'Chi di noi direbbe sì a un viaggio improvvisato domani mattina?',
  'Chi di noi sa cucinare solo la pasta in bianco?',
  'Chi di noi risponde ai messaggi dopo tre giorni?',
  'Chi di noi canta a squarciagola in macchina?',
  'Chi di noi vincerebbe una gara di ballo?',
  'Chi di noi si farebbe convincere a comprare qualunque cosa da un venditore?',
  'Chi di noi ha un talento segreto che nessuno conosce?',
  'Chi di noi sarebbe il cattivo perfetto in un film?'
];

/**
 * ⚖️ Chi di Noi?: domande sul gruppo, ognuno vota un amico (anche sé stesso).
 * Punti a chi vota come la maggioranza; un piccolo bonus al più votato.
 */
export class SocialShow extends BaseShow<SocialPublic, SocialPrivate> {
  readonly id = 'social' as const;

  private questions: string[] = [];
  private n = 0;
  private votes = new Map<string, string>();
  private lastReveal: Extract<SocialPublic, { step: 'reveal' }> | null = null;

  start(): ActionResult {
    this.questions = shuffle(SOCIAL_QUESTIONS).slice(0, this.rounds);
    this.next();
    return null;
  }

  private next() {
    if (this.n >= this.questions.length) return this.finish();
    this.n++;
    this.votes.clear();
    this.go('vote', SOCIAL.VOTE_MS, () => this.reveal());
  }

  private reveal() {
    const counts = tally(this.votes.values());
    const winners = Math.max(0, ...counts.values()) >= 2 ? topKeys(counts) : [];
    const points: Record<string, number> = {};
    for (const p of this.ctx.players()) {
      let pts = 0;
      if (winners.includes(this.votes.get(p.id) ?? '')) pts += SOCIAL.MAJORITY_POINTS;
      if (winners.includes(p.id)) pts += SOCIAL.CROWN_POINTS;
      points[p.id] = this.ctx.addScore(p, pts);
    }
    this.lastReveal = {
      step: 'reveal',
      ...this.header(),
      votes: this.ctx.players().map((p) => ({ playerId: p.id, targetId: this.votes.get(p.id) ?? null })),
      winners,
      points
    };
    this.go('reveal', SOCIAL.REVEAL_MS, () => this.next());
  }

  private header() {
    return { number: this.n, total: this.questions.length, question: this.questions[this.n - 1] };
  }

  handleAction(p: Player, a: unknown): ActionResult {
    const vote = payloadOf(a, 'vote');
    if (!vote) return 'Azione non valida';
    if (this.step !== 'vote') return 'Non è il momento di votare';
    if (typeof vote.targetId !== 'string' || !this.ctx.get(vote.targetId)) return 'Giocatore non valido';
    this.votes.set(p.id, vote.targetId);
    return null;
  }

  hasActed(p: Player): boolean {
    return this.step === 'vote' && this.votes.has(p.id);
  }

  bot(b: Player): void {
    if (this.step !== 'vote') return;
    this.botAct(b, 2_000, 12_000, () => ({ type: 'vote', targetId: pick(this.ctx.players()).id }));
  }

  protected stepState(): SocialPublic | null {
    if (this.step === 'vote') return { step: 'vote', ...this.header(), voted: [...this.votes.keys()] };
    if (this.step === 'reveal') return this.lastReveal;
    return null;
  }

  privateState(p: Player): SocialPrivate {
    return { myVote: this.votes.get(p.id) ?? null };
  }
}
