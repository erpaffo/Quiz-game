import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { GUASTA, type GuastaPrivate, type GuastaPublic } from '../shared/guastafeste';
import { circularPairs } from '../server/core/matchup';
import { makeRoom, runToMenu, runUntilStep, startShow, useFakeTime } from './helpers';

useFakeTime();

describe('Guastafeste', () => {
  it('circularPairs: ognuno ha 2 temi, mai contro sé stesso; offset 1 evita l’autore', () => {
    const order = ['a', 'b', 'c', 'd'];
    const pairs = circularPairs(order);
    for (const id of order) assert.equal(pairs.filter((p) => p.includes(id)).length, 2);
    assert.ok(pairs.every(([x, y]) => x !== y));
    circularPairs(order, 1).forEach((pair, i) => assert.ok(!pair.includes(order[i])));
  });

  it('round 1: due temi a testa, voto anonimo, chi è in sfida non vota, vittoria schiacciante', () => {
    const t = makeRoom(4);
    startShow(t, 'guastafeste');
    const mine = t.ids.map((_, i) => t.mine<GuastaPrivate>(i).prompts);
    assert.ok(mine.every((p) => p.length === 2));
    t.ids.forEach((_, i) => mine[i].forEach((pr, k) => t.act(i, { type: 'answer', promptId: pr.id, text: `battuta ${i}-${k}` })));
    assert.match(t.act(0, { type: 'answer', promptId: 'inventato', text: 'x' }) ?? '', /non valido/);
    mock.timers.tick(700); // tutti hanno scritto

    const v = t.state<GuastaPublic>();
    assert.equal(v.step, 'vote');
    if (v.step !== 'vote') return;
    assert.ok(!JSON.stringify(v.answers).includes('playerId'));
    const [c0, c1] = v.contenders.map((id) => t.ids.indexOf(id));
    assert.match(t.act(c0, { type: 'vote', side: 0 }) ?? '', /sfida/);
    const voters = t.ids.map((_, i) => i).filter((i) => i !== c0 && i !== c1);
    voters.forEach((i) => t.act(i, { type: 'vote', side: 1 }));
    mock.timers.tick(700);
    const r = t.state<GuastaPublic>();
    assert.ok(r.step === 'result' && r.sweep);
    if (r.step !== 'result') return;
    assert.equal(r.answers[1].points, 2 * GUASTA.POINTS_PER_VOTE + GUASTA.SWEEP_BONUS);
    t.room.destroy();
  });

  it('round 2: il proprio preferito non tocca mai a sé stessi', () => {
    const t = makeRoom(3);
    startShow(t, 'guastafeste');
    runUntilStep(t, 'favorite', 30 * 60_000, 500);
    t.ids.forEach((_, i) => t.act(i, { type: 'favorite', text: `preferito-${i}` }));
    runUntilStep(t, 'write', 2_000);
    t.ids.forEach((_, i) => assert.ok(!t.mine<GuastaPrivate>(i).prompts.some((p) => p.text === `preferito-${i}`)));
    t.room.destroy();
  });

  it('partita con bot: 3 round fino al menù', () => {
    const t = makeRoom(1, 3);
    startShow(t, 'guastafeste');
    const steps = runToMenu(t);
    assert.ok(steps.includes('favorite') && steps.includes('result') && steps.at(-1) === 'final');
  });
});
