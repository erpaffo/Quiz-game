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
  image?: string;
  optionImages?: string[];
}

export interface NumDef {
  id: string;
  category: Category;
  text: string;
  answer: number;
  unit: string;
  image?: string;
}

interface McRaw extends McDef {
  shuffle: boolean;
}

const PLACEHOLDER_RE = /\{giocatore\}/gi;

/**
 * Mazzo di domande di una partita, costruito dai pacchetti scelti nella lobby.
 * - Estrazione bilanciata: prima si sceglie una categoria a caso, poi una domanda al suo interno,
 *   così un pacchetto enorme (es. le bandiere) non monopolizza la serata.
 * - Non ripropone domande già uscite finché ce ne sono di nuove.
 * - Sostituisce {giocatore} con il nome di un giocatore a caso.
 */
export class QuestionPool {
  private mc: McRaw[] = [];
  private num: NumDef[] = [];
  private categories = new Map<string, Category>();
  private used = new Set<string>();

  constructor(packs: Pack[], private readonly names: () => string[]) {
    for (const pack of packs) {
      const cats = new Map(pack.categories.map((c) => [c.id, { ...c, id: `${pack.id}:${c.id}` }]));
      for (const c of cats.values()) this.categories.set(c.id, c);
      for (const q of pack.questions) {
        const category = cats.get(q.categoryId);
        if (!category) continue;
        const id = `${pack.id}:${q.id}`;
        const image = q.image ? { image: q.image } : {};
        if (q.type === 'multiple') {
          this.mc.push({ id, category, text: q.text, options: q.options, correctIndex: q.correctIndex, shuffle: true, ...image, ...(q.optionImages ? { optionImages: q.optionImages } : {}) });
        }
        if (q.type === 'truefalse') this.mc.push({ id, category, text: q.text, options: ['Vero', 'Falso'], correctIndex: q.answer ? 0 : 1, shuffle: false, ...image });
        if (q.type === 'numeric') this.num.push({ id, category, text: q.text, answer: q.answer, unit: q.unit, ...image });
      }
    }
  }

  get mcCount() {
    return this.mc.length;
  }

  get numericCount() {
    return this.num.length;
  }

  /** Categorie con almeno `min` domande a scelta multipla non ancora uscite. */
  categoriesWithMc(min: number): Category[] {
    const counts = new Map<string, number>();
    for (const q of this.mc) if (!this.used.has(q.id)) counts.set(q.category.id, (counts.get(q.category.id) ?? 0) + 1);
    return [...this.categories.values()].filter((c) => (counts.get(c.id) ?? 0) >= min);
  }

  /** Sceglie prima una categoria (uniformemente) e poi una domanda non ancora uscita. */
  private balancedPick<T extends { id: string; category: Category }>(list: T[], categoryId?: string): T | null {
    let pool = list.filter((q) => !this.used.has(q.id) && (!categoryId || q.category.id === categoryId));
    if (pool.length === 0 && categoryId) pool = list.filter((q) => !this.used.has(q.id));
    if (pool.length === 0) {
      for (const q of list) this.used.delete(q.id);
      pool = list.slice();
    }
    if (pool.length === 0) return null;
    if (!categoryId) {
      const cat = pick([...new Set(pool.map((q) => q.category.id))]);
      pool = pool.filter((q) => q.category.id === cat);
    }
    const q = pick(pool);
    this.used.add(q.id);
    return q;
  }

  drawMc(categoryId?: string): McDef {
    return this.prepare(this.balancedPick(this.mc, categoryId)!);
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
    const base = { id: q.id, category: q.category, text: fill(q.text), ...(q.image ? { image: q.image } : {}) };
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
