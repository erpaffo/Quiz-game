// Accoppiamenti 1 contro 1 per i giochi di battute.

/**
 * Assegna N temi a N giocatori, due per tema, in modo circolare: il tema i va a order[i+offset]
 * e order[i+offset+1]. Ognuno riceve esattamente 2 temi e affronta 2 avversari diversi (con N ≥ 3).
 * Con offset = 1 il tema i non va mai a order[i] (utile se il tema l'ha scritto lui).
 */
export function circularPairs(order: readonly string[], offset = 0): [string, string][] {
  const n = order.length;
  return order.map((_, i) => [order[(i + offset) % n], order[(i + offset + 1) % n]]);
}
