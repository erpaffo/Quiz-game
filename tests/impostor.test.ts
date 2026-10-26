import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { IMPOSTOR, type ImpostorPrivate, type ImpostorPublic } from '../shared/impostor';
import { makeRoom, runToMenu, runUntilStep, startShow, useFakeTime } from './helpers';

useFakeTime();

/** Ruoli dal punto di vista dei telefoni: [indice impostore, parola]. */
function roles(t: ReturnType<typeof makeRoom>) {
  const views = t.ids.map((_, i) => t.mine<ImpostorPrivate>(i));
  const imp = views.findIndex((v) => v.role === 'impostor');
  const word = views.find((v) => v.role === 'crew')!.word!;
  return { imp, word, views };
}

describe("L'Impostore", () => {
  it('ruoli segreti: l’impostore non vede la parola, la TV nemmeno', () => {
    const t = makeRoom(4);
    startShow(t, 'impostor');
    const { imp, word, views } = roles(t);
    assert.ok(imp >= 0);
    assert.equal(views[imp].word, null);
    assert.equal(views.filter((v) => v.word === word).length, 3);
    assert.ok(!JSON.stringify(t.tv().show).includes(word), 'la TV non deve mostrare la parola');
    t.room.destroy();
  });

  it('indizi: una parola sola, mai la parola segreta', () => {
    const t = makeRoom(4);
    startShow(t, 'impostor');
    const { imp, word } = roles(t);
    runUntilStep(t, 'clue');
    const crew = imp === 0 ? 1 : 0;
    assert.match(t.act(crew, { type: 'clue', text: 'due parole' }) ?? '', /sola/);
    assert.match(t.act(crew, { type: 'clue', text: word.toUpperCase() }) ?? '', /segreta/);
    assert.equal(t.act(crew, { type: 'clue', text: 'indizio' }), null);
    t.room.destroy();
  });

  it('impostore smascherato che sbaglia la parola: punti alla squadra', () => {
    const t = makeRoom(4);
    startShow(t, 'impostor');
    const { imp } = roles(t);
    runUntilStep(t, 'clue');
    t.ids.forEach((_, i) => t.act(i, { type: 'clue', text: `indizio${i}` }));
    runUntilStep(t, 'discuss', 2_000);
    t.ids.forEach((_, i) => t.act(i, { type: 'ready' }));
    runUntilStep(t, 'vote', 2_000);
    assert.match(t.act(imp, { type: 'vote', targetId: t.ids[imp] }) ?? '', /te stesso/);
    t.ids.forEach((_, i) => t.act(i, { type: 'vote', targetId: i === imp ? t.ids[(imp + 1) % 4] : t.ids[imp] }));
    runUntilStep(t, 'guess', 2_000);
    const crew = imp === 0 ? 1 : 0;
    assert.match(t.act(crew, { type: 'guess', text: 'x' }) ?? '', /Solo/);
    t.act(imp, { type: 'guess', text: 'sicuramente-sbagliata' });
    mock.timers.tick(700);
    const r = t.state<ImpostorPublic>();
    assert.equal(r.step, 'reveal');
    if (r.step !== 'reveal') return;
    assert.equal(r.caught, true);
    assert.equal(r.guessedRight, false);
    assert.equal(r.points[t.ids[imp]], 0);
    assert.equal(r.points[t.ids[crew]], IMPOSTOR.CATCH_POINTS + IMPOSTOR.CREW_BONUS);
    t.room.destroy();
  });

  it('impostore smascherato che indovina la parola: vince lui', () => {
    const t = makeRoom(4);
    startShow(t, 'impostor');
    const { imp, word } = roles(t);
    runUntilStep(t, 'vote');
    t.ids.forEach((_, i) => t.act(i, { type: 'vote', targetId: i === imp ? t.ids[(imp + 1) % 4] : t.ids[imp] }));
    runUntilStep(t, 'guess', 2_000);
    t.act(imp, { type: 'guess', text: `  ${word.toLowerCase()}! ` });
    mock.timers.tick(700);
    const r = t.state<ImpostorPublic>();
    assert.ok(r.step === 'reveal' && r.guessedRight && r.points[t.ids[imp]] === IMPOSTOR.IMPOSTOR_POINTS);
    t.room.destroy();
  });

  it('partita con bot: 3 round, impostore sempre diverso, fino al menù', () => {
    const t = makeRoom(1, 4);
    startShow(t, 'impostor');
    const impostors = new Set<string>();
    for (let r = 0; r < IMPOSTOR.ROUNDS; r++) {
      runUntilStep(t, 'reveal', 10 * 60_000, 250);
      impostors.add((t.state<ImpostorPublic>() as { impostorId: string }).impostorId);
      mock.timers.tick(IMPOSTOR.REVEAL_MS);
    }
    assert.equal(impostors.size, IMPOSTOR.ROUNDS);
    runToMenu(t);
  });
});
