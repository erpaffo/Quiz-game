import type { CardType, GameId } from './types';

/**
 * Bilanciamento delle carte per gioco:
 * - `excluded`: carte che non si pescano in quel gioco (es. il Doppio nella Scommessa moltiplicherebbe le puntate);
 * - `fiftyUses`: per quante domande vale il 50:50 (nella Raffica le domande sono tante, nel Più Veloce una basta).
 */
export interface CardRules {
  excluded: CardType[];
  fiftyUses: number;
  /** Spiegazione mostrata in TV durante la scelta delle carte. */
  note?: string;
}

export interface GameInfo {
  name: string;
  icon: string;
  color: string;
  rules: string[];
  cards: CardRules;
}

export const GAMES: Record<GameId, GameInfo> = {
  classic: {
    name: 'Classico',
    icon: '🎯',
    color: '#4361ee',
    rules: ['Votate la categoria: il Joker 🃏 impone la tua scelta', '4 domande: più rispondi veloce, più punti (da 500 a 1000)'],
    cards: { excluded: [], fiftyUses: 2 }
  },
  fastest: {
    name: 'Il Più Veloce',
    icon: '⚡',
    color: '#f77f00',
    rules: ['Solo il PRIMO che risponde giusto prende 1000 punti', 'Chi sbaglia perde 300 punti ed è fuori per quella domanda', 'In tanti (7 o più) premiano i primi tre: 1000, 600 e 300'],
    cards: { excluded: [], fiftyUses: 1, note: 'Qui il 50:50 vale per una sola domanda' }
  },
  bomb: {
    name: 'Bomba a Orologeria',
    icon: '💣',
    color: '#e63946',
    rules: ['Chi ha la bomba deve rispondere giusto per lanciarla a un avversario', 'Gli altri prendono 200 punti per ogni risposta giusta', 'Quando esplode, chi la tiene perde 1000 punti!'],
    cards: { excluded: ['DOUBLE'], fiftyUses: 2, note: 'Niente Doppio: i punti in palio sono pochi, conta non tenere la bomba' }
  },
  steal: {
    name: 'Ruba Punti',
    icon: '🦝',
    color: '#6a4c93',
    rules: ['Rispondi giusto e scegli a chi rubare i punti', 'Il più veloce ruba 500 punti, gli altri 250', 'Se la vittima è al verde, paga la banca!'],
    cards: { excluded: [], fiftyUses: 1, note: 'Il Doppio raddoppia quanto rubi (bonus massimo +500)' }
  },
  wager: {
    name: 'Scommessa',
    icon: '🎰',
    color: '#2a9d8f',
    rules: ['Vedi la categoria e scommetti i tuoi punti', 'Risposta giusta: vinci la puntata. Sbagliata: la perdi!'],
    cards: { excluded: ['DOUBLE'], fiftyUses: 1, note: 'Niente Doppio: la puntata è già il moltiplicatore' }
  },
  blitz: {
    name: 'Raffica',
    icon: '🔥',
    color: '#ff4d6d',
    rules: ['45 secondi: rispondi a più domande che puoi, al tuo ritmo', 'Ogni 3 risposte giuste di fila il moltiplicatore sale (fino a ×4)', 'Un errore azzera la serie'],
    cards: { excluded: ['DOUBLE', 'LOCK'], fiftyUses: 4, note: 'Il 50:50 vale per 4 domande; niente Doppio e Lucchetto' }
  },
  estimate: {
    name: 'La Stima',
    icon: '📏',
    color: '#43aa8b',
    rules: ['Domande con risposta numerica: scrivi la tua stima', 'Il più vicino prende 1000 punti, il secondo 600, il terzo 300', 'Risposta esatta: +500 di bonus'],
    cards: { excluded: [], fiftyUses: 1, note: 'Il 50:50 dà un intervallo che contiene la risposta' }
  },
  clues: {
    name: 'Indizio dopo Indizio',
    icon: '🧩',
    color: '#e9a800',
    rules: ['La domanda appare parola per parola', 'Prima rispondi, più punti vinci (fino a 1200)', 'Ma se sbagli perdi 200 punti!'],
    cards: { excluded: [], fiftyUses: 1 }
  },
  music: {
    name: 'Indovina il Brano',
    icon: '🎵',
    color: '#9d4edd',
    rules: ['Ascoltate il brano dallo schermo e indovinate di cosa si tratta', 'Più rispondi veloce, più punti (da 500 a 1000)'],
    cards: { excluded: ['BOMB'], fiftyUses: 1, note: 'Niente Bombette: i titoli devono restare leggibili' }
  }
};

export const GAME_IDS = Object.keys(GAMES) as GameId[];
