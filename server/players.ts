import { CONFIG } from '../shared/config';
import type { CardType, DefenseType, IncomingEffect, PowerType } from '../shared/types';
import { randomId } from './util';

export interface Player {
  id: string;
  /** Segreto per riprendere il posto dopo una disconnessione (l'id è pubblico, questo no). */
  rejoinKey: string;
  name: string;
  socketId: string | null;
  connected: boolean;
  isBot: boolean;
  characterId: string | null;
  skinId: string | null;
  custom: Record<string, string>;
  selfie: string | null;
  ready: boolean;
  score: number;
  jokerLeft: number;
  pyramidStep: number;

  // --- carte (si azzerano a ogni gioco)
  hand: CardType[];
  playsLeft: number;
  played: { card: CardType; targetId: string | null }[];
  /** Carte extra guadagnate con le serie di risposte giuste (valgono nel gioco successivo). */
  bonusPlays: number;
  defense: DefenseType | null;
  doubleArmed: boolean;
  fiftyLeft: number;
  /** Effetti subiti, applicati alla prossima domanda mostrata a questo giocatore. */
  pendingEffects: IncomingEffect[];
  cur: { questionId: string; incoming: IncomingEffect[]; removed: number[]; hint: [number, number] | null } | null;
  activeEffects: Set<PowerType>;
  streak: number;
  /** Punti guadagnati/persi nel gioco corrente (per la schermata dei risultati). */
  gameDelta: number;
}

export function newPlayer(name: string, isBot: boolean): Player {
  return {
    id: randomId(isBot ? 'bot' : 'p'),
    rejoinKey: randomId('k'),
    name,
    socketId: null,
    connected: true,
    isBot,
    characterId: null,
    skinId: null,
    custom: {},
    selfie: null,
    ready: isBot,
    score: 0,
    jokerLeft: CONFIG.JOKERS_PER_PLAYER,
    pyramidStep: 0,
    hand: [],
    playsLeft: 0,
    played: [],
    bonusPlays: 0,
    defense: null,
    doubleArmed: false,
    fiftyLeft: 0,
    pendingEffects: [],
    cur: null,
    activeEffects: new Set(),
    streak: 0,
    gameDelta: 0
  };
}

/** Stato che vale solo per un singolo gioco della serata. */
export function resetForGame(p: Player) {
  p.hand = [];
  p.playsLeft = 0;
  p.played = [];
  p.defense = null;
  p.doubleArmed = false;
  p.fiftyLeft = 0;
  p.pendingEffects = [];
  p.cur = null;
  p.activeEffects.clear();
  p.gameDelta = 0;
}

export function resetForShow(p: Player) {
  resetForGame(p);
  p.score = 0;
  p.jokerLeft = CONFIG.JOKERS_PER_PLAYER;
  p.pyramidStep = 0;
  p.bonusPlays = 0;
  p.streak = 0;
}
