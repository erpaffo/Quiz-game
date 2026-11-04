// Pausa nei giochi del quiz: il tempo in pausa non deve consumare la miccia della Bomba né i punti per velocità.

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { GameId, PlayState } from '../shared/types';
import { makeRoom, useFakeTime, type TestRoom } from './helpers';

useFakeTime();

/** Avvia il quiz con un solo gioco in scaletta e avanza fino alla prima domanda. */
function quizUntilQuestion(game: GameId): TestRoom {
  const t = makeRoom(3);
  assert.equal(t.room.setSettings({ showId: 'quiz', mode: 'sequence', sequence: [game] }, t.ids[0]), null);
  assert.equal(t.room.start(t.ids[0]), null);
  for (let ms = 0; ms < 5 * 60_000; ms += 100) {
    const d = t.tv().phaseData;
    if (d.phase === 'PLAY' && d.state.step === 'question') return t;
    mock.timers.tick(100);
  }
  assert.fail(`domanda di «${game}» non raggiunta`);
}

const play = (t: TestRoom) => {
  const d = t.tv().phaseData;
  assert.equal(d.phase, 'PLAY');
  return (d as { state: PlayState }).state;
};
const round = (t: TestRoom) => (t.room as unknown as { game: { round: { def: { id: string; correctIndex: number } } } }).game.round.def;

function pauseFor(t: TestRoom, ms: number) {
  assert.equal(t.room.setPaused(true), null);
  mock.timers.tick(ms);
  assert.equal(t.room.setPaused(false), null);
}

describe('Pausa nei giochi del quiz', () => {
  it('Bomba: dopo una lunga pausa chi ha la bomba e risponde giusto la lancia (niente BOOM)', () => {
    const t = quizUntilQuestion('bomb');
    const holder = (play(t) as { holder: string }).holder;
    pauseFor(t, 10 * 60_000); // molto più della miccia (35–55 s)
    const def = round(t);
    assert.equal(t.room.gameAction(holder, { type: 'answer', questionId: def.id, optionIndex: def.correctIndex }), null);
    mock.timers.tick(500);
    assert.equal(play(t).step, 'pass');
    t.room.destroy();
  });

  it('Classico: rispondere subito dopo una pausa vale il massimo dei punti', () => {
    const t = quizUntilQuestion('classic');
    pauseFor(t, 60_000);
    const def = round(t);
    const me = t.ids[0];
    assert.equal(t.room.gameAction(me, { type: 'answer', questionId: def.id, optionIndex: def.correctIndex }), null);
    for (let ms = 0; ms < 60_000 && play(t).step !== 'reveal'; ms += 100) mock.timers.tick(100);
    const res = (play(t) as { results: { playerId: string; points: number }[] }).results.find((r) => r.playerId === me)!;
    assert.ok(res.points >= 990, `punti ${res.points}: la pausa è stata contata come tempo di risposta`);
    t.room.destroy();
  });
});

describe('Classico: un solo Joker per voto', () => {
  it('il secondo Joker è rifiutato e non viene consumato', () => {
    const t = makeRoom(2);
    assert.equal(t.room.setSettings({ showId: 'quiz', mode: 'sequence', sequence: ['classic'] }, t.ids[0]), null);
    assert.equal(t.room.start(t.ids[0]), null);
    for (let ms = 0; ms < 5 * 60_000; ms += 100) {
      const d = t.tv().phaseData;
      if (d.phase === 'PLAY' && d.state.step === 'vote') break;
      mock.timers.tick(100);
    }
    const s = play(t) as unknown as { categories: { id: string }[] };
    const cat = s.categories[0].id;
    const [a, b] = t.ids.map((id) => t.room.players.get(id)!);
    const left = (p: typeof a) => p.jokerLeft;
    const before = left(b);
    assert.equal(t.room.gameAction(a.id, { type: 'vote', categoryId: cat, useJoker: true }), null);
    assert.equal(left(a), 0);
    assert.match(t.room.gameAction(b.id, { type: 'vote', categoryId: cat, useJoker: true }) ?? '', /Joker/);
    assert.equal(left(b), before, 'il Joker rifiutato non va consumato');
    assert.equal(t.room.gameAction(b.id, { type: 'vote', categoryId: cat, useJoker: false }), null, 'il voto resta valido senza Joker');
    t.room.destroy();
  });
});

describe('Indizio dopo Indizio', () => {
  it('i telefoni ricevono solo le parole già svelate; la domanda intera arriva alla rivelazione', () => {
    const t = quizUntilQuestion('clues');
    const full = (t.room as unknown as { game: { round: { def: { text: string } } } }).game.round.def.text;
    const text = () => (play(t) as { question: { text: string } }).question.text;
    if (full.split(/\s+/).length > 1) assert.notEqual(text(), full);
    assert.equal(text().split(' ')[0], full.split(/\s+/)[0], 'la prima parola si vede subito');
    for (let ms = 0; ms < 60_000 && play(t).step === 'question' && text() !== full; ms += 100) mock.timers.tick(100);
    assert.equal(text(), full, 'alla fine dello svelamento (o alla rivelazione) il testo è completo');
    t.room.destroy();
  });
});
