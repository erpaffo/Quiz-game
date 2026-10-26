// Menù del Pack: navigazione copertina → griglia → dettaglio, permessi, ritorno al menù dopo un gioco.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PACK, SHOW_IDS, SHOWS } from '../shared/shows';
import { makeRoom, runToMenu, startShow, useFakeTime } from './helpers';

useFakeTime();

describe('Catalogo del Pack', () => {
  it('14 giochi con dati coerenti per il menù', () => {
    assert.equal(SHOW_IDS.length, 14);
    assert.ok(PACK.name && PACK.tagline);
    for (const id of SHOW_IDS) {
      const m = SHOWS[id];
      assert.equal(m.id, id);
      assert.ok(m.minPlayers >= 1 && m.minPlayers <= m.maxPlayers && m.maxPlayers <= 16, id);
      assert.equal(m.rules.length, 3, id);
      assert.equal(m.playersLabel, `${m.minPlayers}–${m.maxPlayers} giocatori`);
    }
  });

  it('ogni gioco del catalogo è registrato sul server', () => {
    const t = makeRoom(1);
    for (const id of SHOW_IDS) assert.ok(t.room.registry.has(id), `manca il plugin di «${id}»`);
    t.room.destroy();
  });
});

describe('Menù del Pack', () => {
  it('si parte dalla copertina; il capo stanza naviga, gli altri no', () => {
    const t = makeRoom(2);
    assert.deepEqual(t.tv().menu, { view: 'cover', focus: 'quiz' });
    assert.match(t.room.menuNav(t.ids[1], { view: 'grid' }) ?? '', /capo stanza/);
    assert.equal(t.room.menuNav(t.ids[0], { view: 'grid', focus: 'gemelle' }), null);
    assert.deepEqual(t.tv().menu, { view: 'grid', focus: 'gemelle' });
    // La cartuccia evidenziata è anche il gioco che parte con START_GAME.
    assert.equal(t.room.settings.showId, 'gemelle');
    assert.equal(t.room.menuNav(null, { view: 'detail' }), null); // anche lo schermo principale
    assert.equal(t.tv().menu?.view, 'detail');
    t.room.destroy();
  });

  it('rifiuta valori non validi e la navigazione a gioco in corso', () => {
    const t = makeRoom(3);
    assert.match(t.room.menuNav(t.ids[0], { view: 'boh' }) ?? '', /non valida/);
    assert.match(t.room.menuNav(t.ids[0], { focus: 'tetris' }) ?? '', /non valido/);
    startShow(t, 'gemelle');
    assert.match(t.room.menuNav(t.ids[0], { view: 'grid' }) ?? '', /tra un gioco/);
    t.room.destroy();
  });

  it('a fine gioco si torna alla griglia, con giocatori ancora pronti e punteggi azzerati', () => {
    const t = makeRoom(3);
    startShow(t, 'gemelle');
    runToMenu(t);
    assert.equal(t.tv().phase, 'LOBBY');
    assert.deepEqual(t.tv().menu, { view: 'grid', focus: 'gemelle' });
    assert.ok(t.tv().players.every((p) => p.ready && p.score === 0));
    // Si può subito avviare un altro gioco.
    assert.equal(t.room.start(t.ids[0]), null);
    t.room.destroy();
  });

  it('il capo stanza può interrompere un gioco e tornare al menù', () => {
    const t = makeRoom(3);
    startShow(t, 'gemelle');
    assert.match(t.room.restart(t.ids[1]) ?? '', /capo stanza/);
    assert.equal(t.room.restart(t.ids[0]), null);
    assert.equal(t.tv().phase, 'LOBBY');
    assert.equal(t.tv().menu?.view, 'grid');
    t.room.destroy();
  });

  it('un gioco con troppi pochi giocatori non parte', () => {
    const t = makeRoom(2);
    t.room.menuNav(t.ids[0], { focus: 'impostor' });
    assert.match(t.room.start(t.ids[0]) ?? '', /almeno 4/);
    assert.equal(t.tv().phase, 'LOBBY');
    t.room.destroy();
  });
});
