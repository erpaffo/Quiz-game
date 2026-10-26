import { FILA, filaPoints, type FilaPrivate, type FilaPublic } from '../../../shared/fila';
import { BaseShow } from '../../core/BaseShow';
import { payloadOf } from '../../core/input';
import type { ActionResult } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import { shuffle } from '../../util';
import { TEMPO_EVENTS } from '../tempo/events';
import { FILA_SETS, type FilaSet } from './sets';

interface Round {
  set: Pick<FilaSet, 'title' | 'from' | 'to'>;
  /** In ordine giusto. */
  items: { id: string; label: string; value: string }[];
  /** Ordine mostrato sui telefoni (mescolato una volta per tutti). */
  shown: { id: string; label: string }[];
}

/** Pesca `n` elementi mantenendo l'ordine giusto. */
function sample<T>(items: readonly T[], n: number): T[] {
  const keep = new Set(shuffle([...items.keys()]).slice(0, n));
  return items.filter((_, i) => keep.has(i));
}

function makeRound(set: Pick<FilaSet, 'title' | 'from' | 'to'>, items: { label: string; value: string }[]): Round {
  const withIds = items.map((it, i) => ({ id: `i${i + 1}`, ...it }));
  let shown = shuffle(withIds);
  // Mai già in ordine giusto all'inizio.
  while (shown.every((it, i) => it.id === withIds[i].id)) shown = shuffle(withIds);
  return { set, items: withIds, shown: shown.map(({ id, label }) => ({ id, label })) };
}

/** Serie cronologica dagli eventi della Macchina del Tempo (anni tutti diversi). */
function chronology(): Round {
  const byYear = new Map<number, (typeof TEMPO_EVENTS)[number]>();
  for (const e of shuffle(TEMPO_EVENTS)) if (!byYear.has(e.year)) byYear.set(e.year, e);
  const picked = shuffle([...byYear.values()]).slice(0, FILA.ITEMS).sort((a, b) => a.year - b.year);
  return makeRound(
    { title: 'Dal più antico al più recente', from: 'Più antico', to: 'Più recente' },
    picked.map((e) => ({ label: e.text, value: String(e.year) }))
  );
}

/**
 * 🧩 Fila Indiana: metti in ordine 5 elementi secondo un criterio. Punti per ogni posizione giusta
 * e per ogni coppia vicina nell'ordine relativo giusto; bonus per la fila perfetta.
 */
export class FilaShow extends BaseShow<FilaPublic, FilaPrivate> {
  readonly id = 'fila' as const;

  private series: Round[] = [];
  private n = 0;
  private orders = new Map<string, string[]>();
  private lastReveal: Extract<FilaPublic, { step: 'reveal' }> | null = null;

  start(): ActionResult {
    const statics = shuffle(FILA_SETS)
      .slice(0, this.rounds - 1)
      .map((s) => makeRound(s, sample(s.items, FILA.ITEMS)));
    this.series = shuffle([chronology(), ...statics]);
    this.next();
    return null;
  }

  private get round(): Round {
    return this.series[this.n - 1];
  }

  private next() {
    if (this.n >= this.series.length) return this.finish();
    this.n++;
    this.orders.clear();
    this.go('sort', FILA.SORT_MS, () => this.reveal());
  }

  private reveal() {
    const correct = this.round.items.map((it) => it.id);
    const results = this.ctx.players().map((p) => {
      const order = this.orders.get(p.id) ?? null;
      const { points, perfect } = filaPoints(order, correct);
      return { playerId: p.id, order, points: this.ctx.addScore(p, points), perfect };
    });
    this.lastReveal = { step: 'reveal', ...this.header(), correct: this.round.items, results };
    this.go('reveal', FILA.REVEAL_MS, () => this.next());
  }

  private header() {
    return { number: this.n, total: this.series.length, ...this.round.set };
  }

  handleAction(p: Player, a: unknown): ActionResult {
    const order = payloadOf(a, 'order');
    if (!order) return 'Azione non valida';
    if (this.step !== 'sort') return 'Non è il momento di ordinare';
    const ids = order.ids;
    const valid = new Set(this.round.items.map((it) => it.id));
    if (!Array.isArray(ids) || ids.length !== valid.size || new Set(ids).size !== ids.length || !ids.every((id) => valid.has(id))) {
      return 'Ordine non valido';
    }
    this.orders.set(p.id, ids as string[]);
    return null;
  }

  hasActed(p: Player): boolean {
    return this.step === 'sort' && this.orders.has(p.id);
  }

  bot(b: Player): void {
    if (this.step !== 'sort') return;
    this.botAct(b, 8_000, 30_000, () => {
      const ids = this.round.items.map((it) => it.id);
      // Uno o due scambi tra vicini: un bot bravo ma non perfetto.
      for (let k = Math.floor(Math.random() * 3); k > 0; k--) {
        const i = Math.floor(Math.random() * (ids.length - 1));
        [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
      }
      return { type: 'order', ids };
    });
  }

  protected stepState(): FilaPublic | null {
    if (this.step === 'sort') return { step: 'sort', ...this.header(), items: this.round.shown, submitted: [...this.orders.keys()] };
    if (this.step === 'reveal') return this.lastReveal;
    return null;
  }

  privateState(p: Player): FilaPrivate {
    return { myOrder: this.orders.get(p.id) ?? null };
  }
}
