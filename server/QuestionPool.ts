import type { Pack } from '../shared/packs';
import type { Category } from '../shared/types';
import { pick, shuffle } from './util';

/** Domanda a scelta multipla pronta per il gioco (vero/falso = 2 opzioni). */
export interface McDef {
  id: string;
  category: Category;
  text: string;
  options: string[];
  correctIndex: number;
  /** 1 facile · 2 media · 3 difficile (2 se il pacchetto non lo indica). */
  difficulty: number;
  image?: string;
  optionImages?: string[];
  audio?: string;
}

export interface NumDef {
  id: string;
  category: Category;
  text: string;
  answer: number;
  unit: string;
  difficulty: number;
  image?: string;
}

export interface DrawOptions {
  categoryId?: string;
  /** Difficoltà desiderata: se non ce ne sono, si prende la più vicina. */
  difficulty?: number;
  /** Solo domande con almeno 3 risposte (niente vero/falso). */
  multipleOnly?: boolean;
  /** Domande con un brano da ascoltare (Indovina il brano). */
  audio?: boolean;
}

interface McRaw extends McDef {
  shuffle: boolean;
}

const PLACEHOLDER_RE = /\{giocatore\}/gi;

/**
 * Mazzo di domande di una partita, costruito dai pacchetti scelti nella lobby.
 * - Estrazione bilanciata: prima si sceglie una categoria a caso, poi una domanda al suo interno,
 *   così un pacchetto enorme (es. le bandiere) non monopolizza la serata.
 * - Difficoltà: chi la chiede (la Piramide) ottiene la più vicina disponibile.
 * - Le domande con audio sono riservate a «Indovina il brano».
 * - Non ripropone domande già uscite finché ce ne sono di nuove.
 * - Sostituisce {giocatore} con il nome di un giocatore a caso.
 */
export class QuestionPool {
  private mc: McRaw[] = [];
  private audioMc: McRaw[] = [];
  private num: NumDef[] = [];
  private categories = new Map<string, Category>();
  private used = new Set<string>();

  constructor(packs: Pack[], private readonly names: () => string[]) {
    for (const pack of packs) {
      const cats = new Map(pack.categories.map((c) => [c.id, { ...c, id: `${pack.id}:${c.id}` }]));
      for (const q of pack.questions) {
        const category = cats.get(q.categoryId);
        if (!category) continue;
        const id = `${pack.id}:${q.id}`;
        const extras = { difficulty: q.difficulty ?? 2, ...(q.image ? { image: q.image } : {}), ...(q.audio ? { audio: q.audio } : {}) };
        let raw: McRaw | null = null;
        if (q.type === 'multiple') {
          raw = { id, category, text: q.text, options: q.options, correctIndex: q.correctIndex, shuffle: true, ...extras, ...(q.optionImages ? { optionImages: q.optionImages } : {}) };
        }
        if (q.type === 'truefalse') raw = { id, category, text: q.text, options: ['Vero', 'Falso'], correctIndex: q.answer ? 0 : 1, shuffle: false, ...extras };
        if (raw) (raw.audio ? this.audioMc : this.mc).push(raw);
        if (q.type === 'numeric') this.num.push({ id, category, text: q.text, answer: q.answer, unit: q.unit, ...extras });
      }
      // Le categorie votabili sono quelle con domande "normali" (non solo audio).
      for (const c of cats.values()) if (this.mc.some((q) => q.category.id === c.id)) this.categories.set(c.id, c);
    }
  }

  get mcCount() {
    return this.mc.length;
  }

  get numericCount() {
    return this.num.length;
  }

  get audioCount() {
    return this.audioMc.length;
  }

  /** Categorie con almeno `min` domande a scelta multipla non ancora uscite. */
  categoriesWithMc(min: number): Category[] {
    const counts = new Map<string, number>();
    for (const q of this.mc) if (!this.used.has(q.id)) counts.set(q.category.id, (counts.get(q.category.id) ?? 0) + 1);
    return [...this.categories.values()].filter((c) => (counts.get(c.id) ?? 0) >= min);
  }

  /** Difficoltà (più vicina a quella richiesta), poi categoria a caso, poi domanda a caso. */
  private balancedPick<T extends { id: string; category: Category; difficulty: number }>(list: T[], opts: DrawOptions = {}): T | null {
    let pool = list.filter((q) => !this.used.has(q.id) && (!opts.categoryId || q.category.id === opts.categoryId));
    if (pool.length === 0 && opts.categoryId) pool = list.filter((q) => !this.used.has(q.id));
    if (pool.length === 0) {
      for (const q of list) this.used.delete(q.id);
      pool = list.slice();
    }
    if (pool.length === 0) return null;
    if (opts.difficulty !== undefined) {
      const best = Math.min(...pool.map((q) => Math.abs(q.difficulty - opts.difficulty!)));
      pool = pool.filter((q) => Math.abs(q.difficulty - opts.difficulty!) === best);
    }
    if (!opts.categoryId) {
      const cat = pick([...new Set(pool.map((q) => q.category.id))]);
      pool = pool.filter((q) => q.category.id === cat);
    }
    const q = pick(pool);
    this.used.add(q.id);
    return q;
  }

  drawMc(opts: DrawOptions = {}): McDef {
    const list = opts.audio ? this.audioMc : this.mc;
    const filtered = opts.multipleOnly ? list.filter((q) => q.options.length >= 3) : list;
    return this.prepare(this.balancedPick(filtered.length ? filtered : list, opts)!);
  }

  drawNumeric(): NumDef | null {
    const q = this.balancedPick(this.num);
    return q ? { ...q, text: this.fill(q.text) } : null;
  }

  /** Mazzo indipendente per la Raffica: categorie alternate a caso, ognuno al proprio ritmo. */
  blitzDeck(): McDef[] {
    const groups = new Map<string, McRaw[]>();
    for (const q of shuffle(this.mc)) groups.set(q.category.id, [...(groups.get(q.category.id) ?? []), q]);
    const deck: McDef[] = [];
    while (groups.size) {
      const cat = pick([...groups.keys()]);
      const g = groups.get(cat)!;
      deck.push(this.prepare(g.pop()!));
      if (!g.length) groups.delete(cat);
    }
    return deck;
  }

  private prepare(q: McRaw): McDef {
    // Lo stesso nome per tutte le occorrenze di {giocatore} nella domanda.
    const name = pick(this.names().length ? this.names() : ['qualcuno']);
    const fill = (s: string) => s.replace(PLACEHOLDER_RE, name);
    const base = {
      id: q.id,
      category: q.category,
      text: fill(q.text),
      difficulty: q.difficulty,
      ...(q.image ? { image: q.image } : {}),
      ...(q.audio ? { audio: q.audio } : {})
    };
    if (!q.shuffle) return { ...base, options: q.options.slice(), correctIndex: q.correctIndex };
    const order = shuffle(q.options.map((_, i) => i));
    return {
      ...base,
      options: order.map((i) => fill(q.options[i])),
      correctIndex: order.indexOf(q.correctIndex),
      ...(q.optionImages ? { optionImages: order.map((i) => q.optionImages![i]) } : {})
    };
  }

  private fill(s: string) {
    const names = this.names();
    return s.replace(PLACEHOLDER_RE, () => pick(names.length ? names : ['qualcuno']));
  }
}
