import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { FILA, filaPoints, type FilaPublic } from '../shared/fila';
import { FILA_SETS } from '../server/shows/fila/sets';
import { makeRoom, runToMenu, startShow, useFakeTime } from './helpers';

useFakeTime();

describe('Fila Indiana', () => {
  it('filaPoints: posizioni, coppie vicine e bonus fila perfetta', () => {
    const c = ['a', 'b', 'c', 'd', 'e'];
    assert.deepEqual(filaPoints(c, c), { points: 5 * 100 + 4 * 50 + 300, perfect: true });
    assert.deepEqual(filaPoints(['b', 'a', 'c', 'd', 'e'], c), { points: 3 * 100 + 3 * 50, perfect: false });
    assert.deepEqual(filaPoints(null, c), { points: 0, perfect: false });
  });

  it('ogni serie ha abbastanza elementi', () => {
    for (const s of FILA_SETS) assert.ok(s.items.length >= FILA.ITEMS, s.title);
  });

  it('ordine valido accettato, permutazioni sbagliate rifiutate; elementi mai già in ordine', () => {
    const t = makeRoom(2);
    startShow(t, 'fila');
    const st = t.state<FilaPublic>();
    assert.equal(st.step, 'sort');
    if (st.step !== 'sort') return;
    const ids = st.items.map((i) => i.id);
    assert.ok(!ids.every((id, i) => id === `i${i + 1}`), 'la fila iniziale non deve essere già giusta');
    assert.ok(t.act(0, { type: 'order', ids: ids.slice(1) }));
    assert.ok(t.act(0, { type: 'order', ids: [ids[0], ...ids.slice(0, -1)] }));
    assert.ok(t.act(0, { type: 'order', ids: [...ids.slice(1), 'x'] }));
    const right = [...ids].sort();
    assert.equal(t.act(0, { type: 'order', ids: right }), null);
    t.act(1, { type: 'order', ids });
    mock.timers.tick(700);
    const r = t.state<FilaPublic>();
    assert.ok(r.step === 'reveal' && r.results[0].perfect);
    t.room.destroy();
  });

  it('partita con bot fino al menù', () => {
    const t = makeRoom(1, 3);
    startShow(t, 'fila');
    const steps = runToMenu(t);
    assert.equal(steps.filter((s) => s === 'reveal').length, FILA.SETS);
  });
});
