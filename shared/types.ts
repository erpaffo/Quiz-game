// Modelli dati condivisi tra server, schermo principale (host) e controller.

import type { MenuState, ShowId } from './shows';

export type PowerType = 'ICE' | 'GOO' | 'BOMB' | 'LOCK';
export type DefenseType = 'SHIELD' | 'MIRROR' | 'CLOAK' | 'ANTIDOTE';
export type BonusType = 'DOUBLE' | 'FIFTY';
export type CardType = PowerType | DefenseType | BonusType;

export type GameId = 'classic' | 'fastest' | 'bomb' | 'steal' | 'wager' | 'blitz' | 'estimate' | 'clues' | 'music';
export type GameLength = 'short' | 'normal' | 'long';

export type Phase =
  | 'LOBBY'
  | 'WHEEL'
  | 'GAME_INTRO'
  | 'CARD_PICK'
  | 'CARD_RESOLVE'
  | 'PLAY'
  | 'GAME_RESULT'
  | 'PYRAMID_INTRO'
  | 'GAME_OVER'
  /** È in corso uno Show dell'Hub diverso dal quiz: lo stato è in `RoomSnapshot.show`. */
  | 'SHOW';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
  characterId: string | null;
  skinId: string | null;
  /** Tratti personalizzati scelti dal giocatore (id del tratto → opzione). */
  custom: Record<string, string>;
  hasSelfie: boolean;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  /** Il primo giocatore entrato: può avviare la partita dal telefono. */
  isVip: boolean;
  score: number;
  rank: number;
  jokerLeft: number;
  /** Ha già fatto ciò che la fase corrente richiede (votato, risposto, giocato la carta…). */
  hasActed: boolean;
  /** Effetti d'attacco subiti e non ancora superati (visibili sul personaggio 3D). */
  activeEffects: PowerType[];
  /** Difesa attiva nel gioco corrente. */
  defense: DefenseType | null;
  doubleArmed: boolean;
  /** Ha guadagnato una carta extra con una serie di risposte giuste. */
  bonusCard: boolean;
  pyramidStep: number;
}

export interface QuestionPublic {
  id: string;
  category: Category;
  text: string;
  options: string[];
  number: number;
  total: number;
  /** Immagine della domanda (es. una bandiera). */
  image?: string;
  /** Risposte illustrate: un'immagine per ogni opzione (stesso ordine di `options`). */
  optionImages?: string[];
  /** Brano da ascoltare (Indovina il brano): lo suona lo schermo principale. */
  audio?: string;
  /** Indizio dopo Indizio: ora di inizio (server) e ms per parola svelata. */
  clue?: { startedAt: number; wordMs: number };
}

export interface NumericPublic {
  id: string;
  category: Category;
  text: string;
  unit: string;
  number: number;
  total: number;
  image?: string;
}

export interface AnswerResult {
  playerId: string;
  optionIndex: number | null;
  correct: boolean;
  points: number;
  timeMs: number | null;
}

