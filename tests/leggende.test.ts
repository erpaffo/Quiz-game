import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { LEGGENDE, type LeggendeHero, type LeggendePrivate, type LeggendePublic } from '../shared/leggende';
import type { McDef } from '../server/QuestionPool';
import { activeShow, makeRoom, runToMenu, runUntilStep, startShow, useFakeTime } from './helpers';

useFakeTime();

interface Inside {
  def: McDef;
  heroes: Map<string, LeggendeHero>;
  gold: number;
}

function answerAll(t: ReturnType<typeof makeRoom>, right: boolean[]) {
  const d = activeShow<Inside>(t).def;
  right.forEach((ok, i) => t.act(i, { type: 'answer', questionId: d.id, optionIndex: ok ? d.correctIndex : (d.correctIndex + 1) % d.options.length }));
}

describe('Leggende del Quiz', () => {
  it('risposte giuste = danni (il più veloce ×1,5); mostro sconfitto → oro e negozio', () => {
    const t = makeRoom(2);
    startShow(t, 'leggende');
    runUntilStep(t, 'question');
    const st = t.state<LeggendePublic>();
    assert.ok(st.step === 'question' && st.monster.maxHp === 2 * LEGGENDE.MONSTERS[0].hpPerHero);
    assert.ok(st.step === 'question' && st.question.options.length >= 3, 'niente vero/falso: serve alla Lente');
    answerAll(t, [true, true]);
    mock.timers.tick(700);
    const r = t.state<LeggendePublic>();
    assert.equal(r.step, 'result');
    if (r.step !== 'result') return;
    assert.deepEqual(r.results.map((x) => x.damage), [150, 100]);
    assert.equal(r.attack, null);

    while (t.state<LeggendePublic>().step !== 'shop') {
      runUntilStep(t, 'question', 60_000);
      answerAll(t, [true, true]);
      mock.timers.tick(700);
      runUntilStep(t, 'result', 2_000);
      mock.timers.tick(LEGGENDE.RESULT_MS);
    }
    const shop = t.state<LeggendePublic>();
    assert.ok(shop.step === 'shop' && shop.gold === 2 * LEGGENDE.GOLD_PER_HERO);
    t.room.destroy();
  });

  it('se sbagliano in troppi il mostro attacca chi ha sbagliato; lo scudo blocca', () => {
    const t = makeRoom(3);
    startShow(t, 'leggende');
    runUntilStep(t, 'question');
    activeShow<Inside>(t).heroes.get(t.ids[1])!.items.push('shield');
    assert.equal(t.act(1, { type: 'use', item: 'shield' }), null);
    assert.match(t.act(2, { type: 'use', item: 'shield' }) ?? '', /Non hai/);
    answerAll(t, [true, false, false]); // 1 giusto su 3 < 50%
    mock.timers.tick(700);
    const r = t.state<LeggendePublic>();
    assert.ok(r.step === 'result' && r.attack);
    if (r.step !== 'result' || !r.attack) return;
    assert.deepEqual(r.attack.hit, [t.ids[2]]);
    assert.deepEqual(r.attack.blocked, [t.ids[1]]);
    assert.equal(t.mine<LeggendePrivate>(2).hearts, LEGGENDE.HEARTS - 1);
    t.room.destroy();
  });

  it('lente: elimina 2 sbagliate, che non si possono più scegliere; bomba: 200 danni', () => {
    const t = makeRoom(2);
    startShow(t, 'leggende');
    runUntilStep(t, 'question');
    const inside = activeShow<Inside>(t);
    inside.heroes.get(t.ids[0])!.items.push('lens', 'bomb');
    assert.equal(t.act(0, { type: 'use', item: 'lens' }), null);
    const removed = t.mine<LeggendePrivate>(0).removed;
    assert.equal(removed.length, 2);
    assert.ok(!removed.includes(inside.def.correctIndex));
    assert.match(t.act(0, { type: 'answer', questionId: inside.def.id, optionIndex: removed[0] }) ?? '', /Lente/);
    assert.equal(t.act(0, { type: 'use', item: 'bomb' }), null);
    const st = t.state<LeggendePublic>();
    assert.ok(st.step === 'question' && st.monster.hp === st.monster.maxHp - LEGGENDE.BOMB_DAMAGE);
    t.room.destroy();
  });

  it('negozio: comprare con l’oro di squadra, rianimare un compagno KO', () => {
    const t = makeRoom(2);
    startShow(t, 'leggende');
    while (t.state<LeggendePublic>().step !== 'shop') {
      runUntilStep(t, 'question', 60_000);
      answerAll(t, [true, true]);
      mock.timers.tick(700);
      runUntilStep(t, 'result', 2_000);
      mock.timers.tick(LEGGENDE.RESULT_MS);
    }
    const inside = activeShow<Inside>(t);
    inside.heroes.get(t.ids[1])!.hearts = 0;
    inside.gold = 200;
    assert.match(t.act(1, { type: 'buy', item: 'potion' }) ?? '', /KO/);
    assert.equal(t.act(0, { type: 'buy', item: 'potion' }), null);
    assert.match(t.act(0, { type: 'buy', item: 'drago' }) ?? '', /sconosciuto/);
    assert.equal(t.act(0, { type: 'revive', targetId: t.ids[1] }), null);
    assert.ok(t.mine<LeggendePrivate>(1).hearts >= 1);
    assert.equal(inside.gold, 200 - LEGGENDE.ITEMS.potion.price - LEGGENDE.REVIVE_PRICE);
    assert.match(t.act(0, { type: 'buy', item: 'bomb' }) ?? '', /insufficiente/);
    t.room.destroy();
  });

  it('partita con bot fino al menù (vittoria o sconfitta)', () => {
    const t = makeRoom(1, 3);
    startShow(t, 'leggende');
    const steps = runToMenu(t);
    assert.ok(steps.includes('victory') || steps.includes('defeat'));
    assert.equal(steps.at(-1), 'final');
  });
});
