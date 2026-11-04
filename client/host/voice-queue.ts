import type { VoiceKey, VoicePriority } from '../../shared/voice';

export interface VoiceItem {
  key: VoiceKey | string;
  text?: string;
  texts?: string[];
  nome?: string;
  /** Chiamata quando la riga parte davvero, con il testo della variante scelta (già col nome). */
  onStart?: (text: string) => void;
  priority?: VoicePriority;
}

/**
 * Coda pura per le battute del presentatore (F3.3).
 * Non tocca il DOM né Web Audio ed è completamente testabile in isolamento.
 */
export class VoiceQueue {
  private queue: VoiceItem[] = [];
  private current: VoiceItem | null = null;
  private lastSaid = new Map<string, number>();
  readonly dedupeWindowMs: number;

  constructor(dedupeWindowMs = 1500) {
    this.dedupeWindowMs = dedupeWindowMs;
  }

  /**
   * Tenta di accodare una battuta vocale.
   * Se la stessa chiave è stata richiesta meno di `windowMs` fa (default 1500 ms),
   * viene scartata per evitare doppioni tra TV e server.
   * Restituisce true se accodata con successo, false se scartata.
   */
  push(item: VoiceItem, now = Date.now(), windowMs = this.dedupeWindowMs): boolean {
    const last = this.lastSaid.get(item.key) ?? -Infinity;
    if (now - last < windowMs) {
      return false;
    }
    this.lastSaid.set(item.key, now);
    this.queue.push(item);
    return true;
  }

  /**
   * Estrae e restituisce il prossimo elemento in coda, impostandolo come battuta corrente.
   * Restituisce null se la coda è vuota.
   */
  next(): VoiceItem | null {
    this.current = this.queue.shift() ?? null;
    return this.current;
  }

  /**
   * Restituisce il prossimo elemento senza rimuoverlo dalla coda.
   */
  peek(): VoiceItem | null {
    return this.queue[0] ?? null;
  }

  /**
   * Restituisce l'elemento attualmente estratto/in riproduzione.
   */
  getCurrent(): VoiceItem | null {
    return this.current;
  }

  /**
   * Segnala che la battuta corrente ha finito la riproduzione.
   */
  finishCurrent(): void {
    this.current = null;
  }

  /**
   * Indica se c'è una battuta attualmente estratta/in riproduzione.
   */
  isPlaying(): boolean {
    return this.current !== null;
  }

  /**
   * Svuota le battute in attesa, ma conserva quelle con priorità 'high' (es. vincitore).
   * Non ferma la battuta già in riproduzione.
   */
  skipPending(): void {
    this.queue = this.queue.filter((item) => item.priority === 'high');
  }

  /**
   * Svuota completamente la coda, cancella la battuta corrente e resetta la cronologia anti-doppione.
   */
  clear(): void {
    this.queue = [];
    this.current = null;
    this.lastSaid.clear();
  }

  /** Numero di elementi in attesa nella coda. */
  get length(): number {
    return this.queue.length;
  }
}

// Istanza condivisa del lettore per la TV
export const defaultVoiceQueue = new VoiceQueue(1500);

export function push(item: VoiceItem, now?: number, windowMs?: number): boolean {
  return defaultVoiceQueue.push(item, now, windowMs);
}

export function next(): VoiceItem | null {
  return defaultVoiceQueue.next();
}

export function peek(): VoiceItem | null {
  return defaultVoiceQueue.peek();
}

export function skipPending(): void {
  defaultVoiceQueue.skipPending();
}

export function clear(): void {
  defaultVoiceQueue.clear();
}

export function isPlaying(): boolean {
  return defaultVoiceQueue.isPlaying();
}

export function finishCurrent(): void {
  defaultVoiceQueue.finishCurrent();
}
