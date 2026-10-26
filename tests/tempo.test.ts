// Test della Macchina del Tempo e del ciclo di vita di uno Show dell'Hub (fase SHOW). Avvio: `npm test`.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { CHARACTERS } from '../shared/characters';
import { SHOWS } from '../shared/shows';
import { TEMPO, tempoPoints, type TempoPrivate, type TempoPublic } from '../shared/tempo';
import type { RoomSnapshot } from '../shared/types';
import type { PackStore } from '../server/PackStore';
import { Room, type IO } from '../server/Room';
import { TEMPO_EVENTS } from '../server/shows/tempo/events';

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  // Il gioco è nascosto dal menù finché la UI non è pronta: nei test lo rendiamo avviabile.
  SHOWS.tempo.available = true;
});
afterEach(() => {
  mock.timers.reset();
  SHOWS.tempo.available = false;
});

function setupRoom() {
  const emitted = new Map<string, RoomSnapshot>();
  const io = {
    to: (id: string) => ({
      emit: (ev: string, data: RoomSnapshot) => {
        if (ev === 'ROOM_STATE') emitted.set(id, data);
      }
    })
  } as unknown as IO;
  const packs = { list: () => [], all: () => [], onChange: () => {} } as unknown as PackStore;
  const room = new Room(io, 'TEMP', 'host-key', packs);
  room.attachHost('sock-host');
  const ids = ['Ada', 'Bruno'].map((name, i) => {
    const { playerId } = room.join(`sock-${name}`, name) as { playerId: string };
    room.selectCharacter(playerId, CHARACTERS[i].id, CHARACTERS[i].skins[0].id);
    room.setReady(playerId, true);
    return playerId;
  });
  const tv = () => emitted.get('sock-host')!;
  const state = () => tv().show?.state as TempoPublic;
  const mine = (name: string) => emitted.get(`sock-${name}`)!.me?.show as TempoPrivate;
  const yearOf = (event: string) => TEMPO_EVENTS.find((e) => e.text === event)!.year;
  return { room, a: ids[0], b: ids[1], tv, state, mine, yearOf };
}

function startTempo(r: ReturnType<typeof setupRoom>) {
  assert.equal(r.room.setSettings({ showId: 'tempo' }, r.a), null);
  assert.equal(r.room.start(r.a), null);
}

/** Avanza un passo alla volta: un timer creato durante un tick non scatta nello stesso tick. */
function skipRound() {
  mock.timers.tick(TEMPO.QUESTION_MS);
  mock.timers.tick(TEMPO.REVEAL_MS);
}

describe('tempoPoints', () => {
  it('premia la vicinanza, con bonus per l’anno esatto', () => {
    assert.equal(tempoPoints(null), 0);
    assert.equal(tempoPoints(0), TEMPO.MAX_POINTS + TEMPO.EXACT_BONUS);
    assert.equal(tempoPoints(30), 70);
    assert.equal(tempoPoints(500), 0);
  });

  it('gli eventi di serie sono validi e sufficienti', () => {
    assert.ok(TEMPO_EVENTS.length >= TEMPO.ROUNDS);
    assert.equal(new Set(TEMPO_EVENTS.map((e) => e.id)).size, TEMPO_EVENTS.length);
    for (const e of TEMPO_EVENTS) assert.ok(e.year >= TEMPO.MIN_YEAR && e.year <= TEMPO.MAX_YEAR, e.id);
  });
});

