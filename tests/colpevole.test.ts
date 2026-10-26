import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { COLPEVOLE, type ColpevolePrivate, type ColpevolePublic } from '../shared/colpevole';
import { makeRoom, runToMenu, runUntilStep, startShow, useFakeTime } from './helpers';

useFakeTime();

describe('Il Colpevole', () => {
  it('falsificare la risposta giusta fa sembrare innocente il colpevole', () => {
    const t = makeRoom(4);
    startShow(t, 'colpevole');
    assert.match(t.act(0, { type: 'survey', answers: [0, 1] }) ?? '', /tutte/);
    t.ids.forEach((_, i) => t.act(i, { type: 'survey', answers: new Array(COLPEVOLE.QUESTIONS).fill(1) }));
    mock.timers.tick(700);
    assert.equal(t.state<ColpevolePublic>().step, 'role');
    const culprit = t.ids.findIndex((_, i) => t.mine<ColpevolePrivate>(i).role === 'culprit');
    assert.ok(culprit >= 0);
    const other = (culprit + 1) % 4;
    assert.match(t.act(other, { type: 'falsify', questionIndex: 0 }) ?? '', /Solo il colpevole/);

    // Risposte note: il colpevole ha 0 ovunque, gli altri 1 (così ogni indizio lo distingue).
    const inside = (t.room as unknown as { activeShow: { answers: Map<string, number[]> } }).activeShow;
    t.ids.forEach((id, i) => inside.answers.set(id, new Array(COLPEVOLE.QUESTIONS).fill(i === culprit ? 0 : 1)));
    // Si può falsificare una sola risposta.
    assert.equal(t.act(culprit, { type: 'falsify', questionIndex: 2 }), null);
    assert.match(t.act(culprit, { type: 'falsify', questionIndex: 3 }) ?? '', /già/);
    assert.equal(t.mine<ColpevolePrivate>(culprit).falsified, 2);
    mock.timers.tick(700); // il colpevole ha agito: il passo si chiude

    runUntilStep(t, 'clue', 2_000);
    const st = t.state<ColpevolePublic>();
    if (st.step !== 'clue') return assert.fail();
    const clue = st.clues[0];
    assert.equal(clue.answer, 0, 'gli indizi usano le risposte VERE del colpevole');
    const row = st.board.find((r) => r.playerId === t.ids[culprit])!;
    assert.equal(row.answers[2], 1, 'nel tabellone pubblico la risposta 2 è falsificata');
    assert.equal(st.suspects.includes(t.ids[culprit]), clue.questionIndex !== 2);
    t.room.destroy();
  });

  it('accusa: smascherato → punti agli investigatori; voto su sé stessi vietato', () => {
    const t = makeRoom(4);
    startShow(t, 'colpevole');
    runUntilStep(t, 'role', 60_000, 500);
    const culprit = t.ids.findIndex((_, i) => t.mine<ColpevolePrivate>(i).role === 'culprit');
    runUntilStep(t, 'vote', 5 * 60_000, 500);
    assert.match(t.act(culprit, { type: 'vote', targetId: t.ids[culprit] }) ?? '', /te stesso/);
    t.ids.forEach((_, i) => t.act(i, { type: 'vote', targetId: i === culprit ? t.ids[(culprit + 1) % 4] : t.ids[culprit] }));
    mock.timers.tick(700);
    const r = t.state<ColpevolePublic>();
    assert.equal(r.step, 'reveal');
    if (r.step !== 'reveal') return;
    assert.ok(r.caught);
    const detective = (culprit + 1) % 4;
    assert.equal(r.points[t.ids[(culprit + 2) % 4]], COLPEVOLE.CATCH_POINTS + COLPEVOLE.TEAM_BONUS);
    assert.equal(r.points[t.ids[culprit]], COLPEVOLE.MISLEAD_POINTS); // un voto su un innocente
    assert.ok(r.points[t.ids[detective]] >= COLPEVOLE.CATCH_POINTS);
    t.room.destroy();
  });

  it('partita con bot: 2 casi fino al menù', () => {
    const t = makeRoom(1, 4);
    startShow(t, 'colpevole');
    const steps = runToMenu(t);
    assert.equal(steps.filter((s) => s === 'reveal').length, COLPEVOLE.CASES);
    assert.ok(steps.includes('alibi'));
  });
});
