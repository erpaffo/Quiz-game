import { randomBytes } from 'node:crypto';

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
