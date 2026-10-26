import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { SOCIAL, type SocialPublic } from '../shared/social';
import { makeRoom, runToMenu, startShow, useFakeTime } from './helpers';

useFakeTime();

describe('Chi di Noi?', () => {
  it('punti a chi vota come la maggioranza, bonus al più votato, voto su sé stessi ammesso', () => {
    const t = makeRoom(4);
    startShow(t, 'social');
    const [a, b] = t.ids;
    assert.equal(t.act(0, { type: 'vote', targetId: a }), null); // si vota da solo
    t.act(1, { type: 'vote', targetId: a });
    t.act(2, { type: 'vote', targetId: a });
    t.act(3, { type: 'vote', targetId: b });
    assert.match(t.act(3, { type: 'vote', targetId: 'nessuno' }) ?? '', /non valido/);
    mock.timers.tick(700);
    const r = t.state<SocialPublic>();
    assert.equal(r.step, 'reveal');
    if (r.step !== 'reveal') return;
    assert.deepEqual(r.winners, [a]);
    assert.deepEqual(
      t.ids.map((id) => r.points[id]),
      [SOCIAL.MAJORITY_POINTS + SOCIAL.CROWN_POINTS, SOCIAL.MAJORITY_POINTS, SOCIAL.MAJORITY_POINTS, 0]
    );
    t.room.destroy();
  });

  it('nessuna maggioranza se ognuno vota una persona diversa', () => {
    const t = makeRoom(3);
    startShow(t, 'social');
    t.ids.forEach((id, i) => t.act(i, { type: 'vote', targetId: id }));
    mock.timers.tick(700);
    const r = t.state<SocialPublic>();
    assert.ok(r.step === 'reveal' && r.winners.length === 0 && Object.values(r.points).every((p) => p === 0));
    t.room.destroy();
  });

  it('partita con bot fino al menù', () => {
    const t = makeRoom(1, 3);
    startShow(t, 'social');
    const steps = runToMenu(t);
    assert.equal(steps.filter((s) => s === 'reveal').length, SOCIAL.ROUNDS);
  });
});
