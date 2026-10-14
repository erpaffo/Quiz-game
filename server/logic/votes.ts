import { pick } from '../util';

export interface Vote {
  playerId: string;
  categoryId: string;
  joker: boolean;
  at: number;
}

export interface VoteOutcome {
  categoryId: string;
  tally: Record<string, number>;
  jokerBy: string | null;
}

/**
 * Il primo Joker giocato impone la categoria. Altrimenti vince la maggioranza,
 * con pareggio risolto a sorte. Nessun voto: categoria casuale.
 */
export function resolveVote(options: string[], votes: Vote[]): VoteOutcome {
  const tally: Record<string, number> = Object.fromEntries(options.map((id) => [id, 0]));
  for (const v of votes) if (v.categoryId in tally) tally[v.categoryId]++;

  const firstJoker = votes.filter((v) => v.joker && v.categoryId in tally).sort((a, b) => a.at - b.at)[0];
  if (firstJoker) return { categoryId: firstJoker.categoryId, tally, jokerBy: firstJoker.playerId };

  const max = Math.max(...Object.values(tally));
  const leaders = options.filter((id) => tally[id] === max);
  return { categoryId: pick(leaders), tally, jokerBy: null };
}
