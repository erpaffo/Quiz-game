import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickFresh } from '../server/util';
import { SMIST_PAIRS } from '../server/shows/smistatori/pairs';
import { makeRoom, runToMenu, startShow, useFakeTime } from './helpers';

useFakeTime();

const key = (n: number) => String(n);

describe('pickFresh', () => {
  it('non ripete finché ci sono freschi e marca i pescati', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const seen = new Set<string>();
    const a = pickFresh(items, 4, seen, key);
    const b = pickFresh(items, 4, seen, key);
    assert.equal(new Set([...a, ...b]).size, 8);
    assert.equal(seen.size, 8);
  });

  it('se i freschi non bastano li prende tutti, azzera e completa coi visti senza doppioni', () => {
    const items = [0, 1, 2, 3, 4];
    const seen = new Set<string>();
    const a = pickFresh(items, 3, seen, key);
    const b = pickFresh(items, 3, seen, key);
    assert.equal(b.length, 3);
    assert.equal(new Set(b).size, 3);
    for (const x of items.filter((i) => !a.includes(i))) assert.ok(b.includes(x), 'i freschi vanno presi per primi');
    assert.equal(seen.size, 3, 'reset: restano solo i pescati dell’ultima volta');
  });

  it('pool tutto visto: reset e pesca normale', () => {
    const items = [0, 1, 2];
    const seen = new Set(['0', '1', '2']);
    assert.equal(pickFresh(items, 2, seen, key).length, 2);
    assert.equal(seen.size, 2);
  });
});

describe('storia contenuti nella Room', () => {
  it('Smistatori: due partite di fila non ripetono coppie', () => {
    const t = makeRoom(2, 2);
    for (let g = 0; g < 2; g++) {
      startShow(t, 'smistatori');
      runToMenu(t);
    }
    const seen = (t.room as unknown as { seenContent: Map<string, Set<string>> }).seenContent.get('smistatori')!;
    // Senza ripetizioni i set segnati sono il doppio delle coppie di una partita (pool permettendo).
    assert.ok(seen.size > 3 && seen.size <= SMIST_PAIRS.length);
    t.room.destroy();
  });
});
