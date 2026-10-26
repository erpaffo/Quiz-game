// Test architetturali della Fase 2 (Hub Multi-Gioco, ShowPlugin, ShowRegistry e bersagli carte offline).
// Avvio: `npm test`.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { CHARACTERS } from '../shared/characters';
import { getShowMeta, SHOWS } from '../shared/shows';
import type { RoomSnapshot } from '../shared/types';
import type { PackStore } from '../server/PackStore';
import { Room, type IO } from '../server/Room';

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 }));
afterEach(() => mock.timers.reset());

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
  const room = new Room(io, 'HUB1', 'host-key', packs);
  room.attachHost('sock-host');
  const a = room.join('sock-a', 'Ada') as { playerId: string };
  const b = room.join('sock-b', 'Bruno') as { playerId: string };
  const charA = CHARACTERS[0];
  const charB = CHARACTERS[1];
  room.selectCharacter(a.playerId, charA.id, charA.skins[0].id);
  room.selectCharacter(b.playerId, charB.id, charB.skins[0].id);
  room.setReady(a.playerId, true);
  room.setReady(b.playerId, true);
  return { room, a: a.playerId, b: b.playerId, emitted };
}

describe('Fase 2: Architettura Hub Multi-Gioco & ShowRegistry', () => {
  it('registra QuizShowPlugin di default e consente al VIP o Host di cambiare showId nella Lobby', () => {
    const { room, a, b } = setupRoom();
    assert.equal(room.registry.has('quiz'), true);
    assert.equal(room.settings.showId, 'quiz');

    // Un giocatore non-VIP non può cambiare Show
    assert.match(room.setSettings({ showId: 'bluff' }, b) ?? '', /capo stanza/);
    assert.equal(room.settings.showId, 'quiz');

    // Il VIP (Ada) può selezionare uno Show nel Party Hub
    assert.equal(room.setSettings({ showId: 'bluff' }, a), null);
    assert.equal(room.settings.showId, 'bluff');

    // Se lo Show non è ancora registrato/disponibile, start() restituisce un messaggio amichevole
    SHOWS.bluff.available = false;
    try {
      assert.match(room.start(a) ?? '', /in arrivo/);
    } finally {
      SHOWS.bluff.available = true;
    }

    // L'Host (null) può riportare lo Show a 'quiz'
    assert.equal(room.setSettings({ showId: 'quiz' }, null), null);
    assert.equal(room.settings.showId, 'quiz');
    room.destroy();
  });

  it('permette di agganciare un nuovo ShowPlugin senza modificare i tipi del Quiz e gestisce SHOW_ACTION + returnToHub', () => {
    const { room, a, b, emitted } = setupRoom();

    // Simuliamo l'attivazione del plugin "bluff" (Fuffa d'Autore)
    const prevAvailable = SHOWS.bluff.available;
    SHOWS.bluff.available = true;
    try {
      const lies = new Map<string, string>();
      room.registry.register('bluff', (ctx) => ({
        id: 'bluff',
        meta: getShowMeta('bluff'),
        canStart: () => null,
        start: () => {
          ctx.setStep({ step: 'writeLie' }, 15_000);
          return null;
        },
        handleAction: (player, action: { text?: string }) => {
          if (!action?.text) return 'Scrivi una bugia';
          lies.set(player.id, action.text);
          ctx.addScore(player, 250);
          return null;
        },
        hasActed: (player) => lies.has(player.id),
        publicState: () => ({ step: 'writeLie', submittedCount: lies.size }),
        privateState: (player) => ({ myLie: lies.get(player.id) ?? null }),
        destroy: () => lies.clear()
      }));

      assert.equal(room.setSettings({ showId: 'bluff' }, a), null);
      assert.equal(room.start(a), null);

      const hostSnap = emitted.get('sock-host')!;
      assert.deepEqual(hostSnap.show, { id: 'bluff', state: { step: 'writeLie', submittedCount: 0 } });

      // Ada invia un'azione tramite SHOW_ACTION
      assert.equal(room.showAction(a, { text: 'Il colibrì dorme a testa in giù' }), null);
      const adaSnap = emitted.get('sock-a')!;
      assert.deepEqual(adaSnap.show, { id: 'bluff', state: { step: 'writeLie', submittedCount: 1 } });
      assert.deepEqual(adaSnap.me?.show, { myLie: 'Il colibrì dorme a testa in giù' });
      assert.equal(adaSnap.players.find((p) => p.id === a)?.score, 250);

      // Ritorno al Party Hub: giocatori e personaggi restano intatti
      assert.equal(room.restart(null), null);
      assert.equal(room.phase, 'LOBBY');
      assert.equal(room.players.size, 2);
      assert.equal(room.players.get(a)?.characterId, CHARACTERS[0].id);
      assert.equal(room.players.get(b)?.characterId, CHARACTERS[1].id);
    } finally {
      SHOWS.bluff.available = prevAvailable;
      room.destroy();
    }
  });

  it('rifiuta il lancio di carte di attacco verso un avversario disconnesso', () => {
    const { room, a, b } = setupRoom();
    const pA = room.players.get(a)!;
    const pB = room.players.get(b)!;
    pA.hand = ['ICE'];
    pA.playsLeft = 1;
    (room as unknown as { setPhase(d: object, ms: number | null): void }).setPhase({ phase: 'CARD_PICK', game: 'classic' }, null);

    // Bruno perde la connessione durante la scelta carte
    pB.connected = false;
    assert.match(room.playCard(a, 'ICE', b) ?? '', /connesso/);
    assert.equal(pA.playsLeft, 1);

    // Bruno torna online: ora l'attacco è valido
    pB.connected = true;
    assert.equal(room.playCard(a, 'ICE', b), null);
    assert.equal(pA.playsLeft, 0);
    room.destroy();
  });
});

