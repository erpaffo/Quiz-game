// Banca domande: il formato dei file JSONL in banca-domande/ (una riga = un elemento).
// Vale per le domande del quiz (giochi online e, in futuro, il Quiz Tascabile) e per i contenuti dei giochi tascabili.
// Le regole sono qui, condivise da script e test: vedi banca-domande/README.md.

import type { Difficulty } from './packs';

/** 1 facilissima · 2 facile · 3 media · 4 difficile · 5 da esperti (rubrica in banca-domande/DIFFICOLTA.md). */
export type BankDifficulty = 1 | 2 | 3 | 4 | 5;

export const BANK_DIFFICULTY_LABEL: Record<BankDifficulty, string> = {
  1: 'Facilissima',
  2: 'Facile',
  3: 'Media',
  4: 'Difficile',
  5: 'Da esperti'
};

/** Il gioco oggi usa 3 livelli: 1-2 → facile, 3 → media, 4-5 → difficile. */
export function toGameDifficulty(d: BankDifficulty): Difficulty {
  return d <= 2 ? 1 : d === 3 ? 2 : 3;
}

/** Tipi di elemento. Le domande del quiz hanno categoria e sottocategoria; i contenuti tascabili no. */
export const QUIZ_KINDS = ['multiple', 'truefalse', 'numeric'] as const;
export const OFFLINE_KINDS = ['fronte', 'bomba-categoria', 'bomba-sillaba', 'panico', 'onda', 'tribunale', 'catena', 'duello', 'impostore', 'camaleonte'] as const;
export type QuizKind = (typeof QUIZ_KINDS)[number];
export type OfflineKind = (typeof OFFLINE_KINDS)[number];
export type BankKind = QuizKind | OfflineKind;

export const FRONTE_PACKS = ['pop', 'casa', 'natura', 'difficile'] as const;

export interface BankMeta {
  id: string;
  kind: BankKind;
  difficulty: BankDifficulty;
  /** Chi l'ha scritto: 'claude' · 'gemini' · 'utente' · … */
  author: string;
  /** Da dove viene: 'ai:gemini', 'ai:claude', 'opentdb:<id>', 'wikidata:Q42', 'utente', un URL… */
  source: string;
  /** Licenza della fonte: 'originale' (scritta da noi), 'CC0', 'CC BY-SA 4.0'… */
  license: string;
  /** Come verificarla: una frase con la fonte del fatto (obbligatoria per le domande del quiz). */
  verify?: string;
  /** Revisione: chi l'ha controllata (deve essere diverso da `author`) ed esito. */
  checked_by?: string;
  check?: 'ok' | 'fix' | 'no';
  note?: string;
  tags?: string[];
  /** Importata in un'altra lingua: va tradotta e adattata (poi si toglie il campo). */
  needs_translation?: boolean;
  /** Testo originale prima della traduzione (domande importate). */
  original?: string;
}

export type BankQuiz = BankMeta & { category: string; subcategory: string; text: string; image?: string } & (
    | { kind: 'multiple'; options: string[]; correct: number }
    | { kind: 'truefalse'; answer: boolean }
    | { kind: 'numeric'; answer: number; unit: string }
  );

export type BankOffline = BankMeta &
  (
    | { kind: 'fronte'; word: string; taboo: string[]; pack: (typeof FRONTE_PACKS)[number] }
    | { kind: 'bomba-categoria' | 'bomba-sillaba' | 'panico' | 'tribunale' | 'catena'; text: string }
    | { kind: 'onda'; left: string; right: string }
    | { kind: 'duello'; text: string; truth: boolean }
    | { kind: 'impostore'; name: string; words: string[] }
    | { kind: 'camaleonte'; category: string; words: string[] }
  );

export type BankItem = BankQuiz | BankOffline;

export interface Taxonomy {
  categorie: { id: string; nome: string; icona: string; colore: string; sottocategorie: { id: string; nome: string }[] }[];
}

export function isQuiz(i: BankItem): i is BankQuiz {
  return (QUIZ_KINDS as readonly string[]).includes(i.kind);
}

// ------------------------------------------------------------------ controlli

const LIMITS = { TEXT: 220, OPTION: 80, UNIT: 20, WORD: 40, SHORT: 120 };

/** Testo «normalizzato» per trovare i doppioni: minuscole, senza accenti, punteggiatura e spazi doppi. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chiave per i doppioni: stesso contenuto = stessa chiave, anche se cambiano maiuscole, accenti o punteggiatura. */
export function dupKey(i: BankItem): string {
  switch (i.kind) {
    case 'fronte':
      return `fronte:${norm(i.word)}`;
    case 'onda':
      return `onda:${norm(i.left)}|${norm(i.right)}`;
    case 'impostore':
      return `impostore:${norm(i.name)}`;
    case 'camaleonte':
      return `camaleonte:${i.words.map(norm).sort().join('|')}`;
    default:
      return `${isQuiz(i) ? 'quiz' : i.kind}:${norm(i.text)}`;
  }
}

