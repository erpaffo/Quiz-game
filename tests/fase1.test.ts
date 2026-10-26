// Test di regressione della Fase 1 (bugfix server). Avvio: `npm test`.
// Il tempo è simulato con mock.timers: niente attese reali.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayState } from '../shared/types';
import { PausableTimers } from '../server/core/timers';
import { BombGame } from '../server/games/bomb';
import { richestOther } from '../server/games/common';
import type { GameContext } from '../server/games/types';
import type { PackStore } from '../server/PackStore';
import { newPlayer, type Player } from '../server/players';
import type { McDef } from '../server/QuestionPool';
import { Room, type IO } from '../server/Room';

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 }));
afterEach(() => mock.timers.reset());

function player(name: string, score = 0, connected = true): Player {
  const p = newPlayer(name, false);
  p.score = score;
  p.connected = connected;
  return p;
}

const DEF = { id: 'q1', category: 'Test', text: 'Domanda?', options: ['giusta', 'sbagliata'], correctIndex: 0, difficulty: 2 } as unknown as McDef;

/** GameContext minimo che riproduce le regole dei timer di Room: setStep/endStep cancellano i timer del passo, non quelli di gioco. */
function fakeContext(players: Player[]) {
  const stepTimers = new Set<ReturnType<typeof setTimeout>>();
  let stepEnd: (() => void) | null = null;
  const steps: PlayState[] = [];
  const clearStep = () => {
    for (const t of stepTimers) clearTimeout(t);
    stepTimers.clear();
  };
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      stepTimers.delete(t);
      fn();
    }, ms);
    stepTimers.add(t);
  };
  const gameTimers = new PausableTimers();
  const ctx = {
    players: () => players,
    connected: () => players.filter((p) => p.connected),
    get: (id: string) => players.find((p) => p.id === id),
    pool: { drawMc: () => DEF },
    dur: () => 12_000,
    scale: (ms: number) => ms,
    publicMc: () => ({ id: DEF.id }),
    present: () => {},
    setStep: (state: PlayState, durationMs: number | null, onEnd?: () => void) => {
      clearStep();
      steps.push(state);
      stepEnd = onEnd ?? null;
      if (durationMs !== null && onEnd) later(() => stepEnd === onEnd && (stepEnd = null, onEnd()), durationMs);
    },
    endStep: (delay = 0) => {
      const end = stepEnd;
      if (!end) return;
      stepEnd = null;
      clearStep();
      later(end, delay);
    },
    later,
    gameTimer: (fn: () => void, ms: number) => gameTimers.add(fn, ms),
    now: () => Date.now(),
    addScore: (p: Player, d: number) => {
      const applied = Math.max(-p.score, d);
      p.score += applied;
      return applied;
    },
    award: (p: Player, base: number) => base,
    recordAnswer: () => {},
    finish: () => {},
    act: () => {}
  } as unknown as GameContext;
  return { ctx, steps, last: () => steps.at(-1)! };
}

/** Avvia una Bomba e lascia `fuseMs` di miccia al portatore. */
function bombWithFuse(fuseMs: number) {
  const players = [player('Ada'), player('Bruno')];
  const f = fakeContext(players);
  const game = new BombGame(f.ctx);
  game.start();
  const internals = game as unknown as { holder: string; fuseLeft: number; burn(): void; stopBurn(): void };
  internals.stopBurn();
  internals.fuseLeft = fuseMs;
  internals.burn();
  const holder = players.find((p) => p.id === internals.holder)!;
  const other = players.find((p) => p !== holder)!;
  return { ...f, game, holder, other };
}

describe('richestOther', () => {
  const ctxOf = (players: Player[]) => fakeContext(players).ctx;

  it('ignora il più ricco se è offline', () => {
    const me = player('Me');
    const offline = player('Ricco offline', 900, false);
    const online = player('Online', 100);
    assert.equal(richestOther(ctxOf([me, offline, online]), me), online);
  });

  it('ripiega sugli offline se nessun altro è connesso', () => {
    const me = player('Me');
    const offline = player('Offline', 10, false);
    assert.equal(richestOther(ctxOf([me, offline]), me), offline);
  });

  it('restituisce undefined se è solo', () => {
    const me = player('Me');
    assert.equal(richestOther(ctxOf([me]), me), undefined);
  });
});

