// Aiutanti condivisi dai test dei giochi del Pack. Il tempo va simulato con mock.timers (vedi useFakeTime).

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, mock } from 'node:test';
import { CHARACTERS } from '../shared/characters';
import { SHOW_IDS, SHOWS, type ShowId } from '../shared/shows';
import type { RoomSnapshot } from '../shared/types';
import { PackStore } from '../server/PackStore';
import { Room, type IO } from '../server/Room';

/** Tempo finto + tutti i giochi selezionabili (nel menù reale lo diventano quando la UI è pronta). */
export function useFakeTime() {
  const saved = new Map(SHOW_IDS.map((id) => [id, SHOWS[id].available]));
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    for (const id of SHOW_IDS) SHOWS[id].available = true;
  });
  afterEach(() => {
    mock.timers.reset();
    for (const id of SHOW_IDS) SHOWS[id].available = saved.get(id)!;
  });
}

let packs: PackStore | null = null;
/** Pacchetti di serie veri (servono a Leggende del Quiz); i pacchetti personali vanno in una cartella temporanea. */
function realPacks(): PackStore {
  packs ??= new PackStore({ userDir: mkdtempSync(join(tmpdir(), 'sep-test-')) });
  return packs;
}

export interface TestRoom {
  room: Room;
  /** Id dei giocatori umani, nell'ordine dei nomi passati. */
  ids: string[];
  /** Ultimo snapshot ricevuto dalla TV. */
  tv(): RoomSnapshot;
  /** Stato pubblico dello Show (RoomSnapshot.show.state). */
  state<T = Record<string, unknown>>(): T;
  /** Stato privato del giocatore umano n. i. */
  mine<T = Record<string, unknown>>(i: number): T;
  /** Azione di un umano: restituisce l'errore o null. */
  act(i: number, payload: unknown): string | null;
  botIds(): string[];
}

export function makeRoom(humans = 3, bots = 0): TestRoom {
  const emitted = new Map<string, RoomSnapshot>();
  const io = {
    to: (id: string) => ({
      emit: (ev: string, data: RoomSnapshot) => {
        if (ev === 'ROOM_STATE') emitted.set(id, data);
      }
    })
  } as unknown as IO;
  const room = new Room(io, 'TEST', 'host-key', realPacks());
  room.attachHost('sock-host');
  const ids: string[] = [];
  for (let i = 0; i < humans; i++) {
    const res = room.join(`sock-${i}`, `Giocatore${i}`);
    assert.ok(typeof res !== 'string', res as string);
    const c = CHARACTERS[i % CHARACTERS.length];
    assert.equal(room.selectCharacter(res.playerId, c.id, c.skins[Math.floor(i / CHARACTERS.length)].id), null);
    room.setReady(res.playerId, true);
    ids.push(res.playerId);
  }
  for (let i = 0; i < bots; i++) assert.equal(room.addBot(), null);
  return {
    room,
    ids,
    tv: () => emitted.get('sock-host')!,
    state: <T>() => emitted.get('sock-host')!.show?.state as T,
    mine: <T>(i: number) => emitted.get(`sock-${i}`)!.me?.show as T,
    act: (i, payload) => room.showAction(ids[i], payload),
    botIds: () => [...room.players.values()].filter((p) => p.isBot).map((p) => p.id)
  };
}

/** Test "dall'interno": il plugin attivo, per leggere o preparare lo stato in modo deterministico. */
export function activeShow<T>(t: TestRoom): T {
  return (t.room as unknown as { activeShow: T }).activeShow;
}

/** Sceglie e avvia uno Show come farebbe il capo stanza dal menù. */
export function startShow(t: TestRoom, id: ShowId) {
  assert.equal(t.room.menuNav(t.ids[0] ?? null, { view: 'detail', focus: id }), null);
  assert.equal(t.room.start(t.ids[0] ?? null), null);
  assert.equal(t.tv().phase, 'SHOW');
}

/** Fa scorrere il tempo a piccoli passi finché lo Show non torna al menù. Restituisce i passi visti. */
export function runToMenu(t: TestRoom, maxMs = 60 * 60_000, stepMs = 250): string[] {
  const seen: string[] = [];
  for (let elapsed = 0; elapsed < maxMs; elapsed += stepMs) {
    if (t.tv().phase === 'LOBBY') return seen;
    const step = String(t.state<{ step?: string }>()?.step ?? '');
    if (seen.at(-1) !== step) seen.push(step);
    mock.timers.tick(stepMs);
  }
  assert.fail(`Lo Show non è tornato al menù entro ${maxMs} ms (passi visti: ${seen.join(' → ')})`);
}

/** Avanza finché lo stato pubblico ha il passo indicato. */
export function runUntilStep(t: TestRoom, step: string, maxMs = 10 * 60_000, stepMs = 100) {
  for (let elapsed = 0; elapsed < maxMs; elapsed += stepMs) {
    if (t.state<{ step?: string }>()?.step === step) return;
    mock.timers.tick(stepMs);
  }
  assert.fail(`Passo «${step}» non raggiunto (ultimo: ${t.state<{ step?: string }>()?.step})`);
}
