// Argomenti del quiz = categorie della banca domande (banca-domande/tassonomia.json, la cura l'Agente Banca: qui solo lettura).
// Servono a filtrare le domande del quiz su TUTTI i pacchetti: quelli della banca (banca-<id>) per nome del pacchetto,
// gli altri per parole chiave nel nome della categoria. Le domande che non combaciano con nessun argomento
// (es. pacchetti personali con categorie inventate) si giocano solo quando non c'è un filtro.

import tassonomia from '../banca-domande/tassonomia.json';

export interface Topic {
  id: string;
  name: string;
  icon: string;
}

export const TOPICS: readonly Topic[] = tassonomia.categorie.map((c) => ({ id: c.id, name: c.nome, icon: c.icona }));
const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));

/** Prima regola che combacia con il nome (minuscolo) della categoria di un pacchetto non della banca. */
const KEYWORDS: readonly [RegExp, string][] = [
  [/geograf|bandier/, 'geografia'],
  [/stori/, 'storia'],
  [/scienz/, 'scienza'],
  [/natura|animal/, 'natura'],
  [/spazio|astronom/, 'spazio'],
  [/tecnolog|invenzion|videogioc/, 'tecnologia'],
  [/arte|libri|letteratur/, 'arte'],
  [/lingua|parol/, 'lingua'],
  [/miti|leggend|religion/, 'miti'],
  [/cinema|serie|cartoni|fumett|\btv\b/, 'cinema'],
  [/musica|canti|compost/, 'musica'],
  [/sport|giochi/, 'sport'],
  [/cibo|cucina/, 'cibo'],
  [/societ|curiosit|vita quotidiana/, 'societa']
];

/** Argomento di una domanda dal suo pacchetto e dalla sua categoria, null se non combacia con nessuno. */
export function topicOf(packId: string, categoryName: string): string | null {
  const fromBank = packId.startsWith('banca-') ? packId.slice('banca-'.length) : '';
  if (TOPIC_IDS.has(fromBank)) return fromBank;
  const name = categoryName.toLowerCase();
  return KEYWORDS.find(([re]) => re.test(name))?.[1] ?? null;
}

/** Controlla gli argomenti in arrivo dalla rete: solo id esistenti, senza doppioni. */
export function sanitizeTopics(input: unknown): string[] {
  return Array.isArray(input) ? [...new Set(input.filter((t): t is string => typeof t === 'string' && TOPIC_IDS.has(t)))] : [];
}
