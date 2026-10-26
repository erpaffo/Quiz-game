import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { BLUFF, type BluffPrivate, type BluffPublic } from '../shared/bluff';
import { buildOptions, scoreChoices } from '../server/core/bluff';
import { BLUFF_FACTS } from '../server/shows/bluff/facts';
import { makeRoom, runToMenu, startShow, useFakeTime } from './helpers';

useFakeTime();

describe('Motore del bluff', () => {
  it('unisce bugie identiche, riempie con le bugie della casa, id non legati alla verità', () => {
    const lies = new Map([
      ['a', 'Cane'],
      ['b', 'cane!'],
      ['c', 'Gatto']
    ]);
    const opts = buildOptions('Topo', lies, ['Lupo', 'Orso'], 4);
    assert.equal(opts.length, 4);
    assert.deepEqual(opts.find((o) => o.text === 'Cane')?.authors, ['a', 'b']);
    assert.equal(opts.filter((o) => o.isTruth).length, 1);
    assert.deepEqual(opts.map((o) => o.id).sort(), ['o1', 'o2', 'o3', 'o4']);
  });

  it('punteggi: verità al votante, inganno diviso tra co-autori', () => {
    const opts = buildOptions('Topo', new Map([['a', 'Cane'], ['b', 'Cane'], ['c', 'Gatto']]), [], 3);
    const truth = opts.find((o) => o.isTruth)!.id;
    const cane = opts.find((o) => o.text === 'Cane')!.id;
    const pts = scoreChoices(opts, new Map([['c', cane], ['a', truth]]), 1000, () => 500);
    assert.deepEqual(Object.fromEntries(pts), { a: 1000 + 250, b: 250 });
  });

  it('i fatti di serie hanno risposta e 3 bugie diverse dalla risposta', () => {
    assert.ok(BLUFF_FACTS.length >= BLUFF.QUESTIONS);
    for (const f of BLUFF_FACTS) {
      assert.ok(f.text.includes('___'), f.id);
      assert.equal(f.lies.length, 3, f.id);
      assert.ok(!f.lies.some((l) => l.toLowerCase() === f.answer.toLowerCase()), f.id);
    }
  });
});

describe("Fuffa d'Autore", () => {
  it('rifiuta la verità come bugia e la scelta della propria bugia; assegna i punti', () => {
    const t = makeRoom(3);
    startShow(t, 'bluff');
    const st = t.state<BluffPublic>();
    assert.equal(st.step, 'lie');
    const fact = BLUFF_FACTS.find((f) => st.step === 'lie' && f.text === st.question)!;
    assert.match(t.act(0, { type: 'lie', text: fact.answer.toUpperCase() }) ?? '', /verità/);
    assert.equal(t.mine<BluffPrivate>(0).safeties.length, BLUFF.SAFETY_CHOICES);
    assert.equal(t.act(0, { type: 'lie', text: 'Zzz bugia' }), null);
    assert.equal(t.act(1, { type: 'lie', text: 'Yyy bugia' }), null);
    assert.equal(t.act(2, { type: 'safety', index: 0 }), null);
    mock.timers.tick(700);

    const ch = t.state<BluffPublic>();
    assert.equal(ch.step, 'choose');
    if (ch.step !== 'choose') return;
    assert.ok(!JSON.stringify(ch).includes('isTruth'), 'la TV non deve sapere qual è la verità');
    const own = t.mine<BluffPrivate>(0).myOptionId!;
    assert.match(t.act(0, { type: 'choose', optionId: own }) ?? '', /tua bugia/);
    // 0 e 2 cascano nella bugia di 1; 1 trova la verità (scoperta dalla rivelazione).
    const yyy = ch.options.find((o) => o.text === 'Yyy bugia')!.id;
    t.act(0, { type: 'choose', optionId: yyy });
    t.act(2, { type: 'choose', optionId: yyy });
    const truthId = ch.options.find((o) => o.text === fact.answer)!.id;
    t.act(1, { type: 'choose', optionId: truthId });
    mock.timers.tick(700);

    const r = t.state<BluffPublic>();
    assert.equal(r.step, 'reveal');
    if (r.step !== 'reveal') return;
    assert.equal(r.points[t.ids[1]], BLUFF.TRUTH_POINTS + 2 * BLUFF.FOOL_POINTS);
    assert.equal(r.points[t.ids[0]], 0);
    t.room.destroy();
  });

  it('partita intera con bot fino al menù (ultime domande doppie)', () => {
    const t = makeRoom(1, 3);
    startShow(t, 'bluff');
    const steps = runToMenu(t);
    assert.equal(steps.at(-1), 'final');
    assert.equal(steps.filter((s) => s === 'reveal').length, BLUFF.QUESTIONS);
  });
});
