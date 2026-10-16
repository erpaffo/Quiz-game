import { CARDS, CARD_TYPES, isAttack, isDefense } from '../../shared/cards';
import type { CardEvent, CardType, DefenseType, PowerType } from '../../shared/types';
import { pick, shuffle } from '../util';

/** Pesca `n` carte diverse, con probabilità proporzionale al peso di ciascuna. */
export function dealHand(n: number, excluded: readonly CardType[] = [], rnd = Math.random): CardType[] {
  const hand: CardType[] = [];
  let pool = CARD_TYPES.filter((c) => !excluded.includes(c));
  while (hand.length < n && pool.length) {
    const total = pool.reduce((s, c) => s + CARDS[c].weight, 0);
    let r = rnd() * total;
    const card = pool.find((c) => (r -= CARDS[c].weight) < 0) ?? pool[pool.length - 1];
    hand.push(card);
    pool = pool.filter((c) => c !== card);
  }
  return hand;
}

export interface Play {
  from: string;
  card: CardType;
  targetId: string | null;
}

export interface Resolution {
  events: CardEvent[];
  hits: { to: string; type: PowerType; from: string }[];
  /** Attacchi neutralizzati dall'Antidoto, per giocatore. */
  absorbed: Map<string, number>;
  defenses: Map<string, DefenseType>;
}

/**
 * Le difese si attivano prima degli attacchi. Per ogni attacco:
 *  - Mantello: l'attacco devia su un altro giocatore a caso (una sola volta, poi va a vuoto)
 *  - Scudo: bloccato
 *  - Specchio: torna al mittente (una sola volta: due specchi di fila lo fermano)
 *  - Antidoto: neutralizzato, +punti a chi lo assorbe
 * Gli attacchi sono considerati in ordine casuale, così il tetto per bersaglio è equo.
 */
export function resolveCards(plays: Play[], playerIds: string[], maxHitsPerTarget = Infinity): Resolution {
  const hitsOn = new Map<string, number>();
  const defenses = new Map<string, DefenseType>();
  const events: CardEvent[] = [];
  for (const p of plays) {
    if (!isAttack(p.card)) {
      if (isDefense(p.card) && !defenses.has(p.from)) defenses.set(p.from, p.card);
      events.push({ from: p.from, card: p.card, path: [p.from], result: 'self', defense: null });
    }
  }

  const hits: Resolution['hits'] = [];
  const absorbed = new Map<string, number>();
  for (const p of shuffle(plays)) {
    if (!isAttack(p.card) || !p.targetId) continue;
    const path = [p.from, p.targetId];
    let target = p.targetId;
    let redirected = false;
    let reflected = false;
    let result: CardEvent['result'] = 'hit';
    let defense: DefenseType | null = null;

    for (let guard = 0; guard < 4; guard++) {
      const d = defenses.get(target) ?? null;
      if (d === 'CLOAK') {
        const others = playerIds.filter((id) => id !== target && id !== p.from);
        if (redirected || others.length === 0) {
          result = 'missed';
          defense = d;
          break;
        }
        redirected = true;
        target = pick(others);
        path.push(target);
        continue;
      }
      if (d === 'MIRROR' && !reflected && target !== p.from) {
        reflected = true;
        target = p.from;
        path.push(target);
        continue;
      }
      if (d === 'SHIELD' || d === 'MIRROR') {
        result = 'blocked';
        defense = d;
        break;
      }
      if (d === 'ANTIDOTE') {
        result = 'absorbed';
        defense = d;
        absorbed.set(target, (absorbed.get(target) ?? 0) + 1);
        break;
      }
      result = 'hit';
      break;
    }
    // Gruppi numerosi: oltre un certo numero di colpi il bersaglio è "protetto dalla folla".
    if (result === 'hit' && (hitsOn.get(target) ?? 0) >= maxHitsPerTarget) result = 'crowded';
    if (result === 'hit') {
      hits.push({ to: target, type: p.card, from: p.from });
      hitsOn.set(target, (hitsOn.get(target) ?? 0) + 1);
    }
    events.push({ from: p.from, card: p.card, path, result, defense });
  }
  return { events, hits, absorbed, defenses };
}
