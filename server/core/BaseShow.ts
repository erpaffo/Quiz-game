import { getShowMeta, optionFor, PACE_FACTOR, roundsFor, SHOW_FINAL_MS, type ShowFinal, type ShowId, type ShowMeta, type ShowRanking } from '../../shared/shows';
import type { LobbySettings } from '../../shared/types';
import type { Player } from '../players';
import { randomBetween } from '../util';
import type { ActionResult, RoomSessionContext, ShowPlugin } from './ShowPlugin';

/**
 * Base comune dei giochi del Pack: passi temporizzati, classifica finale, ritorno al menù,
 * limiti di giocatori e bot che agiscono "come umani" (passando da ctx.act).
 * Ogni gioco implementa solo le sue regole: start, handleAction, hasActed, stepState, privateState.
 *
 * Regola d'oro: prepara lo stato del nuovo passo PRIMA di chiamare go(), perché go() avvisa subito
 * i client e chiama bot() per ogni bot.
 */
export abstract class BaseShow<TPublic, TPrivate> implements ShowPlugin<TPublic | ShowFinal | null, TPrivate, unknown> {
  abstract readonly id: ShowId;
  protected step = 'idle';
  /** Cambia a ogni passo: le azioni programmate dei bot di un passo vecchio vengono ignorate. */
  private stepToken = 0;
  /** Round da giocare scelti nel menù (fissati in canStart, che la stanza chiama sempre prima di start). */
  protected rounds = 0;
  /** Moltiplicatore dei tempi scelto con la regola «Ritmo» (0.7 veloce, 1 normale, 1.5 rilassato). */
  protected pace = 1;
  private settings: LobbySettings | undefined;

  constructor(protected readonly ctx: RoomSessionContext) {}

  get meta(): ShowMeta {
    return getShowMeta(this.id);
  }

  canStart(players: Player[], settings?: LobbySettings): string | null {
    this.settings = settings;
    this.rounds = roundsFor(settings, this.id);
    this.pace = PACE_FACTOR[optionFor(settings, this.id, 'pace')] ?? 1;
    const { name, minPlayers, maxPlayers } = this.meta;
    if (players.length < minPlayers) return `«${name}» richiede almeno ${minPlayers} giocatori (anche bot)`;
    if (players.length > maxPlayers) return `«${name}» ammette al massimo ${maxPlayers} giocatori`;
    return this.checkContent();
  }

  /** Controllo dei contenuti (es. domande sufficienti). null = ok. */
  protected checkContent(): string | null {
    return null;
  }

  abstract start(): ActionResult;
  /** Il payload arriva dal telefono così com'è: validarlo sempre (vedi core/input.ts). */
  abstract handleAction(player: Player, action: unknown): ActionResult;
  abstract hasActed(player: Player): boolean;
  abstract privateState(player: Player): TPrivate;
  /** Stato pubblico del passo corrente; il passo 'final' è gestito dalla base. */
  protected abstract stepState(): TPublic | null;

  bot?(player: Player): void;

  publicState(): TPublic | ShowFinal | null {
    return this.step === 'final' ? { step: 'final', ranking: this.ranking() } : this.stepState();
  }

  /** Scelta di una regola del sottomenù (es. 'doubles' → 'on'); se il menù non l'ha toccata, il valore predefinito. */
  protected opt(optionId: string): string {
    return optionFor(this.settings, this.id, optionId);
  }

  /** Passa a un nuovo passo: durata in ms "reali" (scalata qui per i test), poi `next`. Il Ritmo non tocca la classifica finale. */
  protected go(step: string, ms: number | null, next?: () => void) {
    this.step = step;
    this.stepToken++;
    const factor = step === 'final' ? 1 : this.pace;
    this.ctx.setStep(null, ms === null ? null : this.ctx.scale(ms * factor), next);
  }

  /** Classifica finale e ritorno automatico al menù del Pack. */
  protected finish() {
    this.go('final', SHOW_FINAL_MS, () => this.ctx.returnToHub());
  }

  protected ranking(): ShowRanking[] {
    return this.ctx
      .players()
      .map((p) => ({ playerId: p.id, points: p.score }))
      .sort((a, b) => b.points - a.points);
  }

  /** Il bot agisce dopo un tempo casuale, solo se il passo non è cambiato nel frattempo. */
  protected botAct(b: Player, minMs: number, maxMs: number, make: () => unknown) {
    const token = this.stepToken;
    this.ctx.later(() => {
      if (token !== this.stepToken) return;
      const payload = make();
      if (payload) this.ctx.act(b, payload);
    }, this.ctx.scale(randomBetween(minMs, maxMs) * this.pace));
  }

  /** Chiude il passo se tutti i connessi hanno agito (per i passi in cui hasActed non basta, es. un solo giocatore attivo). */
  protected endEarly(delayMs = 400) {
    this.ctx.endStep(this.ctx.scale(delayMs));
  }
}
