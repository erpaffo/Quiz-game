import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { GEMELLE, type GemellePrivate, type GemellePublic } from '../shared/gemelle';
import { wordKey } from '../server/core/input';
import { makeRoom, runToMenu, runUntilStep, startShow, useFakeTime } from './helpers';

useFakeTime();

describe('Anime Gemelle', () => {
  it('wordKey unisce singolare/plurale, maiuscole e accenti', () => {
    assert.equal(wordKey('Gatti'), wordKey('gatto'));
    assert.equal(wordKey('Perché!'), wordKey('perche'));
    assert.notEqual(wordKey('mare'), wordKey('mari e monti'));
  });

  it('punti per ogni altro giocatore con la stessa parola; parole segrete durante la scrittura', () => {
    const t = makeRoom(3);
    startShow(t, 'gemelle');
    const st = t.state<GemellePublic>();
    assert.equal(st.step, 'write');
    const prompt = st.step === 'write' ? st.prompt : '';

    assert.equal(t.act(0, { type: 'word', text: 'Zzzalpha' }), null);
    assert.equal(t.act(0, { type: 'word', text: 'zzbeta' }), null);
    assert.equal(t.act(1, { type: 'word', text: 'zzzalpha' }), null);
    assert.equal(t.act(2, { type: 'word', text: 'ZZZALPHA' }), null);
    assert.equal(t.act(2, { type: 'word', text: 'zzbeta' }), null);
    assert.match(t.act(1, { type: 'word', text: 'Zzzalpha' }) ?? '', /già/);
    assert.match(t.act(1, { type: 'word', text: prompt }) ?? '', /partenza/);
    assert.match(t.act(1, { type: 'word', text: '   ' }) ?? '', /Scrivi/);
    assert.ok(t.act(1, null));

    const write = t.state<GemellePublic>();
    assert.equal(write.step === 'write' && write.counts[t.ids[0]], 2);
    assert.ok(!JSON.stringify(write).includes('zzzalpha'), 'le parole non devono comparire sulla TV prima del tempo');
    assert.deepEqual(t.mine<GemellePrivate>(0).words, ['Zzzalpha', 'zzbeta']);

    for (let i = 0; i < 3; i++) t.act(i, { type: 'done' });
    mock.timers.tick(700);
    const m = t.state<GemellePublic>();
    assert.equal(m.step, 'matches');
    if (m.step !== 'matches') return;
    // Ada: alpha (2 altri) + beta (1 altro) = 300 · Bruno: alpha (2) = 200 · Carla: alpha (2) + beta (1) = 300
    assert.deepEqual([t.ids.map((id) => m.points[id])], [[300, 200, 300]]);
    assert.equal(m.shared[0].by.length, 3);
    t.room.destroy();
  });

  it('partita intera con soli bot + 1 umano: 4 round, anime gemelle, classifica, menù', () => {
    const t = makeRoom(1, 3);
    startShow(t, 'gemelle');
    const steps = runToMenu(t);
    assert.deepEqual(steps.filter((s, i) => steps.indexOf(s) === i), ['write', 'matches', 'soulmates', 'final']);
    assert.equal(steps.filter((s) => s === 'write').length, GEMELLE.ROUNDS);
  });

  it('se tutti dicono "ho finito" il round si chiude subito', () => {
    const t = makeRoom(3);
    startShow(t, 'gemelle');
    for (let i = 0; i < 3; i++) t.act(i, { type: 'done' });
    runUntilStep(t, 'matches', 1_000);
    t.room.destroy();
  });
});
