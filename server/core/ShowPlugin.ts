import type { DurationKey } from '../../shared/config';
import { getShowMeta, type ShowId, type ShowMeta } from '../../shared/shows';
import type { VoiceKey, VoicePriority } from '../../shared/voice';
import type { Player } from '../players';

/**
 * Contesto fornito dalla Stanza (RoomSession) a qualsiasi Show dell'Hub.
 * Isola la gestione di rete, giocatori connessi, avatar 3D e timer dalla logica del singolo gioco.
 */
export interface RoomSessionContext {
  /** Tutti i giocatori nella stanza (inclusi bot e temporaneamente disconnessi). */
  players(): Player[];
  /** Solo i giocatori attualmente connessi. */
  connected(): Player[];
  /** Cerca un giocatore per ID. */
  get(id: string): Player | undefined;
  /** Durata scalata secondo la velocità della stanza (utile per test/simulazioni). */
  dur(key: DurationKey): number;
  scale(ms: number): number;
  /**
   * Avvia un nuovo passo temporizzato dello Show (imposta `endsAt` per il countdown sui client,
   * pianifica `onEnd`, invia `broadcast` e attiva i bot).
   */
  setStep(state: unknown, durationMs: number | null, onEnd?: () => void): void;
  /** Chiude in anticipo il passo corrente (idempotente). */
  endStep(delayMs?: number): void;
  /** Pianifica un timeout associato al passo corrente dello Show. */
  later(fn: () => void, ms: number): void;
  /** Timer che sopravvive ai cambi di passo e viene pulito solo a fine gioco/show; restituisce la funzione per annullarlo. */
  gameTimer(fn: () => void, ms: number): () => number;
  /** Cancella i timer del passo corrente. */
  clearTimers(): void;
  /** Aggiunge (o toglie, senza scendere sotto zero) punti a un giocatore. */
  addScore(player: Player, delta: number): number;
  /** Esegue un'azione per conto di un bot passando dalla stanza (broadcast + chiusura anticipata), come un giocatore vero. */
  act(player: Player, payload: unknown): void;
  /** Invia lo snapshot aggiornato a TV (host) e smartphone (controller). */
  broadcast(): void;
  /** Riporta l'intera stanza al Menù Principale dell'Hub mantenendo giocatori, avatar e selfie. */
  returnToHub(): void;
  /** Battuta del presentatore (chiave `<show>/<passo>` di VOICE_LINES); `nome` = player.name grezzo. Opzionale: i contesti di test possono ometterla. */
  say?(key: VoiceKey, priority?: VoicePriority, nome?: string): void;
  /** Contenuti già pescati in questa stanza per lo show `showId` (vive quanto la stanza; vedi `pickFresh`). */
  seen(showId: string): Set<string>;
}

/**
 * Contratto universale per ogni "cartuccia" di gioco dell'Hub Multi-Gioco.
 * Ogni nuovo Party Game (Quiz, Bluff, Social, Impostore, Creativo) implementa questa interfaccia.
 */
export interface ShowPlugin<TPublic = unknown, TPrivate = unknown, TAction = unknown, TSettings = unknown> {
  readonly id: ShowId;
  readonly meta: ShowMeta;
  /** Verifica se lo Show può partire con i giocatori e le impostazioni correnti (null = OK, stringa = messaggio d'errore). */
  canStart(players: Player[], settings: TSettings): string | null;
  /** Avvia la partita dello Show selezionato. */
  start(settings: TSettings): ActionResult;
  /** Gestisce un'azione inviata dallo smartphone di un giocatore. */
  handleAction(player: Player, action: TAction): ActionResult;
  /** Indica se il giocatore ha completato l'azione richiesta nel passo corrente (per chiusura anticipata del timer). */
  hasActed(player: Player): boolean;
  /** Logica per far giocare un bot nel passo corrente dello Show. */
  bot?(player: Player): void;
  /** Stato pubblico dello Show da mostrare sullo schermo principale (TV). */
  publicState(): TPublic;
  /** Stato privato destinato esclusivamente allo smartphone del singolo giocatore. */
  privateState(player: Player): TPrivate;
  /** Hook opzionale invocato quando uno smartphone si disconnette a partita in corso. */
  onPlayerDisconnect?(player: Player): void;
  /** Pulizia risorse del plugin quando si torna all'Hub o la stanza viene distrutta. */
  destroy?(): void;
}

export type ActionResult = string | null;

export type ShowFactory<TPublic = unknown, TPrivate = unknown, TAction = unknown, TSettings = unknown> = (
  ctx: RoomSessionContext
) => ShowPlugin<TPublic, TPrivate, TAction, TSettings>;

/**
 * Registro centrale dei Party Show dell'Hub.
 * Permette di agganciare nuovi minigiochi senza modificare la logica della Lobby/Stanza.
 */
export class ShowRegistry {
  private factories = new Map<ShowId, ShowFactory>();

  register<TPublic, TPrivate, TAction, TSettings>(id: ShowId, factory: ShowFactory<TPublic, TPrivate, TAction, TSettings>): this {
    this.factories.set(id, factory as ShowFactory);
    return this;
  }

  has(id: ShowId): boolean {
    return this.factories.has(id);
  }

  create(id: ShowId, ctx: RoomSessionContext): ShowPlugin {
    const factory = this.factories.get(id);
    if (!factory) {
      const meta = getShowMeta(id);
      throw new Error(`La modalità «${meta.name}» non è ancora registrata sul server.`);
    }
    return factory(ctx);
  }
}