/** Identificativo stabile ricavato dal contenuto (così due agenti non creano mai lo stesso id per cose diverse). */
export function stableId(i: BankItem): string {
  let h = 2166136261;
  for (const ch of dupKey(i)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `${i.kind}-${h.toString(36)}`;
}

/** Controlla un elemento. Restituisce gli errori (lista vuota = valido). */
export function validateItem(raw: unknown, tax: Taxonomy): string[] {
  const e: string[] = [];
  if (!raw || typeof raw !== 'object') return ['non è un oggetto JSON'];
  const i = raw as Record<string, unknown>;
  const text = (v: unknown, field: string, max: number) => {
    if (typeof v !== 'string' || !v.trim()) e.push(`${field}: manca`);
    else if (v.length > max) e.push(`${field}: troppo lungo (max ${max})`);
  };
  const kinds = [...QUIZ_KINDS, ...OFFLINE_KINDS] as readonly string[];
  if (!kinds.includes(String(i.kind))) return [`kind «${i.kind}» sconosciuto (usa: ${kinds.join(', ')})`];
  if (![1, 2, 3, 4, 5].includes(Number(i.difficulty))) e.push('difficulty: deve essere 1, 2, 3, 4 o 5');
  for (const f of ['author', 'source', 'license']) text(i[f], f, 200);
  if (i.check !== undefined && !['ok', 'fix', 'no'].includes(String(i.check))) e.push('check: deve essere ok, fix o no');
  if (i.check !== undefined && (typeof i.checked_by !== 'string' || !i.checked_by)) e.push('check senza checked_by');
  if (typeof i.checked_by === 'string' && i.checked_by === i.author) e.push('checked_by: la revisione deve farla un altro autore');
  // le domande importate in un'altra lingua restano bloccate finché qualcuno non le traduce e toglie il campo
  if (i.needs_translation) e.push('da tradurre in italiano (poi togli "needs_translation")');

  if ((QUIZ_KINDS as readonly string[]).includes(String(i.kind))) {
    const cat = tax.categorie.find((c) => c.id === i.category);
    if (!cat) e.push(`category «${i.category}» non esiste in tassonomia.json`);
    else if (!cat.sottocategorie.some((s) => s.id === i.subcategory)) e.push(`subcategory «${i.subcategory}» non esiste in «${cat.id}»`);
    text(i.text, 'text', LIMITS.TEXT);
    text(i.verify, 'verify (come si verifica il fatto)', 300);
    if (i.kind === 'multiple') {
      const o = i.options;
      if (!Array.isArray(o) || o.length !== 4) e.push('options: servono esattamente 4 risposte');
      else {
        o.forEach((x, k) => text(x, `options[${k}]`, LIMITS.OPTION));
        if (new Set(o.map((x) => norm(String(x)))).size !== 4) e.push('options: risposte uguali tra loro');
        if (!Number.isInteger(i.correct) || (i.correct as number) < 0 || (i.correct as number) > 3) e.push('correct: indice 0-3 della risposta giusta');
      }
    }
    if (i.kind === 'truefalse' && typeof i.answer !== 'boolean') e.push('answer: true o false');
    if (i.kind === 'numeric') {
      if (typeof i.answer !== 'number' || !Number.isFinite(i.answer)) e.push('answer: deve essere un numero');
      if (typeof i.unit !== 'string' || i.unit.length > LIMITS.UNIT) e.push('unit: testo (anche vuoto "") di max 20 caratteri');
    }
    return e;
  }

  switch (i.kind) {
    case 'fronte': {
      text(i.word, 'word', LIMITS.WORD);
      const t = i.taboo;
      if (!Array.isArray(t) || t.length !== 4) e.push('taboo: servono esattamente 4 parole vietate');
      else {
        t.forEach((x, k) => text(x, `taboo[${k}]`, LIMITS.WORD));
        if (typeof i.word === 'string' && t.some((x) => norm(String(x)) === norm(i.word as string))) e.push('taboo: non può contenere la parola stessa');
      }
      if (!(FRONTE_PACKS as readonly string[]).includes(String(i.pack))) e.push(`pack: uno tra ${FRONTE_PACKS.join(', ')}`);
      break;
    }
    case 'onda':
      text(i.left, 'left', 50);
      text(i.right, 'right', 50);
      break;
    case 'duello':
      text(i.text, 'text', 90);
      if (typeof i.truth !== 'boolean') e.push('truth: true o false');
      break;
    case 'impostore':
      text(i.name, 'name', 40);
      if (!Array.isArray(i.words) || i.words.length < 8) e.push('words: almeno 8 parole (servono per l’ultima possibilità)');
      else if (new Set(i.words.map((w) => norm(String(w)))).size !== i.words.length) e.push('words: parole ripetute');
      break;
    case 'camaleonte':
      text(i.category, 'category', 40);
      if (!Array.isArray(i.words) || i.words.length !== 2 || norm(String(i.words[0])) === norm(String(i.words[1]))) e.push('words: 2 parole simili ma diverse');
      break;
    case 'bomba-sillaba':
      if (typeof i.text !== 'string' || !/^[A-ZÀ-Ù]{2,5}$/.test(i.text)) e.push('text: 2-5 lettere MAIUSCOLE (es. STR)');
      break;
    default:
      text(i.text, 'text', LIMITS.SHORT);
  }
  return e;
}
