// Validazione dei payload che arrivano dai telefoni (SHOW_ACTION) e utilità su testi e voti.
// Regola: niente di ciò che arriva dal client è affidabile (tipo, lunghezza, id inesistenti).

export type Payload = Record<string, unknown>;

/** Restituisce il payload se è un oggetto con il `type` atteso, altrimenti null. */
export function payloadOf(a: unknown, type: string): Payload | null {
  return a !== null && typeof a === 'object' && (a as Payload).type === type ? (a as Payload) : null;
}

/** Testo pulito (niente caratteri di controllo, spazi compattati, tagliato a `max`), null se vuoto o non stringa. */
export function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
  return text || null;
}

/** Forma "di confronto": minuscolo, senza accenti né punteggiatura. "Perché?" e "perche" diventano uguali. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chiave di confronto per parole: "Gatti", "gatto" e "GATTO!" diventano uguali (toglie la vocale finale oltre 4 lettere). */
export function wordKey(text: string): string {
  return normalize(text)
    .split(' ')
    .map((t) => (t.length > 4 ? t.replace(/[aeiou]$/, '') : t))
    .join(' ');
}

export function isIntIn(v: unknown, min: number, max: number): v is number {
  return Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
}

/** Conta le occorrenze (es. voti per opzione). */
export function tally<K>(items: Iterable<K>): Map<K, number> {
  const counts = new Map<K, number>();
  for (const k of items) counts.set(k, (counts.get(k) ?? 0) + 1);
  return counts;
}

/** Le chiavi col conteggio massimo (più di una in caso di pareggio); vuoto se non ci sono voti. */
export function topKeys<K>(counts: Map<K, number>): K[] {
  const max = Math.max(0, ...counts.values());
  return max === 0 ? [] : [...counts].filter(([, n]) => n === max).map(([k]) => k);
}
