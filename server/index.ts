import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { Server, type Socket } from 'socket.io';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '../shared/events';
import { lanAddresses } from './network';
import { PackStore, USER_DIR } from './PackStore';
import type { Room } from './Room';
import { RoomManager } from './RoomManager';

const PORT = Number(process.env.PORT ?? 3000);
const PROD = process.argv.includes('--prod');
const SPEED = Number(process.env.GAME_SPEED ?? 1) || 1;
const ROOT = resolve(import.meta.dirname, '..');

const app = express();
const httpServer = createHttpServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  // Lascia passare gli upgrade WebSocket di Vite (HMR) sullo stesso server HTTP.
  destroyUpgrade: false,
  maxHttpBufferSize: 200_000
});
const packs = new PackStore();
const rooms = new RoomManager(io, packs, SPEED);

// ------------------------------------------------------------------ API

app.use('/api', express.json({ limit: '3mb' }));

app.get('/api/info', (_req, res) => {
  res.json({ port: PORT, lan: lanAddresses() });
});

// Laboratorio Domande: i pacchetti sono file JSON in user-packs/
app.get('/api/packs', (_req, res) => {
  res.json(packs.list());
});
app.get('/api/packs/:id', (req, res) => {
  const pack = packs.get(req.params.id);
  if (!pack) return res.status(404).json({ error: 'Pacchetto inesistente' });
  res.json(pack);
});
app.post('/api/packs', (req, res) => {
  try {
    const body = { ...req.body };
    // Un pacchetto importato con l'id di uno esistente viene salvato come copia.
    if (!body.id || packs.get(body.id)) delete body.id;
    res.json(packs.save(body));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
app.put('/api/packs/:id', (req, res) => {
  try {
    res.json(packs.save(req.body, req.params.id));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
app.delete('/api/packs/:id', (req, res) => {
  try {
    packs.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

if (PROD) {
  app.use(express.static(resolve(ROOT, 'dist')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    configFile: resolve(ROOT, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: 'mpa'
  });
  app.use(vite.middlewares);
}

// ------------------------------------------------------------------ socket

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, { room?: Room; playerId?: string; isHost?: boolean }>;

/** Converte l'esito di un'azione (null = ok, stringa = errore) in risposta ack. */
function reply(ack: Ack | undefined, error: string | null) {
  if (typeof ack !== 'function') return;
  ack(error ? { ok: false, error } : { ok: true });
}

/** Protegge gli handler: un payload malformato non deve far cadere il server. */
function safe<A extends unknown[]>(fn: (...args: A) => void) {
  return (...args: A) => {
    try {
      fn(...args);
    } catch (err) {
      console.error('Errore nella gestione di un evento:', err);
      const ack = args.at(-1);
      if (typeof ack === 'function') ack({ ok: false, error: 'Errore interno' });
    }
  };
}

io.on('connection', (socket: GameSocket) => {
  const player = () => {
    const { room, playerId } = socket.data;
    return room && playerId ? { room, playerId } : null;
  };
  const host = () => (socket.data.isHost && socket.data.room?.hostSocketId === socket.id ? socket.data.room : null);
  const NOT_IN_ROOM = 'Non sei in una stanza';

  socket.on('CREATE_ROOM', safe((_p, ack) => {
    const room = rooms.create();
    socket.data = { room, isHost: true };
    socket.join(room.channel);
    room.attachHost(socket.id);
    ack({ ok: true, code: room.code, hostKey: room.hostKey });
  }));

  socket.on('HOST_REJOIN', safe((p, ack) => {
    const room = rooms.get(p?.code);
    if (!room || room.hostKey !== p.hostKey) return reply(ack, 'Stanza non trovata');
    socket.data = { room, isHost: true };
    socket.join(room.channel);
    room.attachHost(socket.id);
    reply(ack, null);
  }));

  socket.on('JOIN_ROOM', safe((p, ack) => {
    const room = rooms.get(p?.code);
    if (!room) return reply(ack, 'Codice stanza non valido');
    const res = room.join(socket.id, p.name, p.playerId);
    if (typeof res === 'string') return reply(ack, res);
    socket.data = { room, playerId: res.playerId };
    socket.join(room.channel);
    ack({ ok: true, ...res });
  }));

  socket.on('ADD_BOT', safe((_p, ack) => {
    const room = host();
    reply(ack, room ? room.addBot() : 'Solo lo schermo principale può aggiungere bot');
  }));

  socket.on('KICK_PLAYER', safe((p) => {
    host()?.removePlayer(p?.playerId);
  }));

  socket.on('SET_SETTINGS', safe((p, ack) => {
    const room = host();
    reply(ack, room ? room.setSettings(p ?? {}) : 'Solo lo schermo principale può cambiare le impostazioni');
  }));

  socket.on('START_GAME', safe((_p, ack) => {
    const h = host();
    const pl = player();
    if (h) return reply(ack, h.start(null));
    if (pl) return reply(ack, pl.room.start(pl.playerId));
    reply(ack, NOT_IN_ROOM);
  }));

  socket.on('RESTART_GAME', safe((_p, ack) => {
    const h = host();
    const pl = player();
    if (h) return reply(ack, h.restart(null));
    if (pl) return reply(ack, pl.room.restart(pl.playerId));
    reply(ack, NOT_IN_ROOM);
  }));

  socket.on('SELECT_CHARACTER', safe((p, ack) => {
    const pl = player();
    reply(ack, pl ? pl.room.selectCharacter(pl.playerId, p?.characterId, p?.skinId) : NOT_IN_ROOM);
  }));

  socket.on('UPLOAD_SELFIE', safe((p, ack) => {
    const pl = player();
    reply(ack, pl ? pl.room.setSelfie(pl.playerId, p?.dataUrl ?? null) : NOT_IN_ROOM);
  }));

  socket.on('PLAYER_READY', safe((p) => {
    const pl = player();
    pl?.room.setReady(pl.playerId, !!p?.ready);
  }));

  socket.on('ADD_QUESTION', safe((p, ack) => {
    if (!player()) return reply(ack, NOT_IN_ROOM);
    try {
      ack({ ok: true, total: packs.addPhoneQuestion(p) });
    } catch (err) {
      reply(ack, (err as Error).message);
    }
  }));

  socket.on('PLAY_CARD', safe((p, ack) => {
    const pl = player();
    reply(ack, pl ? pl.room.playCard(pl.playerId, p?.card ?? null, p?.targetId ?? null) : NOT_IN_ROOM);
  }));

  socket.on('GAME_ACTION', safe((p, ack) => {
    const pl = player();
    reply(ack, pl ? pl.room.gameAction(pl.playerId, p) : NOT_IN_ROOM);
  }));

  socket.on('CLEAR_EFFECT', safe((p) => {
    const pl = player();
    pl?.room.clearEffect(pl.playerId, p?.type);
  }));

  socket.on('disconnect', () => {
    socket.data.room?.disconnect(socket.id);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddresses();
  console.log('\n  🎮  Sapere è Potere — server avviato (funziona anche senza internet)\n');
  console.log(`  Schermo principale:    http://localhost:${PORT}/host.html`);
  console.log(`  Laboratorio domande:   http://localhost:${PORT}/editor.html`);
  if (lan.length) {
    console.log(`  Controller (telefoni): http://${lan[0].address}:${PORT}/controller.html   [${lan[0].name}]`);
    for (const l of lan.slice(1)) console.log(`                         http://${l.address}:${PORT}/controller.html   [${l.name}]`);
  } else {
    console.log('  ⚠️  Nessuna rete trovata: collega il PC al Wi-Fi o all\'hotspot di un telefono.');
  }
  console.log(`  Pacchetti personali in: ${USER_DIR}`);
  if (SPEED !== 1) console.log(`  ⚡ Velocità di gioco x${SPEED}`);
  console.log('');
});
