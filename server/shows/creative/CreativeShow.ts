import { CREATIVE, drawingError, type CreativePrivate, type CreativePublic, type Drawing } from '../../../shared/creative';
import { BaseShow } from '../../core/BaseShow';
import { buildOptions, isTruth, scoreChoices, type BluffOption } from '../../core/bluff';
import { cleanText, payloadOf } from '../../core/input';
import type { ActionResult } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { pick, shuffle } from '../../util';
import { BOT_DOODLES } from './doodles';

export const CREATIVE_PROMPTS: readonly string[] = [
  'Un gatto che fa yoga',
  'Il frigorifero innamorato',
  'Una giraffa in ascensore',
  'Un pinguino in vacanza ai tropici',
  'Una pizza che vola',
  'Il dentista dei coccodrilli',
  'Un fantasma che ha paura del buio',
  'La lumaca da corsa',
  'Un robot che piange',
  'Un pesce in bicicletta',
  'Una mucca astronauta',
  'Il cactus che vuole un abbraccio',
  'Una banana detective',
  'Il vampiro dal dentista',
  'Un elefante sul monopattino',
  'La nuvola arrabbiata',
  'Un cane che legge il giornale',
  'Il calzino solitario',
  'Una tartaruga supereroe',
  'Il pupazzo di neve al mare',
  'Il re dei piccioni',
  'La sedia che scappa',
  'Un orso sotto la doccia',
  'Il tostapane ballerino'
];

/**
 * 🎨 Scarabocchi Animati: ognuno disegna un tema segreto in 2 fotogrammi; per ogni disegno gli altri
 * inventano titoli falsi e poi cercano quello vero (stesso motore di Fuffa d'Autore).
 * Con più giri (scelti nel menù) si ridisegna con temi nuovi dopo aver indovinato tutti i disegni.
 */
export class CreativeShow extends BaseShow<CreativePublic, CreativePrivate> {
  readonly id = 'creative' as const;

  private prompts = new Map<string, string>();
  private drawings = new Map<string, Drawing>();
  /** Artisti in ordine di presentazione (solo chi ha disegnato). */
  private queue: string[] = [];
  private index = 0;
  private titles = new Map<string, string>();
  private options: BluffOption[] = [];
  private choices = new Map<string, string>();
  private roundPoints: Record<string, number> = {};
  private round = 0;
  /** Temi mescolati una volta sola: ogni giro pesca i successivi, così non si ripetono finché bastano. */
  private deck: string[] = [];
  private dealt = 0;

  start(): ActionResult {
    this.deck = shuffle(CREATIVE_PROMPTS);
    this.drawRound();
    return null;
  }

  private drawRound() {
    this.round++;
    this.prompts.clear();
    this.drawings.clear();
    // I bot ricevono i temi per cui hanno uno scarabocchio pronto; gli umani gli altri (niente temi doppi nello stesso giro).
    const botThemes = shuffle(Object.keys(BOT_DOODLES));
    for (const b of this.ctx.players().filter((p) => p.isBot)) {
      const theme = botThemes.pop();
      if (theme) this.prompts.set(b.id, theme);
    }
    const taken = new Set(this.prompts.values());
    for (const p of this.ctx.players().filter((x) => !x.isBot)) {
      let theme = this.deck[this.dealt++ % this.deck.length];
      for (let i = 0; taken.has(theme) && i < this.deck.length; i++) theme = this.deck[this.dealt++ % this.deck.length];
      this.prompts.set(p.id, theme);
      taken.add(theme);
    }
    this.go('draw', CREATIVE.DRAW_MS, () => {
      this.queue = shuffle([...this.drawings.keys()].filter((id) => this.ctx.get(id)));
      this.index = 0;
      this.nextDrawing();
    });
  }

  private get artist(): string {
    return this.queue[this.index];
  }

  private nextDrawing() {
    if (this.index >= this.queue.length) return this.round < this.rounds ? this.drawRound() : this.finish();
    this.titles.clear();
    this.choices.clear();
    this.go('title', CREATIVE.TITLE_MS, () => this.choose());
  }

  private choose() {
    const truth = this.prompts.get(this.artist)!;
    // Riempitivi: altri temi della lista (sembrano titoli veri).
    const house = CREATIVE_PROMPTS.filter((p) => p !== truth);
    this.options = buildOptions(truth, this.titles, house, CREATIVE.MIN_OPTIONS);
    this.go('choose', CREATIVE.CHOOSE_MS, () => this.reveal());
  }

  private reveal() {
    const pts = scoreChoices(this.options, this.choices, CREATIVE.TRUTH_POINTS, () => CREATIVE.FOOL_POINTS);
    const truthId = this.options.find((o) => o.isTruth)!.id;
    const finders = [...this.choices.values()].filter((id) => id === truthId).length;
    pts.set(this.artist, (pts.get(this.artist) ?? 0) + finders * CREATIVE.ARTIST_POINTS);
    this.roundPoints = {};
    for (const p of this.ctx.players()) this.roundPoints[p.id] = this.ctx.addScore(p, pts.get(p.id) ?? 0);
    this.go('reveal', CREATIVE.REVEAL_MS, () => {
      this.index++;
      this.nextDrawing();
    });
  }

