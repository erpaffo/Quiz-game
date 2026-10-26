// Motore "bugie + verità + voto" condiviso da Fuffa d'Autore e Scarabocchi Animati.

import { shuffle } from '../util';
import { normalize } from './input';

export interface BluffOption {
  /** Id assegnato dopo il mescolamento: non rivela quale opzione è la verità. */
  id: string;
  text: string;
  isTruth: boolean;
  /** Giocatori che hanno scritto questa bugia (più di uno se identiche); vuoto per verità e bugie "della casa". */
  authors: string[];
}

/**
 * Opzioni da votare: verità + bugie dei giocatori (identiche = unite) + bugie della casa
 * finché non si arriva a `minOptions`.
 */
export function buildOptions(truth: string, lies: Map<string, string>, house: readonly string[], minOptions: number): BluffOption[] {
  const byKey = new Map<string, Omit<BluffOption, 'id'>>();
  byKey.set(normalize(truth), { text: truth, isTruth: true, authors: [] });
  for (const [playerId, text] of lies) {
    const key = normalize(text);
    const existing = byKey.get(key);
    if (existing && !existing.isTruth) existing.authors.push(playerId);
    else if (!existing) byKey.set(key, { text, isTruth: false, authors: [playerId] });
  }
  for (const text of shuffle(house)) {
    if (byKey.size >= minOptions) break;
    if (!byKey.has(normalize(text))) byKey.set(normalize(text), { text, isTruth: false, authors: [] });
  }
  return shuffle([...byKey.values()]).map((o, i) => ({ ...o, id: `o${i + 1}` }));
}

/** true se il testo coincide con la verità (stessa forma normalizzata). */
export function isTruth(text: string, truth: string): boolean {
  return normalize(text) === normalize(truth);
}

/**
 * Punti di un round: chi sceglie la verità prende `truthPoints`; ogni autore di una bugia
 * prende `foolPoints` per ogni giocatore ingannato (diviso tra co-autori, arrotondato).
 */
export function scoreChoices(
  options: BluffOption[],
  choices: Map<string, string>,
  truthPoints: number,
  foolPoints: (authorId: string) => number
): Map<string, number> {
  const points = new Map<string, number>();
  const add = (id: string, n: number) => points.set(id, (points.get(id) ?? 0) + n);
  for (const [chooser, optionId] of choices) {
    const o = options.find((x) => x.id === optionId);
    if (!o) continue;
    if (o.isTruth) add(chooser, truthPoints);
    for (const author of o.authors) add(author, Math.round(foolPoints(author) / o.authors.length));
  }
  return points;
}
