import express from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { Server, type Socket } from 'socket.io';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '../shared/events';
import { lanAddresses } from './network';
import { PackStore } from './PackStore';
import type { Room } from './Room';
import { RoomManager } from './RoomManager';

export interface ServerOptions {
  /** Porta preferita. Se è occupata si prova la successiva (fino a `portTries` volte). */
  port: number;
  portTries?: number;
  /** Cartella del client compilato (dist). Se assente e `dev` è falso, il server non serve pagine. */
  staticDir?: string;
  /** Vite in modalità sviluppo con ricarica automatica (solo `npm run dev`). */
  dev?: boolean;
  /** Radice del progetto, necessaria solo con `dev`. */
  root?: string;
  builtinPacksDir?: string;
  userPacksDir?: string;
  /** Cartella dei file caricati dal Laboratorio (immagini, audio): servita su /media. */
  mediaDir?: string;
  /** Audio personalizzati: i file qui dentro sostituiscono quelli di serie con lo stesso percorso sotto /audio. */
  audioOverrideDir?: string;
  /** Hotspot acceso dal PC: lo schermo principale mostra il QR per collegarsi alla rete. */
  hotspot?: { ssid: string; password: string } | null;
  /** Moltiplicatore di velocità (solo test). */
  speed?: number;
  log?: (line: string) => void;
}

export interface RunningServer {
  port: number;
  packs: PackStore;
  /** Cambia (o toglie) l'hotspot mostrato nello schermo principale. */
  setHotspot(hotspot: { ssid: string; password: string } | null): void;
  close(): Promise<void>;
}

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

function listen(server: ReturnType<typeof createHttpServer>, port: number, tries: number): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const attempt = (p: number, left: number) => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && left > 0) attempt(p + 1, left - 1);
        else reject(err.code === 'EADDRINUSE' ? new Error(`Le porte da ${port} a ${p} sono tutte occupate`) : err);
      };
      server.once('error', onError);
      server.listen(p, '0.0.0.0', () => {
        server.off('error', onError);
        resolvePort(p);
      });
    };
    attempt(port, tries);
  });
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    // Lascia passare gli upgrade WebSocket di Vite (HMR) sullo stesso server HTTP.
    destroyUpgrade: false,
    maxHttpBufferSize: 200_000
  });
  const packs = new PackStore({ builtinDir: opts.builtinPacksDir, userDir: opts.userPacksDir });
  const rooms = new RoomManager(io, packs, opts.speed ?? 1);
  let hotspot = opts.hotspot ?? null;
  let port = opts.port;

  // ---------------------------------------------------------------- API
  app.use('/api', express.json({ limit: '3mb' }));

  app.get('/api/info', (_req, res) => {
    res.json({ port, lan: lanAddresses(), hotspot });
  });

  // Laboratorio Domande: i pacchetti sono file JSON nella cartella dei pacchetti personali
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

  // File multimediali caricati dal Laboratorio: le domande li indicano come /media/nomefile
  if (opts.audioOverrideDir) {
    mkdirSync(opts.audioOverrideDir, { recursive: true });
    app.use('/audio', express.static(opts.audioOverrideDir));
  }

  if (opts.mediaDir) {
    const mediaDir = opts.mediaDir;
    mkdirSync(mediaDir, { recursive: true });
    app.use('/media', express.static(mediaDir));
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp3', '.ogg', '.wav', '.m4a', '.aac'];
    app.post('/api/media', express.raw({ type: () => true, limit: '20mb' }), (req, res) => {
      const original = String(req.query.name ?? 'file');
      const ext = (original.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
      if (!allowed.includes(ext)) return res.status(400).json({ error: `Formato non supportato (${allowed.join(', ')})` });
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'File vuoto' });
      const base = original.slice(0, -ext.length).normalize('NFD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
      const name = `${Date.now().toString(36)}-${base}${ext}`;
      writeFileSync(resolve(mediaDir, name), req.body);
      res.json({ path: `/media/${name}` });
    });
  }

  let closeVite: (() => Promise<void>) | null = null;
  if (opts.dev) {
    const root = opts.root ?? process.cwd();
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: resolve(root, 'vite.config.ts'),
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: 'mpa'
    });
    closeVite = () => vite.close();
    app.use(vite.middlewares);
  } else if (opts.staticDir) {
    app.use(express.static(opts.staticDir));
  }

  // ---------------------------------------------------------------- socket
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

  port = await listen(httpServer, opts.port, opts.portTries ?? 0);

  const lan = lanAddresses();
  log('\n  🎮  Server avviato (funziona anche senza internet)\n');
  log(`  Schermo principale:    http://localhost:${port}/host.html`);
  log(`  Laboratorio domande:   http://localhost:${port}/editor.html`);
  if (lan.length) {
    log(`  Controller (telefoni): http://${lan[0].address}:${port}/controller.html   [${lan[0].name}]`);
    for (const l of lan.slice(1)) log(`                         http://${l.address}:${port}/controller.html   [${l.name}]`);
  } else {
    log("  ⚠️  Nessuna rete trovata: collega il PC al Wi-Fi o all'hotspot di un telefono.");
  }
  log(`  Pacchetti personali in: ${packs.userDir}`);
  if (hotspot) log(`  📶 Hotspot del PC: rete «${hotspot.ssid}», password «${hotspot.password}»`);
  if (opts.speed && opts.speed !== 1) log(`  ⚡ Velocità di gioco x${opts.speed}`);
  log('');

  return {
    port,
    packs,
    setHotspot: (h) => {
      hotspot = h;
    },
    close: async () => {
      io.close();
      await closeVite?.();
      await new Promise<void>((done) => httpServer.close(() => done()));
    }
  };
}
