import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORY_COLORS, newId, validatePack, type Pack, type PackQuestion } from '../shared/packs';
import { norm } from '../shared/question-bank';
import type { PackSummary, PhoneQuestion } from '../shared/types';

// Cartelle predefinite (avvio da terminale). L'app desktop passa le proprie: nel suo bundle CommonJS
// import.meta non esiste, quindi i valori predefiniti si calcolano solo quando servono davvero.
const defaultBuiltinDir = () => resolve(import.meta.dirname, 'data/packs');
/** I pacchetti creati dagli utenti: file JSON leggibili e copiabili a mano. */
const defaultUserDir = () => process.env.USER_PACKS_DIR ?? resolve(import.meta.dirname, '../user-packs');
export const PHONE_PACK_ID = 'telefono';

export interface PackStoreOptions {
  builtinDir?: string;
  userDir?: string;
}

export class PackStore {
  private packs = new Map<string, Pack>();
  private listeners = new Set<() => void>();
  readonly userDir: string;
  private readonly builtinDir: string;

  constructor(opts: PackStoreOptions = {}) {
    this.builtinDir = opts.builtinDir ?? defaultBuiltinDir();
    this.userDir = opts.userDir ?? defaultUserDir();
    mkdirSync(this.userDir, { recursive: true });
    for (const file of readdirSync(this.builtinDir).filter((f) => f.endsWith('.json'))) {
      try {
        const raw = JSON.parse(readFileSync(resolve(this.builtinDir, file), 'utf8'));
        const pack = validatePack(raw);
        this.packs.set(raw.id, { ...pack, id: raw.id, builtIn: true, updatedAt: 0 });
      } catch (err) {
        console.warn(`[pacchetti] pacchetto di serie ${file} ignorato: ${(err as Error).message}`);
      }
    }
    for (const file of readdirSync(this.userDir).filter((f) => f.endsWith('.json'))) {
      try {
        const raw = JSON.parse(readFileSync(resolve(this.userDir, file), 'utf8'));
        const pack = validatePack(raw);
        if (this.packs.get(pack.id)?.builtIn) continue;
        this.packs.set(pack.id, { ...pack, updatedAt: Number(raw.updatedAt) || Date.now() });
      } catch (err) {
        console.warn(`[pacchetti] ${file} ignorato: ${(err as Error).message}`);
      }
    }
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }

  list(): PackSummary[] {
    return [...this.packs.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        builtIn: p.builtIn,
        categories: p.categories.length,
        multiple: p.questions.filter((q) => q.type === 'multiple').length,
        truefalse: p.questions.filter((q) => q.type === 'truefalse').length,
        numeric: p.questions.filter((q) => q.type === 'numeric').length
      }))
      .sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name, 'it'));
  }

  get(id: string): Pack | undefined {
    return this.packs.get(id);
  }

  all(): Pack[] {
    return [...this.packs.values()];
  }

  /** Crea o aggiorna un pacchetto utente. Lancia un Error con messaggio leggibile se non è valido. */
  save(input: unknown, id?: string): Pack {
    const pack = validatePack(id ? { ...(input as object), id } : input);
    if (this.packs.get(pack.id)?.builtIn) throw new Error('Il pacchetto di serie non si può modificare: duplicalo e modifica la copia');
    // Scrittura atomica: se manca la corrente a metà, resta il file di prima invece di uno troncato.
    const file = resolve(this.userDir, `${pack.id}.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify(pack, null, 1), 'utf8');
    renameSync(`${file}.tmp`, file);
    this.packs.set(pack.id, pack);
    this.changed();
    return pack;
  }

  remove(id: string) {
    const pack = this.packs.get(id);
    if (!pack) throw new Error('Pacchetto inesistente');
    if (pack.builtIn) throw new Error('Il pacchetto di serie non si può eliminare');
    const file = resolve(this.userDir, `${id}.json`);
    if (existsSync(file)) unlinkSync(file);
    this.packs.delete(id);
    this.changed();
  }

  /** Domanda scritta dal telefono in lobby: finisce nel pacchetto «Domande degli amici». */
  addPhoneQuestion(q: PhoneQuestion): number {
    const pack: Pack = structuredClone(
      this.packs.get(PHONE_PACK_ID) ?? {
        id: PHONE_PACK_ID,
        name: '📱 Domande degli amici',
        description: 'Domande aggiunte dal telefono durante la lobby.',
        builtIn: false,
        updatedAt: Date.now(),
        categories: [],
        questions: []
      }
    );
    if (pack.questions.some((x) => norm(x.text) === norm(String(q?.text ?? '')))) throw new Error('Questa domanda esiste già nel pacchetto');
    const catName = String(q?.categoryName ?? '').trim() || 'Domande degli amici';
    let cat = pack.categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
    if (!cat) {
      cat = { id: newId('c'), name: catName, icon: '📱', color: CATEGORY_COLORS[pack.categories.length % CATEGORY_COLORS.length] };
      pack.categories.push(cat);
    }
    const base = { id: newId('q'), categoryId: cat.id, text: String(q?.text ?? '') };
    let question: PackQuestion;
    switch (q?.type) {
      case 'multiple':
        question = { ...base, type: 'multiple', options: Array.isArray(q.options) ? q.options.filter((o) => String(o).trim()) : [], correctIndex: Number(q.correctIndex) };
        break;
      case 'truefalse':
        question = { ...base, type: 'truefalse', answer: q.answer === true };
        break;
      case 'numeric':
        question = { ...base, type: 'numeric', answer: Number(String(q.answer).replace(',', '.')), unit: String(q.unit ?? '') };
        break;
      default:
        throw new Error('Tipo di domanda sconosciuto');
    }
    pack.questions.push(question);
    return this.save(pack).questions.length;
  }
}