export interface NumericGuess {
  playerId: string;
  value: number | null;
  points: number;
  rank: number | null;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface BlitzProgress {
  playerId: string;
  answered: number;
  correct: number;
  streak: number;
  multiplier: number;
  points: number;
}

export interface IncomingEffect {
  type: PowerType;
  stack: number;
  from: string[];
}

export interface CardEvent {
  from: string;
  card: CardType;
  /** Giocatori toccati dal proiettile, in ordine (es. A → B → A se B ha lo Specchio). */
  path: string[];
  /** 'crowded': il bersaglio ha già subito troppi attacchi e il colpo rimbalza. */
  result: 'self' | 'hit' | 'blocked' | 'missed' | 'absorbed' | 'crowded';
  defense: DefenseType | null;
}

export interface PyramidMove {
  playerId: string;
  from: number;
  to: number;
}

/** Stato specifico del gioco in corso (fase PLAY), distinto per `step`. */
export type PlayState =
  | { step: 'vote'; categories: Category[] }
  | { step: 'voteResult'; categories: Category[]; category: Category; tally: Record<string, number>; jokerBy: string | null }
  | { step: 'question'; question: QuestionPublic; holder?: string; fuse?: number; firstCorrect?: string | null }
  | {
      step: 'reveal';
      question: QuestionPublic;
      correctIndex: number;
      results: AnswerResult[];
      winner?: string | null;
      /** Il Più Veloce con gruppi numerosi: i primi tre. */
      podium?: string[];
      holder?: string;
      moves?: PyramidMove[];
    }
  | { step: 'steal'; question: QuestionPublic; correctIndex: number; results: AnswerResult[]; thieves: { playerId: string; amount: number }[] }
  | { step: 'transfers'; transfers: Transfer[] }
  | { step: 'bet'; category: Category; number: number; total: number }
  | { step: 'pass'; holder: string; fuse: number }
  | { step: 'boom'; holder: string; penalty: number }
  | { step: 'numeric'; question: NumericPublic }
  | { step: 'numericReveal'; question: NumericPublic; answer: number; guesses: NumericGuess[] }
  | { step: 'blitz'; progress: BlitzProgress[] }
  | { step: 'blitzEnd'; progress: BlitzProgress[] }
  /** Piramide: gli ultimi in classifica scelgono chi sabotare prima della domanda. */
  | { step: 'sabotage'; saboteurs: { playerId: string; left: number }[] }
  | { step: 'sabotageResult'; events: CardEvent[] };

export interface LobbySettings {
  /** Show selezionato nel Party Hub ('quiz' di default). */
  showId?: ShowId;
  /** Round scelti nel menù per ogni gioco (mancante = valore predefinito, vedi roundsFor in shows.ts). */
  rounds?: Partial<Record<ShowId, number>>;
  /** Regole scelte nel sottomenù di ogni gioco: id gioco → (id regola → id scelta). Vedi optionFor in shows.ts. */
  options?: Partial<Record<ShowId, Record<string, string>>>;
  /** Quiz: argomenti scelti (id di shared/topics.ts). Vuoto o mancante = tutti. */
  topics?: string[];
  length: GameLength;
  /** Pacchetti esclusi (quelli nuovi sono inclusi automaticamente). */
  excluded: string[];
  /** 'wheel': la ruota estrae tra i giochi abilitati; 'sequence': scaletta fissa, senza ruota. */
  mode: 'wheel' | 'sequence';
  games: GameId[];
  sequence: GameId[];
}

export interface PackSummary {
  id: string;
  name: string;
  builtIn: boolean;
  categories: number;
  multiple: number;
  truefalse: number;
  numeric: number;
}

export type PhaseData =
  | { phase: 'LOBBY'; settings: LobbySettings; packs: PackSummary[] }
  | { phase: 'WHEEL'; reel: GameId[]; stop: number; chosen: GameId; gameNumber: number; totalGames: number }
  | { phase: 'GAME_INTRO'; game: GameId; gameNumber: number; totalGames: number }
  | { phase: 'CARD_PICK'; game: GameId }
  | { phase: 'CARD_RESOLVE'; game: GameId; events: CardEvent[] }
  | { phase: 'PLAY'; game: GameId | 'pyramid'; state: PlayState }
  | { phase: 'GAME_RESULT'; game: GameId; deltas: Record<string, number>; gameNumber: number; totalGames: number }
  | { phase: 'PYRAMID_INTRO'; steps: number }
  | { phase: 'GAME_OVER'; winnerId: string; podium: string[] }
  | { phase: 'SHOW'; show: ShowId };

/** Dati visibili solo al singolo giocatore che riceve lo snapshot. */
export interface PrivateState {
  playerId: string;
  hand: CardType[];
  playsLeft: number;
  played: { card: CardType; targetId: string | null }[];
  /** Domanda corrente per questo giocatore: effetti subiti, opzioni eliminate dal 50:50, aiutino numerico. */
  cur: { questionId: string; incoming: IncomingEffect[]; removed: number[]; hint: [number, number] | null } | null;
  myVote: string | null;
  myAnswer: number | null;
  myNumeric: number | null;
  myBet: number | null;
  betOptions: number[];
  /** Deve scegliere un bersaglio: a chi passare la bomba o a chi rubare punti. */
  choose: { kind: 'pass' | 'steal'; amount: number; done: boolean } | null;
  blocked: boolean;
  blitz: { question: QuestionPublic; streak: number; multiplier: number; points: number; feedback: 'correct' | 'wrong' | null } | null;
  /** Piramide: attacchi di sabotaggio ancora da lanciare. */
  sabotage: { left: number } | null;
  /** Stato privato generico per i nuovi Party Show dell'Hub (Fase 3). */
  show?: unknown;
}

export interface RoomSnapshot {
  code: string;
  phase: Phase;
  phaseData: PhaseData;
  /** Timestamp (orologio del server) di fine fase, null se la fase non scade. */
  endsAt: number | null;
  /** Ora del server all'invio: serve ai client per calcolare lo scarto d'orologio. */
  serverNow: number;
  /** Partita in pausa dallo schermo principale: conti alla rovescia fermi. */
  paused?: boolean;
  pyramidSteps: number;
  players: PlayerPublic[];
  me: PrivateState | null;
  /** Stato pubblico generico per lo Show attivo nell'Hub Multi-Gioco. */
  show?: { id: ShowId; state: unknown } | null;
  /** Menù del Pack (copertina / griglia / dettaglio), pilotato da capo stanza o schermo principale. */
  menu?: MenuState;
}

export type GameAction =
  | { type: 'vote'; categoryId: string; useJoker: boolean }
  | { type: 'answer'; questionId: string; optionIndex: number }
  | { type: 'numeric'; questionId: string; value: number }
  | { type: 'bet'; index: number }
  | { type: 'target'; targetId: string }
  | { type: 'sabotage'; card: PowerType | null; targetId: string | null };

/** Domanda inviata dal telefono durante la lobby. */
export type PhoneQuestion =
  | { type: 'multiple'; categoryName: string; text: string; options: string[]; correctIndex: number }
  | { type: 'truefalse'; categoryName: string; text: string; answer: boolean }
  | { type: 'numeric'; categoryName: string; text: string; answer: number; unit: string };
