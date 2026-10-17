import type { GameLength } from './types';

export const CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 16,
  /** Da quanti giocatori si attivano le regole per gruppi numerosi. */
  LARGE_GROUP: 7,
  /** Attacchi massimi che un singolo giocatore può subire in un gioco (gli altri rimbalzano). */
  MAX_HITS_PER_TARGET: 3,
  /** Ruba Punti: quante volte al massimo si paga per domanda (oltre, paga la banca). */
  MAX_ROBBED_PER_QUESTION: 2,
  /** Il Più Veloce con gruppi numerosi: premi ai primi tre che rispondono giusto. */
  FASTEST_PODIUM: [1000, 600, 300],
  JOKERS_PER_PLAYER: 1,

  /** Giochi estratti dalla ruota prima della finale, per durata scelta. */
  GAMES_PER_LENGTH: { short: 3, normal: 5, long: 7 } satisfies Record<GameLength, number>,

  /** Massimo di giochi in una scaletta manuale. */
  MAX_SEQUENCE: 12,
  HAND_SIZE: 3,
  /** Serie di risposte giuste che fa guadagnare una carta extra. */
  STREAK_FOR_CARD: 3,
  ANTIDOTE_POINTS: 150,
  /** Doppio: il bonus aggiunto non supera mai questa cifra (niente puntate quadruplicate). */
  DOUBLE_MAX_BONUS: 500,
  MUSIC_QUESTIONS: 4,
  /** Piramide: attacchi di sabotaggio per l'ultimo e il penultimo in classifica. */
  SABOTAGE_LAST: 2,
  SABOTAGE_SECOND_LAST: 1,

  SCORE_MIN_CORRECT: 500,
  SCORE_MAX_CORRECT: 1000,

  CLASSIC_QUESTIONS: 4,
  FASTEST_QUESTIONS: 5,
  FASTEST_WIN: 1000,
  FASTEST_PENALTY: 300,
  BOMB_FUSE_MIN: 35_000,
  BOMB_FUSE_MAX: 55_000,
  BOMB_PENALTY: 1000,
  BOMB_CORRECT_POINTS: 200,
  STEAL_QUESTIONS: 4,
  STEAL_FASTEST: 500,
  STEAL_OTHERS: 250,
  WAGER_QUESTIONS: 3,
  BLITZ_BASE_POINTS: 100,
  BLITZ_MAX_MULTIPLIER: 4,
  ESTIMATE_QUESTIONS: 4,
  ESTIMATE_POINTS: [1000, 600, 300],
  ESTIMATE_EXACT_BONUS: 500,
  CLUES_QUESTIONS: 4,
  CLUES_WRONG_PENALTY: 200,

  PYRAMID_STEPS: 8,
  /** Gradino di partenza massimo (per chi ha il punteggio più alto). */
  PYRAMID_MAX_START: 3,
  PYRAMID_MAX_QUESTIONS: 10,

  /** Pausa dopo che tutti hanno agito, prima di chiudere la fase. */
  ALL_DONE_GRACE_MS: 700,
  /** Selfie ritagliato (WebP o PNG trasparente): circa 224×300 pixel. */
  SELFIE_MAX_CHARS: 180_000,
  NAME_MAX_CHARS: 12,

  DURATION: {
    WHEEL: 4_500,
    GAME_INTRO: 6_000,
    CARD_PICK: 12_000,
    CARD_RESOLVE_BASE: 1_800,
    CARD_RESOLVE_PER_ATTACK: 900,
    /** Tetto alla durata dell'animazione delle carte (gruppi numerosi). */
    CARD_RESOLVE_MAX: 7_000,
    VOTE: 8_000,
    VOTE_RESULT: 2_200,
    QUESTION: 12_000,
    REVEAL: 3_200,
    BET: 8_000,
    PASS: 6_000,
    BOOM: 4_000,
    STEAL: 7_000,
    TRANSFERS: 3_000,
    BLITZ: 45_000,
    BLITZ_END: 4_500,
    NUMERIC: 15_000,
    NUMERIC_REVEAL: 5_000,
    CLUE_QUESTION: 15_000,
    GAME_RESULT: 5_500,
    PYRAMID_INTRO: 8_500,
    PYRAMID_QUESTION: 10_000,
    SABOTAGE: 8_000,
    SABOTAGE_RESULT: 2_800,
    MUSIC_QUESTION: 15_000,
    PYRAMID_REVEAL: 3_800
  }
} as const;

export type DurationKey = keyof typeof CONFIG.DURATION;
