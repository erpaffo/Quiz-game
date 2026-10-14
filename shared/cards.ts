import { POWERS } from './powers';
import type { CardType, DefenseType, PowerType } from './types';

export interface CardDef {
  kind: 'attack' | 'defense' | 'bonus';
  label: string;
  icon: string;
  color: string;
  description: string;
  /** Probabilità relativa di pescarla. */
  weight: number;
}

const attack = (t: PowerType): CardDef => ({ kind: 'attack', ...POWERS[t], weight: 10 });

export const CARDS: Record<CardType, CardDef> = {
  ICE: attack('ICE'),
  GOO: attack('GOO'),
  BOMB: attack('BOMB'),
  LOCK: attack('LOCK'),
  SHIELD: { kind: 'defense', label: 'Scudo', icon: '🛡️', color: '#4cc9f0', description: 'Blocca tutti gli attacchi diretti a te in questo gioco.', weight: 9 },
  MIRROR: { kind: 'defense', label: 'Specchio', icon: '🪞', color: '#c77dff', description: 'Rimanda gli attacchi a chi te li ha lanciati.', weight: 6 },
  CLOAK: { kind: 'defense', label: 'Mantello', icon: '👻', color: '#adb5bd', description: 'Sei invisibile: gli attacchi colpiscono un altro giocatore a caso.', weight: 6 },
  ANTIDOTE: { kind: 'defense', label: 'Antidoto', icon: '🧪', color: '#7bd389', description: 'Neutralizza gli attacchi e ti dà 150 punti per ognuno.', weight: 5 },
  DOUBLE: { kind: 'bonus', label: 'Doppio', icon: '💎', color: '#ffd60a', description: 'Punti doppi alla tua prossima risposta giusta.', weight: 8 },
  FIFTY: { kind: 'bonus', label: '50:50', icon: '✂️', color: '#ff9f1c', description: 'Elimina due risposte sbagliate nelle prossime 2 domande.', weight: 8 }
};

export const CARD_TYPES = Object.keys(CARDS) as CardType[];

export function isAttack(c: CardType): c is PowerType {
  return CARDS[c].kind === 'attack';
}

export function isDefense(c: CardType): c is DefenseType {
  return CARDS[c].kind === 'defense';
}
