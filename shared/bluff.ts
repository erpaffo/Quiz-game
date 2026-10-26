// 🎭 Fuffa d'Autore (ispirato a Fibbage): contratto server ↔ client.
// Telefono → SHOW_ACTION { payload: BluffAction } · TV ← show.state: BluffPublic · telefono ← me.show: BluffPrivate

import type { ShowFinal } from './shows';

export const BLUFF = {
  /** Domande totali di default (si sceglie nel menù); le ultime DOUBLE_LAST valgono doppio. */
  QUESTIONS: 5,
  DOUBLE_LAST: 2,
  LIE_MS: 45_000,
  CHOOSE_MS: 25_000,
  REVEAL_MS: 10_000,
  MAX_CHARS: 40,
  MIN_OPTIONS: 4,
  TRUTH_POINTS: 1000,
  FOOL_POINTS: 500,
  /** Una "bugia salvagente" inganna lo stesso, ma vale la metà. */
  SAFETY_FACTOR: 0.5,
  SAFETY_CHOICES: 2
} as const;

export type BluffAction =
  | { type: 'lie'; text: string }
  /** Sceglie una delle bugie salvagente proposte (indice in BluffPrivate.safeties). */
  | { type: 'safety'; index: number }
  | { type: 'choose'; optionId: string };

export interface BluffOptionPublic {
  id: string;
  text: string;
}

export interface BluffOptionReveal extends BluffOptionPublic {
  isTruth: boolean;
  /** Chi ha scritto questa bugia (vuoto: verità o bugia della casa). */
  authors: string[];
  pickedBy: string[];
}

interface BluffHeader {
  number: number;
  total: number;
  double: boolean;
  /** Il fatto, con "___" al posto della parola mancante. */
  question: string;
}

export type BluffPublic =
  | ({ step: 'lie'; submitted: string[] } & BluffHeader)
  | ({ step: 'choose'; options: BluffOptionPublic[]; chosen: string[] } & BluffHeader)
  | ({ step: 'reveal'; options: BluffOptionReveal[]; points: Record<string, number> } & BluffHeader)
  | ShowFinal;

export interface BluffPrivate {
  myLie: string | null;
  /** Bugie salvagente proposte (solo nel passo lie, finché non hai scritto). */
  safeties: string[];
  /** L'opzione che contiene la mia bugia: non la posso scegliere (il client la nasconde). */
  myOptionId: string | null;
  myChoice: string | null;
}
