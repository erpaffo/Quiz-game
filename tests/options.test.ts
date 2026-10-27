// Regole modificabili dal sottomenù di ogni gioco: validazione, Ritmo e le regole specifiche.

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { SHOW_IDS, SHOWS, optionFor, roundsFor, sanitizeOptions } from '../shared/shows';
import type { LobbySettings } from '../shared/types';
import { activeShow, makeRoom, runUntilStep, startShow, useFakeTime } from './helpers';

useFakeTime();

const settingsOf = (t: ReturnType<typeof makeRoom>) => (t.tv().phaseData as { settings: LobbySettings }).settings;

describe('Regole del sottomenù: catalogo e validazione', () => {
  it('ogni gioco tranne il quiz ha il Ritmo (il quiz ha la Difficoltà); le scelte predefinite esistono', () => {
    for (const id of SHOW_IDS) {
      const opts = SHOWS[id].options;
      if (id === 'quiz') assert.deepEqual(opts.map((o) => o.id), ['difficulty']);
      else assert.equal(opts[0].id, 'pace', id);
      for (const o of opts) assert.ok(o.choices.some((c) => c.id === o.default), `${id}/${o.id}`);
    }
  });

  it('sanitizeOptions tiene solo regole e scelte esistenti', () => {
    assert.deepEqual(sanitizeOptions('bluff', { pace: 'fast', doubles: 'off', hack: 'x' }), { pace: 'fast', doubles: 'off' });
    assert.deepEqual(sanitizeOptions('bluff', { pace: 'warp', doubles: 5 }), {});
    assert.deepEqual(sanitizeOptions('quiz', { pace: 'fast' }), {});
    assert.deepEqual(sanitizeOptions('tempo', null), {});
    assert.deepEqual(sanitizeOptions('tempo', 'fast'), {});
  });

  it('optionFor: scelta valida o predefinito; roundsFor del quiz segue la Durata', () => {
    assert.equal(optionFor({ options: { leggende: { hearts: '5' } } }, 'leggende', 'hearts'), '5');
    assert.equal(optionFor({ options: { leggende: { hearts: '9' } } }, 'leggende', 'hearts'), '3');
    assert.equal(optionFor(undefined, 'bluff', 'doubles'), 'on');
    assert.equal(roundsFor({ length: 'long' }, 'quiz'), 7);
    assert.equal(roundsFor({ length: 'long', rounds: { quiz: 4 } }, 'quiz'), 4);
  });

  it('la stanza fonde le scelte per gioco e scarta quelle sbagliate; solo il capo stanza', () => {
    const t = makeRoom(3);
    assert.equal(t.room.setSettings({ options: { bluff: { pace: 'fast' } } }, t.ids[0]), null);
    assert.equal(t.room.setSettings({ options: { bluff: { doubles: 'off' }, leggende: { hearts: '5' } } }, t.ids[0]), null);
    t.room.setSettings({ options: { bluff: { pace: 'warp' }, inesistente: { a: 'b' } } as never }, t.ids[0]);
    assert.deepEqual(settingsOf(t).options, { bluff: { pace: 'fast', doubles: 'off' }, leggende: { hearts: '5' } });
    assert.match(t.room.setSettings({ options: { bluff: { pace: 'slow' } } }, t.ids[1]) ?? '', /capo stanza/);
    t.room.destroy();
  });
});

describe('Regole del sottomenù: effetti nei giochi', () => {
  const stepMs = (pace: string, show: 'social' | 'tempo') => {
    const t = makeRoom(3);
    t.room.setSettings({ options: { [show]: { pace } } });
    startShow(t, show);
    const ms = t.tv().endsAt! - t.tv().serverNow;
    t.room.destroy();
    return ms;
  };

  for (const show of ['social', 'tempo'] as const) {
    it(`Ritmo: «${SHOWS[show].name}» veloce < normale < rilassato`, () => {
      const [fast, normal, slow] = [stepMs('fast', show), stepMs('normal', show), stepMs('slow', show)];
      assert.ok(fast < normal && normal < slow, `${fast} < ${normal} < ${slow}`);
      assert.ok(Math.abs(fast / normal - 0.7) < 0.02 && Math.abs(slow / normal - 1.5) < 0.02);
    });
  }

  it('Fuffa d’Autore: con «ultime 2 doppie» = No nessuna domanda vale doppio', () => {
    for (const [choice, expected] of [['off', 0], ['on', 2]] as const) {
      const t = makeRoom(3);
      t.room.setSettings({ options: { bluff: { doubles: choice } } });
      startShow(t, 'bluff');
      let doubles = 0;
      for (let elapsed = 0; elapsed < 3 * 60 * 60_000 && t.tv().phase !== 'LOBBY'; elapsed += 250) {
        const st = t.state<{ step?: string; double?: boolean }>();
        if (st?.step === 'lie' && st.double) doubles++;
        mock.timers.tick(250);
      }
      assert.equal(t.tv().phase, 'LOBBY');
      assert.ok(expected === 0 ? doubles === 0 : doubles > 0, `${choice}: ${doubles}`);
      t.room.destroy();
    }
  });

  it('L’Impostore: senza «ultima possibilità» l’impostore smascherato non tenta di indovinare', () => {
    for (const [choice, expectGuess] of [['on', true], ['off', false]] as const) {
      const t = makeRoom(4);
      t.room.setSettings({ options: { impostor: { lastChance: choice } } });
      startShow(t, 'impostor');
      runUntilStep(t, 'vote');
      const impostorId = activeShow<{ impostorId: string }>(t).impostorId;
      t.ids.forEach((id, i) => t.act(i, { type: 'vote', targetId: id === impostorId ? t.ids.find((x) => x !== id) : impostorId }));
      let sawGuess = false;
      for (let elapsed = 0; elapsed < 5_000; elapsed += 100) {
        if (t.state<{ step?: string }>()?.step === 'guess') sawGuess = true;
        mock.timers.tick(100);
      }
      assert.equal(sawGuess, expectGuess, choice);
      t.room.destroy();
    }
  });

  it('Leggende: «Vite degli eroi» cambia i cuori iniziali e il massimo', () => {
    for (const hearts of [2, 3, 5]) {
      const t = makeRoom(3);
      t.room.setSettings({ options: { leggende: { hearts: String(hearts) } } });
      startShow(t, 'leggende');
      const mine = t.mine<{ hearts: number; maxHearts: number }>(0);
      assert.equal(mine.hearts, hearts);
      assert.equal(mine.maxHearts, hearts);
      t.room.destroy();
    }
  });
});