describe('BombGame: miccia', () => {
  it('risposta giusta con miccia < pausa di 400ms: niente esplosione, si passa la bomba', () => {
    const { game, holder, last } = bombWithFuse(300);
    assert.equal(game.action(holder, { type: 'answer', questionId: DEF.id, optionIndex: 0 }), null);
    mock.timers.tick(400);
    assert.equal(last().step, 'pass');
  });

  it('se un endStep anticipato arriva prima dello scoppio, la bomba esplode comunque in orario', () => {
    const { ctx, last } = bombWithFuse(300);
    ctx.endStep(700); // es. tutti hanno risposto (ALL_DONE_GRACE_MS)
    mock.timers.tick(300);
    assert.equal(last().step, 'boom');
  });

  it('il portatore disconnesso cede la bomba a un giocatore connesso', () => {
    const { game, holder, other, last } = bombWithFuse(30_000);
    holder.connected = false;
    // Domanda scaduta senza risposta giusta → rivelazione → domanda successiva.
    mock.timers.tick(12_000);
    assert.equal(last().step, 'reveal');
    mock.timers.tick(12_000);
    const state = last();
    assert.equal(state.step, 'question');
    assert.equal('holder' in state && state.holder, other.id);
    assert.equal(game.hasActed(other), false);
  });
});

describe('Room: capo stanza e SKIP_INTRO', () => {
  const io = { to: () => ({ emit: () => {} }) } as unknown as IO;
  const packs = { list: () => [], all: () => [], onChange: () => {} } as unknown as PackStore;

  function roomWithTwo() {
    const room = new Room(io, 'TEST', 'host-key', packs);
    const a = room.join('sock-a', 'Ada') as { playerId: string; rejoinKey: string };
    const b = room.join('sock-b', 'Bruno') as { playerId: string };
    const vip = () => (room as unknown as { vipId(): string | null }).vipId();
    return { room, a: a.playerId, aKey: a.rejoinKey, b: b.playerId, vip };
  }

  it('riconnettersi richiede la chiave segreta: con il solo id (pubblico) non si ruba il posto', () => {
    const { room, a, aKey } = roomWithTwo();
    room.disconnect('sock-a');
    assert.equal(room.join('sock-ladro', 'Ladro', a, 'chiave-sbagliata') && room.players.get(a)!.socketId, null);
    assert.deepEqual(room.join('sock-a2', 'Ada', a, aKey), { playerId: a, rejoinKey: aKey, reconnected: true });
    assert.equal(room.players.get(a)!.socketId, 'sock-a2');
    room.destroy();
  });

  it('un micro-calo di rete non sposta la corona', () => {
    const { room, a, aKey, vip } = roomWithTwo();
    assert.equal(vip(), a);
    room.disconnect('sock-a');
    mock.timers.tick(5_000);
    assert.equal(vip(), a);
    room.join('sock-a2', 'Ada', a, aKey);
    assert.equal(vip(), a);
    room.destroy();
  });

  it('dopo la tolleranza la corona passa e non torna indietro', () => {
    const { room, a, aKey, b, vip } = roomWithTwo();
    vip();
    room.disconnect('sock-a');
    mock.timers.tick(15_100);
    assert.equal(vip(), b);
    room.join('sock-a2', 'Ada', a, aKey);
    assert.equal(vip(), b);
    room.destroy();
  });

  it('SKIP_INTRO: solo il capo stanza, solo durante le spiegazioni, una volta sola', () => {
    const { room, a, b } = roomWithTwo();
    assert.match(room.skipIntro(a) ?? '', /Nessuna spiegazione/);

    const onEnd = mock.fn();
    (room as unknown as { setPhase(d: object, ms: number, end: () => void): void }).setPhase(
      { phase: 'GAME_INTRO', game: 'classic', gameNumber: 1, totalGames: 1 },
      6_000,
      onEnd
    );
    assert.match(room.skipIntro(b) ?? '', /capo stanza/);
    assert.equal(room.skipIntro(a), null);
    assert.equal(room.skipIntro(null), null); // doppio tocco / host: nessun effetto in più
    mock.timers.tick(1);
    assert.equal(onEnd.mock.callCount(), 1);
    mock.timers.tick(10_000);
    assert.equal(onEnd.mock.callCount(), 1);
    room.destroy();
  });
});
