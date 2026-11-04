// Tipi della modalità «Passa-il-Telefono»: un solo telefono, nessun server, nessuna rete.
// Le regole dei giochi (cartella logic/) sono pure e testabili; la grafica (games/) usa il DOM.

import type { Deck, Rng } from './rng';

export type PassGameId = 'fronte' | 'bomba' | 'impostore' | 'panico' | 'onda' | 'tribunale' | 'catena' | 'duello';

export type PassCategory = 'azione' | 'parole' | 'ruoli' | 'intuito' | 'social' | 'disegno' | 'riflessi';

export interface Player {
  id: string;
  name: string;
  color: string;
}

/** Una regola del sottomenù (es. «Durata turno»: 45 s / 60 s / 90 s). `choices[].id` è ciò che si salva. */
export interface PassOption {
  id: string;
  label: string;
  hint: string;
  choices: { id: string; label: string }[];
  default: string;
}

export interface PassGameMeta {
  id: PassGameId;
  name: string;
  icon: string;
  subtitle: string;
  category: PassCategory;
  /** Come si tiene il telefono (badge sulla cartuccia). */
  posture: string;
  minPlayers: number;
  maxPlayers: number;
  duration: string;
  color: string;
  /** Come si gioca, in 3 punti (incluso come passare il telefono). */
  rules: [string, string, string];
  options: PassOption[];
}

/** Effetti sonori sintetizzati (nessun file audio: funzionano offline). */
export interface Sfx {
  tick(): void;
  good(): void;
  bad(): void;
  boom(): void;
  beep(high?: boolean): void;
  fanfare(): void;
  vibrate(pattern: number | number[]): void;
}

/** Ciò che un gioco riceve dall'app quando parte. */
export interface GameContext {
  root: HTMLElement;
  meta: PassGameMeta;
  /** Giocatori al tavolo, nell'ordine del giro. */
  players: Player[];
  /** Scelte del sottomenù (id regola → id scelta), già validate. */
  options: Record<string, string>;
  sfx: Sfx;
  /** Punti per la «Coppa del Tavolo» (classifica della serata, salvata sul telefono). */
  addPoints(playerId: string, points: number): void;
  /** Fine partita: torna al menù mostrando il riepilogo (titolo e dettagli del gioco + punti guadagnati). */
  exit(summary?: { title: string; html?: string }): void;
  /** Tiene lo schermo acceso durante il gioco, se il telefono lo permette. */
  keepAwake(on: boolean): void;
  /** Mazzo che ricorda le carte già uscite tra una partita e l'altra (azzerato da «Nuova serata»). */
  deck<T>(bankId: string, cards: readonly T[], keyOf?: (card: T) => string, rng?: Rng): Deck<T>;
}

/** Un gioco: parte, disegna dentro `root` e restituisce la funzione che ferma timer e suoni. */
export type PassGame = (ctx: GameContext) => () => void;
