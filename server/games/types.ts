import type { DurationKey } from '../../shared/config';
import type { GameAction, PlayState, PrivateState, QuestionPublic } from '../../shared/types';
import type { Player } from '../players';
import type { McDef, NumDef, QuestionPool } from '../QuestionPool';

/** Servizi che la stanza mette a disposizione di ogni gioco. */
export interface GameContext {
  players(): Player[];
  connected(): Player[];
  get(id: string): Player | undefined;
  readonly pool: QuestionPool;
  dur(key: DurationKey): number;
  /** Scala un tempo arbitrario secondo la velocità di gioco (test). */
  scale(ms: number): number;
  /** Passa a un nuovo passo del gioco: azzera i timer del passo precedente. */
  setStep(state: PlayState, durationMs: number | null, onEnd?: () => void): void;
  /** Aggiorna lo stato pubblico senza toccare timer e scadenza (es. classifica live della Raffica). */
  patchStep(state: PlayState): void;
  /** Chiude il passo corrente in anticipo. */
  endStep(delayMs?: number): void;
  /** Timer legato al passo corrente (annullato al passo successivo). */
  later(fn: () => void, ms: number): void;
  /** Aggiunge/toglie punti (mai sotto zero). Restituisce la variazione effettiva. */
  addScore(p: Player, delta: number): number;
  /** Raddoppia `base` se il giocatore ha la carta Doppio attiva (e la consuma). */
  boost(p: Player, base: number): number;
  /** addScore(boost(base)): punti guadagnati con una risposta giusta. */
  award(p: Player, base: number): number;
  /** Serie di risposte giuste: ogni N di fila fa guadagnare una carta extra. */
  recordAnswer(p: Player, correct: boolean): void;
  publicMc(def: McDef, number: number, total: number, clue?: QuestionPublic['clue']): QuestionPublic;
  /** Mostra una domanda: applica effetti subiti e 50:50 ai destinatari. */
  present(def: McDef, to?: Player[]): void;
  presentNumeric(def: NumDef): void;
  /** Fine del gioco: schermata dei risultati e poi ruota. */
  finish(): void;
  gameOver(podium: string[]): void;
  /** 7+ giocatori: alcuni giochi cambiano le regole per restare divertenti per tutti. */
  isLargeGroup(): boolean;
  /** Esegue un'azione per conto di un bot, passando dalla stanza come un giocatore vero. */
  act(p: Player, a: GameAction): void;
}

export interface GameMode {
  start(): void;
  action(p: Player, a: GameAction): string | null;
  /** Il giocatore ha già fatto ciò che il passo corrente richiede (per chiudere in anticipo). */
  hasActed(p: Player): boolean;
  privateFor(p: Player): Partial<PrivateState>;
  /** Pianifica le mosse di un bot per il passo corrente (chiamato a ogni setStep). */
  bot(p: Player): void;
}
