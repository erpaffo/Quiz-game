import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SMIST, type SmistPrivate, type SmistPublic } from '../shared/smistatori';
import { SMIST_PAIRS } from '../server/shows/smistatori/pairs';
import { makeRoom, runToMenu, runUntilStep, startShow, useFakeTime } from './helpers';

useFakeTime();

/** Indice del giocatore umano che ha la parola nella squadra indicata. */
function holder(t: ReturnType<typeof makeRoom>, team: 'A' | 'B') {
  return t.ids.findIndex((_, i) => t.mine<SmistPrivate>(i).team === team && t.mine<SmistPrivate>(i).word);
}

function sideOf(word: string, left: string) {
  const pair = SMIST_PAIRS.find((p) => p.left === left)!;
  return pair.words.find((w) => w.text === word)!.side;
}

describe('Smistatori', () => {
  it('ogni coppia ha 16 parole diverse, 8 per lato', () => {
    for (const p of SMIST_PAIRS) {
      assert.equal(new Set(p.words.map((w) => w.text)).size, 16, p.left);
      assert.equal(p.words.filter((w) => w.side === 'left').length, 8, p.left);
    }
  });

  it('squadre bilanciate; la parola arriva a un solo membro per squadra, a turno', () => {
    const t = makeRoom(4);
    startShow(t, 'smistatori');
    const teams = t.state<SmistPublic>();
    assert.ok(teams.step === 'teams' && teams.teams.A.length === 2 && teams.teams.B.length === 2);
    runUntilStep(t, 'round');
    const holders = t.ids.filter((_, i) => t.mine<SmistPrivate>(i).word);
    assert.equal(holders.length, 2, 'una parola per squadra');

    const a = holder(t, 'A');
    const st = t.state<SmistPublic>();
    if (st.step !== 'round') return assert.fail();
    const w = t.mine<SmistPrivate>(a).word!;
    const notMine = t.ids.findIndex((_, i) => i !== a && t.mine<SmistPrivate>(i).team === 'A');
    assert.match(t.act(notMine, { type: 'sort', wordId: w.id, side: 'left' }) ?? '', /tocca/);
    assert.equal(t.act(a, { type: 'sort', wordId: w.id, side: sideOf(w.text, st.left) }), null);
    assert.match(t.act(a, { type: 'sort', wordId: w.id, side: 'left' }) ?? '', /tocca|già/);
    // Ora tocca al compagno.
    assert.ok(t.mine<SmistPrivate>(notMine).word);
    const after = t.state<SmistPublic>();
    assert.ok(after.step === 'round' && after.teams.A.score === SMIST.RIGHT && after.feed[0].correct);
    t.room.destroy();
  });

  it('serie di 5 giuste: punti doppi; errore: −50 e serie azzerata', () => {
    const t = makeRoom(4);
    startShow(t, 'smistatori');
    runUntilStep(t, 'round');
    const st = t.state<SmistPublic>();
    if (st.step !== 'round') return assert.fail();
    // I membri della squadra A si alternano: ogni volta risponde chi ha la parola.
    for (let i = 0; i < SMIST.STREAK; i++) {
      const h = holder(t, 'A');
      const w = t.mine<SmistPrivate>(h).word!;
      assert.equal(t.act(h, { type: 'sort', wordId: w.id, side: sideOf(w.text, st.left) }), null);
    }
    const a = holder(t, 'A');
    const s1 = t.state<SmistPublic>();
    assert.ok(s1.step === 'round' && s1.teams.A.score === (SMIST.STREAK - 1) * SMIST.RIGHT + SMIST.RIGHT * SMIST.STREAK_MULT);
    const w = t.mine<SmistPrivate>(a).word!;
    t.act(a, { type: 'sort', wordId: w.id, side: sideOf(w.text, st.left) === 'left' ? 'right' : 'left' });
    const s2 = t.state<SmistPublic>();
    assert.ok(s2.step === 'round' && s2.teams.A.streak === 0);
    t.room.destroy();
  });

  it('se chi ha la parola esce, passa al compagno', () => {
    const t = makeRoom(4);
    startShow(t, 'smistatori');
    runUntilStep(t, 'round');
    const a = holder(t, 'A');
    t.room.disconnect(`sock-${a}`);
    // Il telefono disconnesso non riceve più aggiornamenti: si guarda la TV e i compagni connessi.
    const st = t.state<SmistPublic>();
    assert.ok(st.step === 'round' && st.teams.A.assignee !== null && st.teams.A.assignee !== t.ids[a]);
    const mate = t.ids.findIndex((_, i) => i !== a && t.mine<SmistPrivate>(i).team === 'A');
    assert.ok(t.mine<SmistPrivate>(mate).word, 'la parola passa al compagno');
    t.room.destroy();
  });

  it('partita con bot: 3 round fino al menù', () => {
    const t = makeRoom(1, 3);
    startShow(t, 'smistatori');
    const steps = runToMenu(t);
    assert.equal(steps.filter((s) => s === 'result').length, SMIST.ROUNDS);
  });
});
