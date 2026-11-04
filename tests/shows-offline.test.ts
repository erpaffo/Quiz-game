import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { GuastaPublic } from '../shared/guastafeste';
import type { ImpostorPublic } from '../shared/impostor';
import type { LeggendePrivate } from '../shared/leggende';
import type { SmistPrivate } from '../shared/smistatori';
import { activeShow, makeRoom, runUntilStep, startShow, useFakeTime } from './helpers';

useFakeTime();

describe('Giocatori offline nei Pack', () => {
  it('Impostore: se l’impostore esce senza essere smascherato il round è annullato', () => {
    const t = makeRoom(4);
    startShow(t, 'impostor');
    const imp = activeShow<{ impostorId: string }>(t).impostorId;
    t.room.disconnect(`sock-${t.ids.indexOf(imp)}`);
    runUntilStep(t, 'reveal');
    const s = t.state<Extract<ImpostorPublic, { step: 'reveal' }>>();
    assert.deepEqual(Object.values(s.points).filter((p) => p !== 0), []);
    t.room.destroy();
  });

  it('Colpevole: il colpevole è scelto solo tra i connessi', () => {
    const t = makeRoom(4);
    startShow(t, 'colpevole');
    t.room.disconnect('sock-0');
    runUntilStep(t, 'role');
    assert.notEqual(activeShow<{ culpritId: string }>(t).culpritId, t.ids[0]);
    t.room.destroy();
  });

  it('Smistatori: la parola non smistata scade e passa alla successiva', () => {
    const t = makeRoom(4);
    startShow(t, 'smistatori');
    runUntilStep(t, 'round');
    const a = t.ids.findIndex((_, i) => t.mine<SmistPrivate>(i).word);
    t.room.disconnect(`sock-${a}`);
    mock.timers.tick(16_000);
    const after = t.state<{ teams: Record<string, { done: number }> }>().teams;
    assert.ok(after.A.done + after.B.done >= 2, 'una parola saltata per squadra');
    t.room.destroy();
  });

  it('Leggende: un eroe offline non viene colpito', () => {
    const t = makeRoom(4);
    startShow(t, 'leggende');
    runUntilStep(t, 'question');
    const d = activeShow<{ def: { id: string; correctIndex: number } }>(t).def;
    const hearts = t.mine<LeggendePrivate>(0).hearts;
    t.room.disconnect('sock-0');
    for (let i = 1; i < 4; i++) t.act(i, { type: 'answer', questionId: d.id, optionIndex: (d.correctIndex + 1) % 4 });
    runUntilStep(t, 'result');
    assert.equal(activeShow<{ heroes: Map<string, { hearts: number }> }>(t).heroes.get(t.ids[0])!.hearts, hearts);
    t.room.destroy();
  });

  it('Guastafeste: gli offline non impediscono il cappotto', () => {
    const t = makeRoom(5);
    startShow(t, 'guastafeste');
    runUntilStep(t, 'write');
    const show = activeShow<{ matchups: { id: string; players: string[] }[] }>(t);
    for (const m of show.matchups) for (const pid of m.players) t.room.showAction(pid, { type: 'answer', promptId: m.id, text: 'x' });
    runUntilStep(t, 'vote');
    const st = t.state<Extract<GuastaPublic, { step: 'vote' }>>();
    const voters = t.ids.filter((id) => !st.contenders.includes(id));
    t.room.disconnect(`sock-${t.ids.indexOf(voters[0])}`);
    for (const id of voters.slice(1)) t.room.showAction(id, { type: 'vote', side: 0 });
    runUntilStep(t, 'result');
    assert.equal(t.state<{ sweep: boolean }>().sweep, true);
    t.room.destroy();
  });
});
