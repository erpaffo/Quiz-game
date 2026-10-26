// Timer che si possono mettere in pausa tutti insieme (pausa della partita dallo schermo principale).
// In pausa i timer non scattano; alla ripresa ripartono con il tempo che mancava.

interface Entry {
  fn: () => void;
  /** Quando deve scattare (Date.now()). In pausa resta fermo e viene spostato alla ripresa. */
  due: number;
  handle: NodeJS.Timeout | null;
}

export class PausableTimers {
  private entries = new Set<Entry>();
  private pausedAt: number | null = null;

  constructor(private readonly onError: (err: unknown) => void = (err) => console.error(err)) {}

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  /** Pianifica `fn` tra `delay` ms; restituisce la funzione che lo annulla (e dice quanti ms mancavano, pause escluse). */
  add(fn: () => void, delay: number): () => number {
    const entry: Entry = { fn, due: Date.now() + Math.max(0, delay), handle: null };
    this.entries.add(entry);
    if (!this.paused) this.arm(entry);
    return () => this.cancel(entry);
  }

  clear() {
    for (const e of this.entries) if (e.handle) clearTimeout(e.handle);
    this.entries.clear();
  }

  pause() {
    if (this.paused) return;
    this.pausedAt = Date.now();
    for (const e of this.entries) {
      if (e.handle) clearTimeout(e.handle);
      e.handle = null;
    }
  }

  /** Riprende: ogni timer ha di nuovo il tempo che gli mancava al momento della pausa. */
  resume() {
    if (this.pausedAt === null) return;
    const shift = Date.now() - this.pausedAt;
    this.pausedAt = null;
    for (const e of this.entries) {
      e.due += shift;
      this.arm(e);
    }
  }

  private arm(e: Entry) {
    e.handle = setTimeout(() => {
      this.entries.delete(e);
      try {
        e.fn();
      } catch (err) {
        this.onError(err);
      }
    }, Math.max(0, e.due - Date.now()));
  }

  private cancel(e: Entry): number {
    if (e.handle) clearTimeout(e.handle);
    this.entries.delete(e);
    return Math.max(0, e.due - (this.pausedAt ?? Date.now()));
  }
}
