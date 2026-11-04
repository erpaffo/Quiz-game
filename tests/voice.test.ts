// F3.2b: ogni battuta che il server annuncia deve esistere in audio.json, altrimenti in partita è silenzio.

import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { CHARACTERS } from '../shared/characters';
import { SHOWS } from '../shared/shows';
import { QUIZ_VOICE_KEYS, VOICE_LINES, fillName, sanitizeName, voiceTexts, type AudioManifest, type VoiceSayPayload } from '../shared/voice';
import type { RoomSnapshot } from '../shared/types';
import { PackStore } from '../server/PackStore';
import { VoiceQueue } from '../client/host/voice-queue';
import { Room, type IO } from '../server/Room';
import type { GameContext } from '../server/games/types';

const audio = JSON.parse(readFileSync(new URL('../client/public/audio/audio.json', import.meta.url), 'utf8')) as AudioManifest;
const files = audio.voice;

describe('Catalogo voci', () => {
  it('ogni battuta annunciata dal server esiste in audio.json', () => {
    const quiz = new Set<string>(QUIZ_VOICE_KEYS);
    for (const key of Object.keys(VOICE_LINES)) {
      if (!quiz.has(key)) continue; // le chiavi dei giochi del Pack non sono ancora in audio.json
      assert.ok(voiceTexts(key as never).length, `«${key}»: manca il testo per i sottotitoli`);
      const list = files[key as keyof typeof files];
      assert.ok(list?.length, `«${key}» non è in audio.json: in partita sarebbe silenzio`);
      for (const file of list) assert.match(file, /^voice\/.+\.(mp3|ogg|wav)$/, `«${key}»: percorso non valido (${file})`);
    }
  });

  it('audio.json resta compatibile con le 44 battute del quiz', () => {
    const quiz = new Set<string>(QUIZ_VOICE_KEYS);
    const keys = Object.keys(files);
    assert.deepEqual(keys.filter((k) => !quiz.has(k)), [], 'chiavi fuori dal contratto VoiceKey');
    assert.equal(Object.values(files).flat().length, 44);
  });

  it('il server annuncia avvio, ruota, minigioco, rivelazione e podio', () => {
    const said: VoiceSayPayload[] = [];
    let snapshot: RoomSnapshot | null = null;
    const io = {
      to: () => ({
        emit: (event: string, data: unknown) => {
          if (event === 'VOICE_SAY') said.push(data as VoiceSayPayload);
          else if (event === 'ROOM_STATE') snapshot = data as RoomSnapshot;
        }
      })
    } as unknown as IO;

    const room = new Room(io, 'VOCE', 'host-key', new PackStore({ userDir: mkdtempSync(join(tmpdir(), 'sep-voice-')) }));
    room.attachHost('sock-host');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = room.join(`sock-${i}`, `Giocatore${i}`);
      assert.ok(typeof res !== 'string', res as string);
      const c = CHARACTERS[i % CHARACTERS.length];
      assert.equal(room.selectCharacter(res.playerId, c.id, c.skins[0].id), null);
      room.setReady(res.playerId, true);
      ids.push(res.playerId);
    }
    // Un solo minigioco, ruota con il solo Classico: percorso corto e deterministico.
    room.setSettings({ mode: 'wheel', games: ['classic'], rounds: { quiz: 1 } });
    assert.equal(room.start(ids[0]), null);

    const phase = () => snapshot?.phaseData;
    const tickUntil = (done: () => boolean, what: string) => {
      for (let ms = 0; ms < 20 * 60_000; ms += 250) {
        if (done()) return;
        mock.timers.tick(250);
      }
      assert.fail(`fase «${what}» non raggiunta`);
    };

    tickUntil(() => phase()?.phase === 'WHEEL', 'WHEEL');
    tickUntil(() => phase()?.phase === 'GAME_INTRO', 'GAME_INTRO');
    tickUntil(() => {
      const p = phase();
      return p?.phase === 'PLAY' && p.state.step === 'reveal';
    }, 'rivelazione');
    (room as unknown as { ctx: GameContext }).ctx.gameOver([...ids]);

    const keys = said.map((s) => s.key);
    const expected = ['start', 'wheel', 'game_classic', 'nobody', 'winner'] as const;
    for (const key of expected) assert.ok(keys.includes(key), `manca la battuta «${key}» (viste: ${keys.join(', ')})`);
    assert.equal(said.find((s) => s.key === 'winner')?.priority, 'high');
    for (const s of said) {
      assert.ok(s.text.length > 0, `«${s.key}»: sottotitolo vuoto`);
      assert.ok(files[s.key as keyof typeof files]?.length, `«${s.key}»: non è in audio.json`);
    }
    // Il vincitore porta il nome grezzo (la pulizia la fa il client) e tutte le varianti.
    const win = said.find((s) => s.key === 'winner');
    assert.equal(win?.args?.nome, 'Giocatore0');
    assert.deepEqual(win?.texts, voiceTexts('winner'));
    room.destroy();
  });

  for (const show of ['tempo', 'bluff', 'impostor'] as const) {
    it(`${show}: emette intro, rivelazione e finale`, () => {
      const said: string[] = [];
      let phase = '';
      const io = {
        to: () => ({
          emit: (event: string, data: { key?: string; phase?: string }) => {
            if (event === 'VOICE_SAY') said.push(data.key!);
            else if (event === 'ROOM_STATE') phase = data.phase!;
          }
        })
      } as unknown as IO;
      const room = new Room(io, 'SHOW', 'host-key', new PackStore({ userDir: mkdtempSync(join(tmpdir(), 'sep-voice-')) }));
      room.attachHost('sock-host');
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const res = room.join(`sock-${i}`, `G${i}`);
        assert.ok(typeof res !== 'string', res as string);
        const c = CHARACTERS[i % CHARACTERS.length];
        assert.equal(room.selectCharacter(res.playerId, c.id, c.skins[Math.floor(i / CHARACTERS.length)].id), null);
        room.setReady(res.playerId, true);
        ids.push(res.playerId);
      }
      const was = SHOWS[show].available;
      SHOWS[show].available = true;
      try {
        assert.equal(room.menuNav(ids[0], { view: 'detail', focus: show }), null);
        assert.equal(room.start(ids[0]), null);
        for (let ms = 0; ms < 60 * 60_000 && phase !== 'LOBBY'; ms += 250) mock.timers.tick(250);
      } finally {
        SHOWS[show].available = was;
      }
      for (const step of ['intro', 'reveal', 'final']) assert.ok(said.includes(`${show}/${step}`), `manca ${show}/${step} (viste: ${said.join(', ')})`);
      room.destroy();
    });
  }
});

