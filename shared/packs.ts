// Formato dei pacchetti di domande (quelli di serie e quelli creati nel Laboratorio).
// La validazione è condivisa: la usa il server prima di salvare e l'editor prima di inviare.

export interface PackCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** `image`: immagine mostrata con la domanda (percorso locale, es. /flags/it.svg, o URL). */
export type PackQuestion =
  | { id: string; categoryId: string; type: 'multiple'; text: string; options: string[]; correctIndex: number; image?: string; optionImages?: string[] }
  | { id: string; categoryId: string; type: 'truefalse'; text: string; answer: boolean; image?: string }
  | { id: string; categoryId: string; type: 'numeric'; text: string; answer: number; unit: string; image?: string };

export interface Pack {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  updatedAt: number;
  categories: PackCategory[];
  questions: PackQuestion[];
}

export const PACK_LIMITS = {
  NAME: 40,
  DESCRIPTION: 200,
  CATEGORY_NAME: 30,
  TEXT: 220,
  OPTION: 80,
  UNIT: 20,
  IMAGE: 300,
  CATEGORIES: 50,
  QUESTIONS: 3000
} as const;

export const PLACEHOLDER = '{giocatore}';

export const CATEGORY_COLORS = ['#2a9d8f', '#b5838d', '#4361ee', '#e63946', '#9d4edd', '#f77f00', '#e9c46a', '#43aa8b', '#ff4d6d', '#4cc9f0'];

const ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const IMAGE_RE = /^(\/[\w\-./]+|https?:\/\/\S+)$/;

function image(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || v.length > PACK_LIMITS.IMAGE || !IMAGE_RE.test(v.trim())) {
    throw new Error(`${field}: immagine non valida (usa un percorso come /flags/it.svg o un indirizzo http)`);
  }
  return v.trim();
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function str(v: unknown, max: number, field: string): string {
  if (typeof v !== 'string') throw new Error(`${field}: testo mancante`);
  const s = v.trim();
  if (!s) throw new Error(`${field}: non può essere vuoto`);
  if (s.length > max) throw new Error(`${field}: massimo ${max} caratteri`);
  return s;
}

/** Controlla e normalizza un pacchetto. Lancia un Error con un messaggio leggibile se non è valido. */
export function validatePack(input: unknown): Pack {
  if (!input || typeof input !== 'object') throw new Error('Pacchetto non valido');
  const p = input as Record<string, unknown>;
  const id = typeof p.id === 'string' && ID_RE.test(p.id) ? p.id : newId('pk');
  const name = str(p.name, PACK_LIMITS.NAME, 'Nome del pacchetto');
  const description = typeof p.description === 'string' ? p.description.trim().slice(0, PACK_LIMITS.DESCRIPTION) : '';

  if (!Array.isArray(p.categories)) throw new Error('Categorie mancanti');
  if (p.categories.length > PACK_LIMITS.CATEGORIES) throw new Error(`Massimo ${PACK_LIMITS.CATEGORIES} categorie`);
  const categories: PackCategory[] = p.categories.map((c: Record<string, unknown>, i: number) => ({
    id: typeof c?.id === 'string' && ID_RE.test(c.id) ? c.id : newId('c'),
    name: str(c?.name, PACK_LIMITS.CATEGORY_NAME, `Categoria ${i + 1}`),
    icon: typeof c?.icon === 'string' && c.icon.trim() ? [...c.icon.trim()].slice(0, 2).join('') : '❓',
    color: typeof c?.color === 'string' && COLOR_RE.test(c.color) ? c.color : CATEGORY_COLORS[i % CATEGORY_COLORS.length]
  }));
  const catIds = new Set(categories.map((c) => c.id));
  if (catIds.size !== categories.length) throw new Error('Categorie con lo stesso identificativo');

  if (!Array.isArray(p.questions)) throw new Error('Domande mancanti');
  if (p.questions.length > PACK_LIMITS.QUESTIONS) throw new Error(`Massimo ${PACK_LIMITS.QUESTIONS} domande`);
  const seen = new Set<string>();
  const questions: PackQuestion[] = p.questions.map((q: Record<string, unknown>, i: number) => {
    const label = `Domanda ${i + 1}`;
    let qid = typeof q?.id === 'string' && ID_RE.test(q.id) ? q.id : newId('q');
    if (seen.has(qid)) qid = newId('q');
    seen.add(qid);
    const categoryId = String(q?.categoryId ?? '');
    if (!catIds.has(categoryId)) throw new Error(`${label}: categoria inesistente`);
    const text = str(q?.text, PACK_LIMITS.TEXT, label);
    const img = image(q?.image, label);
    const withImage = <T extends object>(o: T) => (img ? { ...o, image: img } : o);
    switch (q?.type) {
      case 'multiple': {
        if (!Array.isArray(q.options)) throw new Error(`${label}: risposte mancanti`);
        const options = q.options.map((o, k) => str(o, PACK_LIMITS.OPTION, `${label}, risposta ${k + 1}`));
        if (options.length < 2 || options.length > 4) throw new Error(`${label}: servono da 2 a 4 risposte`);
        if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new Error(`${label}: risposte duplicate`);
        const correctIndex = Number(q.correctIndex);
        if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) throw new Error(`${label}: indica la risposta giusta`);
        let optionImages: string[] | undefined;
        if (Array.isArray(q.optionImages) && q.optionImages.length) {
          if (q.optionImages.length !== options.length) throw new Error(`${label}: serve un'immagine per ogni risposta`);
          optionImages = q.optionImages.map((v, k) => image(v, `${label}, immagine ${k + 1}`)!);
        }
        return withImage({ id: qid, categoryId, type: 'multiple' as const, text, options, correctIndex, ...(optionImages ? { optionImages } : {}) });
      }
      case 'truefalse':
        if (typeof q.answer !== 'boolean') throw new Error(`${label}: indica se è vero o falso`);
        return withImage({ id: qid, categoryId, type: 'truefalse' as const, text, answer: q.answer });
      case 'numeric': {
        const answer = Number(q.answer);
        if (!Number.isFinite(answer)) throw new Error(`${label}: la risposta deve essere un numero`);
        const unit = typeof q.unit === 'string' ? q.unit.trim().slice(0, PACK_LIMITS.UNIT) : '';
        return withImage({ id: qid, categoryId, type: 'numeric' as const, text, answer, unit });
      }
      default:
        throw new Error(`${label}: tipo sconosciuto`);
    }
  });

  return { id, name, description, builtIn: false, updatedAt: Date.now(), categories, questions };
}
