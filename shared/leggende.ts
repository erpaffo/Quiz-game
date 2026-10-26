// 🐉 Leggende del Quiz (ispirato a Legends of Trivia): quiz cooperativo contro i mostri.
// Telefono → SHOW_ACTION { payload: LeggendeAction } · TV ← show.state: LeggendePublic · telefono ← me.show: LeggendePrivate

import type { ShowFinal } from './shows';

export type LeggendeItem = 'potion' | 'bomb' | 'shield' | 'lens';

export const LEGGENDE = {
  HEARTS: 3,
  INTRO_MS: 6_000,
  QUESTION_MS: 15_000,
  RESULT_MS: 5_000,
  SHOP_MS: 25_000,
  END_MS: 8_000,
  /** Danno di una risposta giusta; il più veloce a rispondere giusto fa ×FAST_FACTOR. */
  DAMAGE: 100,
  FAST_FACTOR: 1.5,
  /** Se risponde giusto meno di questa quota degli eroi in piedi, il mostro attacca chi ha sbagliato. */
  ATTACK_THRESHOLD: 0.5,
  /** Oltre queste domande il mostro scappa (il drago, scappando, vince lui). */
  MAX_QUESTIONS_PER_MONSTER: 14,
  /** Oro guadagnato dalla squadra per ogni mostro sconfitto, per eroe. */
  GOLD_PER_HERO: 60,
  ITEM_SLOTS: 3,
  BOMB_DAMAGE: 200,
  REVIVE_PRICE: 100,
  VICTORY_BONUS: 500,
  ITEMS: {
    potion: { name: 'Pozione', icon: '🧪', price: 60, description: '+1 cuore' },
    bomb: { name: 'Bomba', icon: '💣', price: 80, description: '200 danni subito al mostro' },
    shield: { name: 'Scudo', icon: '🛡️', price: 50, description: 'Blocca il prossimo attacco' },
    lens: { name: 'Lente', icon: '🔍', price: 40, description: 'Elimina 2 risposte sbagliate' }
  } satisfies Record<LeggendeItem, { name: string; icon: string; price: number; description: string }>,
  /** Il percorso: 3 mostri e il drago finale. hp = hpPerHero × eroi a inizio partita. */
  MONSTERS: [
    { id: 'goblin', name: 'Goblin Brontolone', icon: '👺', hpPerHero: 250, boss: false },
    { id: 'troll', name: 'Troll delle Domande', icon: '🧌', hpPerHero: 350, boss: false },
    { id: 'strega', name: 'Strega dei Dubbi', icon: '🧙', hpPerHero: 450, boss: false },
    { id: 'drago', name: 'Drago dell’Ignoranza', icon: '🐉', hpPerHero: 650, boss: true }
  ]
} as const;

export type LeggendeAction =
  | { type: 'answer'; questionId: string; optionIndex: number }
  /** Usa un oggetto: in battaglia tutti; la pozione anche nel negozio. */
  | { type: 'use'; item: LeggendeItem }
  | { type: 'buy'; item: LeggendeItem }
  /** Nel negozio: un eroe in piedi spende l'oro della squadra per rianimare un compagno KO. */
  | { type: 'revive'; targetId: string }
  /** Nel negozio: "ho finito" (chiude prima se lo dicono tutti gli eroi in piedi). */
  | { type: 'ready' };

export interface LeggendeHero {
  playerId: string;
  hearts: number;
  items: LeggendeItem[];
  /** Danni totali inflitti (classifica MVP). */
  damage: number;
  shielded: boolean;
}

export interface LeggendeMonster {
  id: string;
  name: string;
  icon: string;
  hp: number;
  maxHp: number;
  boss: boolean;
}

export interface LeggendeQuestion {
  id: string;
  category: string;
  text: string;
  options: string[];
  image?: string;
  optionImages?: string[];
}

interface LeggendeHeader {
  /** Mostro n. stage su stages. */
  stage: number;
  stages: number;
  heroes: LeggendeHero[];
  /** Oro della squadra. */
  gold: number;
}

export type LeggendePublic =
  | ({ step: 'intro'; monster: LeggendeMonster } & LeggendeHeader)
  | ({ step: 'question'; monster: LeggendeMonster; question: LeggendeQuestion; number: number; answered: string[] } & LeggendeHeader)
  | ({
      step: 'result';
      monster: LeggendeMonster;
      question: LeggendeQuestion;
      correctIndex: number;
      results: { playerId: string; optionIndex: number | null; correct: boolean; damage: number }[];
      /** null = il mostro non ha attaccato. */
      attack: { hit: string[]; blocked: string[] } | null;
      /** Il mostro è stato sconfitto (o è scappato) con questa domanda. */
      outcome: 'fighting' | 'defeated' | 'escaped';
    } & LeggendeHeader)
  | ({ step: 'shop'; ready: string[] } & LeggendeHeader)
  | ({ step: 'victory' | 'defeat' } & LeggendeHeader)
  | ShowFinal;

export interface LeggendePrivate {
  hearts: number;
  /** Cuori massimi di ogni eroe (regola «Vite degli eroi» del menù). */
  maxHearts: number;
  items: LeggendeItem[];
  shielded: boolean;
  myAnswer: number | null;
  /** Opzioni eliminate dalla Lente nella domanda corrente. */
  removed: number[];
}