describe('Macchina del Tempo nella stanza', () => {
  it('avvio: fase SHOW, prima domanda col countdown, niente nuovi ingressi né doppio avvio', () => {
    const r = setupRoom();
    startTempo(r);
    assert.equal(r.tv().phase, 'SHOW');
    assert.deepEqual(r.tv().phaseData, { phase: 'SHOW', show: 'tempo' });
    assert.equal(r.state().step, 'question');
    assert.equal(r.tv().endsAt, TEMPO.QUESTION_MS);
    assert.match(r.room.join('sock-x', 'Ugo') as string, /già iniziata/);
    assert.match(r.room.start(r.a) ?? '', /già in corso/);
    r.room.destroy();
  });

  it('punteggi: anno esatto 150, 30 anni di errore 70; chiusura anticipata quando tutti rispondono', () => {
    const r = setupRoom();
    startTempo(r);
    const st = r.state();
    assert.equal(st.step, 'question');
    const year = r.yearOf(st.step === 'question' ? st.event : '');
    const other = year + 30 <= TEMPO.MAX_YEAR ? year + 30 : year - 30;

    assert.equal(r.room.showAction(r.a, { type: 'year', value: year }), null);
    assert.equal(r.mine('Ada').myYear, year);
    assert.equal(r.room.showAction(r.b, { type: 'year', value: other }), null);
    mock.timers.tick(700); // ALL_DONE_GRACE_MS: non serve aspettare i 20 secondi

    const rev = r.state();
    assert.equal(rev.step, 'reveal');
    const score = (id: string) => r.tv().players.find((p) => p.id === id)!.score;
    assert.equal(score(r.a), 150);
    assert.equal(score(r.b), 70);
    r.room.destroy();
  });

  it('rifiuta azioni malformate o fuori tempo', () => {
    const r = setupRoom();
    startTempo(r);
    for (const bad of [null, 'x', {}, { type: 'answer' }, { type: 'year', value: 999 }, { type: 'year', value: 2027 }, { type: 'year', value: 1500.5 }, { type: 'year', value: '1500' }]) {
      assert.ok(r.room.showAction(r.a, bad), `doveva rifiutare ${JSON.stringify(bad)}`);
    }
    mock.timers.tick(TEMPO.QUESTION_MS);
    assert.equal(r.state().step, 'reveal');
    assert.match(r.room.showAction(r.a, { type: 'year', value: 1500 }) ?? '', /momento/);
    r.room.destroy();
  });

  it('chi si disconnette non viene espulso e non blocca gli altri', () => {
    const r = setupRoom();
    startTempo(r);
    r.room.disconnect('sock-Bruno');
    mock.timers.tick(5_000);
    assert.equal(r.room.showAction(r.a, { type: 'year', value: 1500 }), null);
    mock.timers.tick(700); // Ada è l'unica connessa: la domanda si chiude subito
    assert.equal(r.state().step, 'reveal');
    mock.timers.tick(25_000);
    assert.ok(r.room.players.has(r.b), 'Bruno deve poter rientrare a partita in corso');
    r.room.destroy();
  });

  it('partita completa: 8 domande, classifica finale e ritorno all’Hub con i giocatori', () => {
    const r = setupRoom();
    startTempo(r);
    for (let i = 0; i < TEMPO.ROUNDS; i++) skipRound();
    const fin = r.state();
    assert.equal(fin.step, 'final');
    assert.equal(fin.step === 'final' && fin.ranking[0].totalError, TEMPO.ROUNDS * TEMPO.MAX_POINTS);

    mock.timers.tick(TEMPO.FINAL_MS);
    assert.equal(r.tv().phase, 'LOBBY');
    assert.equal(r.tv().show, null);
    assert.equal(r.room.players.size, 2);
    r.room.destroy();
  });

  it('i bot rispondono da soli entro il tempo della domanda', () => {
    const r = setupRoom();
    assert.equal(r.room.addBot(), null);
    startTempo(r);
    mock.timers.tick(TEMPO.QUESTION_MS);
    const rev = r.state();
    assert.equal(rev.step, 'reveal');
    const bot = [...r.room.players.values()].find((p) => p.isBot)!;
    const g = rev.step === 'reveal' ? rev.guesses.find((x) => x.playerId === bot.id) : undefined;
    assert.ok(g && g.year !== null, 'il bot doveva rispondere');
    r.room.destroy();
  });

  it('se lo Show non è disponibile nel catalogo, non parte', () => {
    const r = setupRoom();
    SHOWS.tempo.available = false;
    r.room.setSettings({ showId: 'tempo' }, r.a);
    assert.match(r.room.start(r.a) ?? '', /in arrivo/);
    assert.equal(r.room.phase, 'LOBBY');
    r.room.destroy();
  });
});
