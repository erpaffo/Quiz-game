import { randomBytes } from 'node:crypto';

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pesca n elementi preferendo i non visti (set `seen`, persistente nella stanza); se i freschi non bastano azzera `seen` e completa con i già visti. */
export function pickFresh<T>(items: readonly T[], n: number, seen: Set<string>, keyOf: (item: T) => string): T[] {
  const fresh = shuffle(items.filter((it) => !seen.has(keyOf(it))));
  let out = fresh.slice(0, n);
  if (out.length < n) {
    seen.clear();
    const freshKeys = new Set(out.map(keyOf));
    out = [...out, ...shuffle(items.filter((it) => !freshKeys.has(keyOf(it)))).slice(0, n - out.length)];
  }
  for (const it of out) seen.add(keyOf(it));
  return out;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
