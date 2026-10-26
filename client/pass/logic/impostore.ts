// Regole di «L'Impostore Tascabile»: distribuzione delle carte segrete, voto e ultima possibilità.

import { CHAMELEON_PAIRS, IMPOSTORE_CATEGORIES } from '../data/impostore';
import { pick, shuffle, type Rng } from '../rng';
import type { Player } from '../types';

export interface ImpostoreCard {
  playerId: string;
  /** Il ruolo vero. Nella variante Camaleonte l'infiltrato NON vede di esserlo. */
  role: 'citizen' | 'impostor';
  category: string;
  /** Parola da mostrare (null = impostore classico, vede solo la categoria). */
  word: string | null;
}

export interface ImpostoreDeal {
  mode: 'classico' | 'camaleonte';
  category: string;
  /** Parola dei cittadini. */
  secret: string;
  cards: ImpostoreCard[];
  impostorIds: string[];
  /** Chi dice il primo indizio. */
  starterId: string;
  /** 8 parole per l'ultima possibilità dell'impostore classico (contiene il segreto). */
  guessOptions: string[];
}

/** Impostori effettivi: 2 solo se richiesti e con almeno 6 giocatori. */
export function impostorCount(requested: number, players: number): number {
  return requested >= 2 && players >= 6 ? 2 : 1;
}

export function dealImpostore(players: Player[], opts: { mode: string; impostors: number }, rng: Rng): ImpostoreDeal {
  if (players.length < 3) throw new Error('Servono almeno 3 giocatori');
  const mode = opts.mode === 'camaleonte' ? 'camaleonte' : 'classico';
  const impostorIds = shuffle(rng, players.map((p) => p.id)).slice(0, impostorCount(opts.impostors, players.length));
  const isImp = (id: string) => impostorIds.includes(id);

  let category: string;
  let secret: string;
  let twin = '';
  let guessOptions: string[] = [];
  if (mode === 'camaleonte') {
    const pair = pick(rng, CHAMELEON_PAIRS);
    const [a, b] = shuffle(rng, pair.words);
    category = pair.category;
    secret = a;
    twin = b;
  } else {
    const cat = pick(rng, IMPOSTORE_CATEGORIES);
    category = cat.name;
    secret = pick(rng, cat.words);
    guessOptions = shuffle(rng, [secret, ...shuffle(rng, cat.words.filter((w) => w !== secret)).slice(0, 7)]);
  }

  const cards: ImpostoreCard[] = players.map((p) => ({
    playerId: p.id,
    role: isImp(p.id) ? 'impostor' : 'citizen',
    category,
    word: isImp(p.id) ? (mode === 'camaleonte' ? twin : null) : secret
  }));
  // Nel classico non inizia mai un impostore (partirebbe senza sapere nulla).
  const starters = mode === 'classico' ? players.filter((p) => !isImp(p.id)) : players;
  return { mode, category, secret, cards, impostorIds, starterId: pick(rng, starters).id, guessOptions };
}

export type ImpostoreOutcome = 'citizens' | 'impostors';

/** Voto del tavolo: se l'accusato è un impostore è «preso». */
export function isCaught(deal: ImpostoreDeal, accusedId: string): boolean {
  return deal.impostorIds.includes(accusedId);
}

/** Ultima possibilità: solo nel classico l'impostore preso può indovinare la parola. */
export function hasLastChance(deal: ImpostoreDeal): boolean {
  return deal.mode === 'classico';
}

export function outcomeOf(deal: ImpostoreDeal, accusedId: string, guess: string | null): ImpostoreOutcome {
  if (!isCaught(deal, accusedId)) return 'impostors';
  if (hasLastChance(deal) && guess !== null && guess === deal.secret) return 'impostors';
  return 'citizens';
}

/** Punti: vincono i cittadini → +2 a ognuno; vincono gli impostori → +3 a ognuno di loro. */
export function impostorePoints(deal: ImpostoreDeal, outcome: ImpostoreOutcome): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of deal.cards) {
    if (outcome === 'citizens' && c.role === 'citizen') out[c.playerId] = 2;
    if (outcome === 'impostors' && c.role === 'impostor') out[c.playerId] = 3;
  }
  return out;
}