describe('VOICE_LINES', () => {
  it('testi non vuoti; ogni {nome} ha anche una variante senza nome', () => {
    for (const key of Object.keys(VOICE_LINES)) {
      const texts = voiceTexts(key as never);
      assert.ok(texts.length && texts.every((t) => t.trim()), `«${key}»: testo vuoto`);
      if (texts.some((t) => t.includes('{nome}'))) assert.ok(texts.some((t) => !t.includes('{nome}')), `«${key}»: manca la variante senza {nome}`);
    }
  });
});

describe('Nome nelle battute', () => {
  it('sanitizeName toglie emoji e simboli, tronca, vuoto se non resta nulla', () => {
    assert.equal(sanitizeName('  Marco 🎉  '), 'Marco');
    assert.equal(sanitizeName("Anna-Maria d'Este"), "Anna-Maria d'Este");
    assert.equal(sanitizeName('A'.repeat(30)).length, 20);
    assert.equal(sanitizeName('🔥💀 <>*'), '');
    assert.equal(sanitizeName('---'), '');
  });
  it('fillName sostituisce o toglie il segnaposto senza lasciare "{"', () => {
    assert.equal(fillName('Bravo {nome}!', 'Luca'), 'Bravo Luca!');
    assert.equal(fillName('Bravo {nome}!'), 'Bravo!');
    assert.equal(fillName('Bravo, {nome}!'), 'Bravo!');
    assert.equal(fillName('{nome}, tocca a te.'), 'Tocca a te.');
    for (const t of ['Ciao {nome}', '{nome}', 'a {nome} b {nome}']) assert.ok(!fillName(t).includes('{'));
  });
  it('VoiceQueue conserva onStart e testi', () => {
    const q = new VoiceQueue();
    let shown = '';
    q.push({ key: 'correct', texts: ['a'], onStart: (t) => (shown = t) }, 0);
    q.next()?.onStart?.('a');
    assert.equal(shown, 'a');
  });
});

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 }));
afterEach(() => mock.timers.reset());
