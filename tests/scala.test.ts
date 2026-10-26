import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { SCALA, scalaPoints, type ScalaPrivate, type ScalaPublic } from '../shared/scala';
import { makeRoom, runToMenu, startShow, useFakeTime } from './helpers';

useFakeTime();

describe('Scala del Nonsenso', () => {
  it('scalaPoints: 300 / 150 / 50 / 0 per distanza, intervallo compreso', () => {
    assert.equal(scalaPoints(7, { lo: 7, hi: 7 }), 300);
    assert.equal(scalaPoints(8, { lo: 7, hi: 7 }), 150);
    assert.equal(scalaPoints(5, { lo: 7, hi: 7 }), 50);
    assert.equal(scalaPoints(1, { lo: 7, hi: 7 }), 0);
    assert.equal(scalaPoints(5, { lo: 4, hi: 6 }), 300);
    assert.equal(scalaPoints(null, { lo: 4, hi: 6 }), 0);
  });

  it('round completo: segreti privati, gli altri indovinano, l’autore prende la media', () => {
    const t = makeRoom(3);
    startShow(t, 'scala');
    const mine = t.mine<ScalaPrivate>(0);
    assert.ok(mine.theme && mine.target, 'il telefono deve vedere tema e numero segreto');
    assert.ok(!JSON.stringify(t.tv().show).includes(`"lo":`), 'la TV non deve vedere i segreti');

    // Scrive solo il giocatore 0: si indovina solo la sua risposta.
    assert.match(t.act(0, { type: 'answer', text: '  ' }) ?? '', /Scrivi/);
    assert.equal(t.act(0, { type: 'answer', text: 'Una risposta' }), null);
    mock.timers.tick(SCALA.WRITE_MS);
    const g = t.state<ScalaPublic>();
    assert.equal(g.step, 'guess');
    assert.equal(g.step === 'guess' && g.authorId, t.ids[0]);
    assert.equal(t.mine<ScalaPrivate>(0).isAuthor, true);
    assert.match(t.act(0, { type: 'guess', value: 5 }) ?? '', /tua/);
    assert.match(t.act(1, { type: 'guess', value: 11 }) ?? '', /numero/);

    const target = mine.target!.lo;
    const near = target < SCALA.MAX ? target + 1 : target - 1;
    t.act(1, { type: 'guess', value: target });
    t.act(2, { type: 'guess', value: near });
    mock.timers.tick(700); // tutti hanno votato
    const r = t.state<ScalaPublic>();
    assert.equal(r.step, 'reveal');
    if (r.step !== 'reveal') return;
    assert.deepEqual(r.guesses.map((x) => x.points), [300, 150]);
    assert.equal(r.authorPoints, 225);
    t.room.destroy();
  });

  it('partita con bot: 2 round fino al menù', () => {
    const t = makeRoom(1, 3);
    startShow(t, 'scala');
    const steps = runToMenu(t);
    assert.ok(steps.includes('guess') && steps.includes('reveal') && steps.at(-1) === 'final');
  });
});
