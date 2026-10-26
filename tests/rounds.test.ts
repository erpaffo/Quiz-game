// Round personalizzabili dal menù: validazione delle impostazioni e partite intere con il minimo e il massimo.

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { SHOW_IDS, SHOWS, roundsFor, type ShowId } from '../shared/shows';
import { makeRoom, startShow, useFakeTime } from './helpers';

useFakeTime();

/** Campo dello stato pubblico che dice "a che round siamo" e quello col totale, per ogni gioco. */
const PROGRESS: Record<Exclude<ShowId, 'quiz'>, { at: string; total: string }> = {
  tempo: { at: 'number', total: 'total' },
  gemelle: { at: 'round', total: 'total' },
  scala: { at: 'round', total: 'total' },
  bluff: { at: 'number', total: 'total' },
  impostor: { at: 'round', total: 'total' },
  leggende: { at: 'stage', total: 'stages' },
  guastafeste: { at: 'round', total: 'total' },
  fila: { at: 'number', total: 'total' },
  social: { at: 'number', total: 'total' },
  sondaggi: { at: 'number', total: 'total' },
  creative: { at: 'round', total: 'total' },
  colpevole: { at: 'case', total: 'cases' },
  smistatori: { at: 'round', total: 'total' }
};

describe('Round personalizzabili: impostazioni', () => {
  it('ogni gioco ha limiti coerenti e il valore predefinito dentro i limiti', () => {
    for (const id of SHOW_IDS) {
      const r = SHOWS[id].rounds;
      assert.ok(r.label.length > 0, id);
      assert.ok(1 <= r.min && r.min <= r.default && r.default <= r.max, id);
    }
  });

  it('valori fuori limite vengono riportati nei limiti; id e valori non validi ignorati', () => {
    const t = makeRoom(3);
    const settings = () => (t.tv().phaseData as { settings: { rounds?: Record<string, number> } }).settings;
    assert.equal(t.room.setSettings({ rounds: { tempo: 999, social: 1, bluff: 6.6 } }), null);
    assert.deepEqual(settings().rounds, { tempo: 15, social: 4, bluff: 7 });
    t.room.setSettings({ rounds: { nonEsiste: 5, gemelle: 'tanti', fila: NaN } as never });
    assert.deepEqual(settings().rounds, { tempo: 15, social: 4, bluff: 7 });
    assert.equal(roundsFor(settings(), 'gemelle'), SHOWS.gemelle.rounds.default);
    t.room.destroy();
  });

  it('solo il capo stanza sceglie i round', () => {
    const t = makeRoom(3);
    assert.match(t.room.setSettings({ rounds: { tempo: 3 } }, t.ids[1]) ?? '', /capo stanza/);
    assert.equal(t.room.setSettings({ rounds: { tempo: 3 } }, t.ids[0]), null);
    t.room.destroy();
  });

  it('quiz: il numero di minigiochi scelto vince sulla Durata, e scegliere una Durata lo azzera', () => {
    const t = makeRoom(3);
    const settings = () => (t.tv().phaseData as { settings: { rounds?: Record<string, number> } }).settings;
    t.room.setSettings({ rounds: { quiz: 2, tempo: 5 } });
    t.room.setSettings({ length: 'long' });
    assert.deepEqual(settings().rounds, { tempo: 5 });
    t.room.setSettings({ rounds: { quiz: 2 } });
    assert.equal(t.room.menuNav(t.ids[0], { focus: 'quiz' }), null);
    assert.equal(t.room.start(t.ids[0]), null);
    assert.equal((t.room as unknown as { show: { total: number } }).show.total, 2);
    t.room.destroy();
  });
});

describe('Round personalizzabili: partite intere', () => {
  for (const id of SHOW_IDS.filter((s): s is Exclude<ShowId, 'quiz'> => s !== 'quiz')) {
    const { min, max } = SHOWS[id].rounds;
    for (const chosen of [...new Set([min, max])]) {
      it(`«${SHOWS[id].name}» con ${chosen} ${SHOWS[id].rounds.label.toLowerCase()}`, () => {
        const t = makeRoom(3, Math.max(0, SHOWS[id].minPlayers - 3));
        assert.equal(t.room.setSettings({ rounds: { [id]: chosen } }), null);
        startShow(t, id);
        const { at, total } = PROGRESS[id];
        const totals = new Set<number>();
        let reached = 0;
        const doubles: number[] = [];
        for (let elapsed = 0; elapsed < 3 * 60 * 60_000 && t.tv().phase !== 'LOBBY'; elapsed += 250) {
          const st = t.state<Record<string, unknown>>() ?? {};
          if (typeof st[total] === 'number') totals.add(st[total] as number);
          if (typeof st[at] === 'number') reached = Math.max(reached, st[at] as number);
          if (id === 'bluff' && st.double === true && !doubles.includes(st.number as number)) doubles.push(st.number as number);
          mock.timers.tick(250);
        }
        assert.equal(t.tv().phase, 'LOBBY', 'il gioco deve tornare al menù');
        assert.deepEqual([...totals], [chosen], 'il totale annunciato è quello scelto');
        // Leggende può finire prima (eroi sconfitti): gli altri giochi devono arrivare all'ultimo round.
        if (id === 'leggende') assert.ok(reached >= 1 && reached <= chosen);
        else assert.equal(reached, chosen, 'round giocati');
        if (id === 'bluff') assert.deepEqual(doubles, [chosen - 1, chosen], 'le ultime 2 domande valgono doppio');
        t.room.destroy();
      });
    }
  }
});
