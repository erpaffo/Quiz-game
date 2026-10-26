// 🧩 Fila Indiana (ispirato a Quixort): contratto server ↔ client.
// Telefono → SHOW_ACTION { payload: FilaAction } · TV ← show.state: FilaPublic · telefono ← me.show: FilaPrivate
// Il telefono mostra gli elementi in una lista trascinabile (ordine iniziale = quello di `items`).

import type { ShowFinal } from './shows';

export const FILA = {
  SETS: 4,
  ITEMS: 5,
  SORT_MS: 45_000,
  REVEAL_MS: 8_000,
  /** Per ogni elemento nella posizione giusta. */
  POS_POINTS: 100,
  /** Per ogni coppia vicina nell'ordine relativo giusto. */
  PAIR_POINTS: 50,
  PERFECT_BONUS: 300
} as const;

/** `ids`: tutti gli id degli elementi, ognuno una volta, nell'ordine scelto. Si può reinviare fino a fine tempo. */
export type FilaAction = { type: 'order'; ids: string[] };

interface FilaHeader {
  number: number;
  total: number;
  /** Es. "Dal più antico al più recente". */
  title: string;
  /** Etichette ai due capi della fila, es. "Più antico" / "Più recente". */
  from: string;
  to: string;
}

export type FilaPublic =
  | ({ step: 'sort'; items: { id: string; label: string }[]; submitted: string[] } & FilaHeader)
  | ({
      step: 'reveal';
      /** Ordine giusto, con il valore che lo giustifica (es. l'anno). */
      correct: { id: string; label: string; value: string }[];
      results: { playerId: string; order: string[] | null; points: number; perfect: boolean }[];
    } & FilaHeader)
  | ShowFinal;

export interface FilaPrivate {
  myOrder: string[] | null;
}

/** Punti di un ordinamento rispetto a quello giusto. */
export function filaPoints(order: string[] | null, correct: string[]): { points: number; perfect: boolean } {
  if (!order) return { points: 0, perfect: false };
  let points = 0;
  order.forEach((id, i) => {
    if (correct[i] === id) points += FILA.POS_POINTS;
    if (i > 0 && correct.indexOf(order[i - 1]) < correct.indexOf(id)) points += FILA.PAIR_POINTS;
  });
  const perfect = order.every((id, i) => correct[i] === id);
  return { points: points + (perfect ? FILA.PERFECT_BONUS : 0), perfect };
}
