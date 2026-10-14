import type { GameId } from './types';

export interface GameInfo {
  name: string;
  icon: string;
  color: string;
  rules: string[];
}

export const GAMES: Record<GameId, GameInfo> = {
  classic: {
    name: 'Classico',
    icon: '🎯',
    color: '#4361ee',
    rules: ['Votate la categoria: il Joker 🃏 impone la tua scelta', '4 domande: più rispondi veloce, più punti (da 500 a 1000)']
  },
  fastest: {
    name: 'Il Più Veloce',
    icon: '⚡',
    color: '#f77f00',
    rules: ['Solo il PRIMO che risponde giusto prende 1000 punti', 'Chi sbaglia perde 300 punti ed è fuori per quella domanda', 'In tanti (7 o più) premiano i primi tre: 1000, 600 e 300']
  },
  bomb: {
    name: 'Bomba a Orologeria',
    icon: '💣',
    color: '#e63946',
    rules: ['Chi ha la bomba deve rispondere giusto per lanciarla a un avversario', 'Gli altri prendono 200 punti per ogni risposta giusta', 'Quando esplode, chi la tiene perde 1000 punti!']
  },
  steal: {
    name: 'Ruba Punti',
    icon: '🦝',
    color: '#6a4c93',
    rules: ['Rispondi giusto e scegli a chi rubare i punti', 'Il più veloce ruba 500 punti, gli altri 250', 'Se la vittima è al verde, paga la banca!']
  },
  wager: {
    name: 'Scommessa',
    icon: '🎰',
    color: '#2a9d8f',
    rules: ['Vedi la categoria e scommetti i tuoi punti', 'Risposta giusta: vinci la puntata. Sbagliata: la perdi!']
  },
  blitz: {
    name: 'Raffica',
    icon: '🔥',
    color: '#ff4d6d',
    rules: ['45 secondi: rispondi a più domande che puoi, al tuo ritmo', 'Ogni 3 risposte giuste di fila il moltiplicatore sale (fino a ×4)', 'Un errore azzera la serie']
  },
  estimate: {
    name: 'La Stima',
    icon: '📏',
    color: '#43aa8b',
    rules: ['Domande con risposta numerica: scrivi la tua stima', 'Il più vicino prende 1000 punti, il secondo 600, il terzo 300', 'Risposta esatta: +500 di bonus']
  },
  clues: {
    name: 'Indizio dopo Indizio',
    icon: '🧩',
    color: '#e9a800',
    rules: ['La domanda appare parola per parola', 'Prima rispondi, più punti vinci (fino a 1200)', 'Ma se sbagli perdi 200 punti!']
  }
};

export const GAME_IDS = Object.keys(GAMES) as GameId[];