  private turn() {
    return { index: this.index + 1, count: this.queue.length, artistId: this.artist, drawing: this.drawings.get(this.artist)! };
  }

  handleAction(p: Player, a: unknown): ActionResult {
    const draw = payloadOf(a, 'draw');
    if (draw) {
      if (this.step !== 'draw') return 'Non è il momento di disegnare';
      const err = drawingError(draw.frames);
      if (err) return err;
      // Copia pulita: solo i campi attesi, niente dati extra dal client.
      this.drawings.set(p.id, (draw.frames as Drawing).map((f) => f.map(({ c, w, p: pts }) => ({ c, w, p: [...pts] }))));
      return null;
    }
    const title = payloadOf(a, 'title');
    if (title) {
      if (this.step !== 'title') return 'Non è il momento dei titoli';
      if (p.id === this.artist) return 'È il tuo disegno!';
      const text = cleanText(title.text, CREATIVE.TITLE_MAX);
      if (!text) return 'Scrivi un titolo';
      if (isTruth(text, this.prompts.get(this.artist)!)) return 'Hai indovinato il titolo vero! Inventane uno falso';
      this.titles.set(p.id, text);
      return null;
    }
    const choice = payloadOf(a, 'choose');
    if (choice) {
      if (this.step !== 'choose') return 'Non è il momento di scegliere';
      if (p.id === this.artist) return 'È il tuo disegno!';
      const o = this.options.find((x) => x.id === choice.optionId);
      if (!o) return 'Titolo non valido';
      if (o.authors.includes(p.id)) return 'Non puoi scegliere il tuo titolo!';
      this.choices.set(p.id, o.id);
      return null;
    }
    return 'Azione non valida';
  }

  hasActed(p: Player): boolean {
    switch (this.step) {
      case 'draw':
        // Un bot senza scarabocchio pronto (più bot che disegni) salta il passo.
        return (p.isBot && !this.prompts.has(p.id)) || this.drawings.has(p.id);
      case 'title':
        return p.id === this.artist || this.titles.has(p.id);
      case 'choose':
        return p.id === this.artist || this.choices.has(p.id);
      default:
        return false;
    }
  }

  bot(b: Player): void {
    if (this.step === 'draw') {
      const doodle = BOT_DOODLES[this.prompts.get(b.id) ?? ''];
      if (doodle) this.botAct(b, 8_000, 30_000, () => ({ type: 'draw', frames: doodle }));
      return;
    }
    if (b.id === this.artist) return;
    if (this.step === 'title') {
      const truth = this.prompts.get(this.artist)!;
      this.botAct(b, 3_000, 15_000, () => ({ type: 'title', text: pick(CREATIVE_PROMPTS.filter((x) => x !== truth)) }));
    }
    if (this.step === 'choose') {
      this.botAct(b, 3_000, 12_000, () => {
        const allowed = this.options.filter((o) => !o.authors.includes(b.id));
        const truth = allowed.find((o) => o.isTruth);
        const target = truth && Math.random() < 0.4 ? truth : pick(allowed);
        return target && { type: 'choose', optionId: target.id };
      });
    }
  }

  protected stepState(): CreativePublic | null {
    switch (this.step) {
      case 'draw':
        return { step: 'draw', submitted: [...this.drawings.keys()], round: this.round, total: this.rounds };
      case 'title':
        return { step: 'title', ...this.turn(), submitted: [...this.titles.keys()] };
      case 'choose':
        return { step: 'choose', ...this.turn(), options: this.options.map(({ id, text }) => ({ id, text })), chosen: [...this.choices.keys()] };
      case 'reveal':
        return {
          step: 'reveal',
          ...this.turn(),
          options: this.options.map((o) => ({ ...o, pickedBy: [...this.choices].filter(([, id]) => id === o.id).map(([pid]) => pid) })),
          points: this.roundPoints
        };
      default:
        return null;
    }
  }

  privateState(p: Player): CreativePrivate {
    const inTurn = this.step === 'title' || this.step === 'choose' || this.step === 'reveal';
    return {
      prompt: this.step === 'draw' ? (this.prompts.get(p.id) ?? null) : null,
      drawn: this.drawings.has(p.id),
      isArtist: inTurn && p.id === this.artist,
      myTitle: this.step === 'title' || this.step === 'choose' ? (this.titles.get(p.id) ?? null) : null,
      myOptionId: this.step === 'choose' || this.step === 'reveal' ? (this.options.find((o) => o.authors.includes(p.id))?.id ?? null) : null,
      myChoice: this.choices.get(p.id) ?? null
    };
  }
}
