// Sala d'attesa personalizzabile (T01): difficoltà e argomenti del quiz su tutti i pacchetti.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizeTopics, topicOf, TOPICS } from '../shared/topics';
import type { QuestionPool } from '../server/QuestionPool';
import { makeRoom, useFakeTime } from './helpers';

useFakeTime();

const poolOf = (t: ReturnType<typeof makeRoom>) => (t.room as unknown as { pool: QuestionPool }).pool;

describe('Filtri del quiz', () => {
  it('argomenti: pacchetti della banca per nome, gli altri per parole chiave', () => {
    assert.equal(TOPICS.length >= 10, true);
    assert.equal(topicOf('banca-storia', 'Medioevo'), 'storia');
    assert.equal(topicOf('bandiere', "Bandiere d'Europa"), 'geografia');
    assert.equal(topicOf('esperti', 'Cinema & Serie'), 'cinema');
    assert.equal(topicOf('pop', 'Videogiochi'), 'tecnologia');
    assert.equal(topicOf('pop', 'Cartoni & Fumetti'), 'cinema');
    assert.equal(topicOf('mio', 'Barzellette di zio Gino'), null);
    assert.deepEqual(sanitizeTopics(['storia', 'storia', 'astrologia', 3]), ['storia']);
    assert.deepEqual(sanitizeTopics('storia'), []);
  });

  it('il mazzo contiene solo domande della difficoltà e degli argomenti scelti', () => {
    const t = makeRoom(3);
    assert.equal(t.room.setSettings({ options: { quiz: { difficulty: '3' } }, topics: ['geografia', 'boh'] }, t.ids[0]), null);
    assert.deepEqual(t.room.settings.topics, ['geografia']);
    assert.equal(t.room.start(t.ids[0]), null);
    const pool = poolOf(t);
    for (let i = 0; i < 40; i++) {
      const q = pool.drawMc();
      assert.equal(q.difficulty, 3);
      assert.equal(topicOf(q.category.id.split(':')[0], q.category.name), 'geografia', q.category.name);
    }
    t.room.destroy();
  });

  it('un filtro troppo stretto non fa partire il quiz e lo spiega', () => {
    const t = makeRoom(3);
    const lobby = t.tv().phaseData;
    assert.ok(lobby.phase === 'LOBBY');
    // tiene solo «stime» (domande numeriche): con un argomento scelto non restano domande a risposta multipla
    const others = lobby.packs.map((p) => p.id).filter((id) => id !== 'stime');
    assert.equal(t.room.setSettings({ excluded: others, topics: ['storia'] }, t.ids[0]), null);
    assert.match(t.room.start(t.ids[0]) ?? '', /Mista|più argomenti/);
    assert.equal(t.tv().phase, 'LOBBY');
    t.room.destroy();
  });
});
