import type { Server } from 'socket.io';
import { isAttack } from '../shared/cards';
import { CHARACTERS, getSkin, sanitizeCustom } from '../shared/characters';
import { CONFIG, type DurationKey } from '../shared/config';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/events';
import { GAME_IDS, GAMES } from '../shared/games';
import type {
  CardType,
  GameAction,
  GameId,
  LobbySettings,
  Phase,
  PhaseData,
  PlayerPublic,
  PlayState,
  PowerType,
  PrivateState,
  RoomSnapshot
} from '../shared/types';
import { createGame, gameAvailable } from './games';
import { PyramidGame } from './games/pyramid';
import type { GameContext, GameMode } from './games/types';
import { dealHand, resolveCards } from './logic/cards';
import { startingSteps } from './logic/pyramid';
import { computeRanks } from './logic/scoring';
import type { PackStore } from './PackStore';
import { newPlayer, resetForGame, resetForShow, type Player } from './players';
import { QuestionPool } from './QuestionPool';
import { pick, randomBetween, shuffle } from './util';

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;

/** Errore restituito al client (stringa in italiano) oppure null se l'azione è valida. */
type ActionResult = string | null;

const BOT_NAMES = ['Ugo', 'Lia', 'Bruno', 'Ada', 'Tito', 'Gina', 'Pino', 'Rita', 'Dino', 'Vera', 'Nico', 'Elsa', 'Zeno', 'Olga', 'Remo', 'Iris'];
const LOBBY_DISCONNECT_GRACE_MS = 20_000;
const MIN_MC_QUESTIONS = 10;
const REEL_LENGTH = 16;
const REEL_STOP = 13;

export class Room {
  hostSocketId: string | null = null;
  lastActivity = Date.now();
  readonly players = new Map<string, Player>();
  settings: LobbySettings = { length: 'normal', excluded: [], mode: 'wheel', games: [...GAME_IDS], sequence: ['classic', 'fastest', 'bomb', 'blitz', 'estimate'] };

  private phaseData: Exclude<PhaseData, { phase: 'LOBBY' }> | { phase: 'LOBBY' } = { phase: 'LOBBY' };
  private endsAt: number | null = null;
  private stepEnd: (() => void) | null = null;
  private graceScheduled = false;
  private timers = new Set<NodeJS.Timeout>();
  private lobbyRemovals = new Map<string, NodeJS.Timeout>();

  private pool: QuestionPool | null = null;
  private game: GameMode | null = null;
  private gameId: GameId | 'pyramid' | null = null;
  /** `order`: scaletta fissa (null = ruota); `wheel`: giochi che la ruota può estrarre. */
  private show = { total: 0, played: [] as GameId[], order: null as GameId[] | null, wheel: [] as GameId[] };
  private readonly ctx: GameContext;

  constructor(
    private readonly io: IO,
    readonly code: string,
    readonly hostKey: string,
    private readonly packs: PackStore,
    /** Moltiplicatore di velocità (solo per test/simulazioni). */
    private readonly speed = 1
  ) {
    this.ctx = this.createContext();
  }

  get phase(): Phase {
    return this.phaseData.phase;
  }

  get channel() {
    return `room:${this.code}`;
  }

  // ---------------------------------------------------------------- timer

  private scale(ms: number) {
    return Math.round(ms / this.speed);
  }

  private dur(key: DurationKey) {
    return this.scale(CONFIG.DURATION[key]);
  }

  private later(fn: () => void, delay: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      try {
        fn();
      } catch (err) {
        console.error(`[stanza ${this.code}] errore nel timer:`, err);
      }
    }, delay);
    this.timers.add(t);
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  destroy() {
    this.clearTimers();
    for (const t of this.lobbyRemovals.values()) clearTimeout(t);
    this.lobbyRemovals.clear();
  }

  // ---------------------------------------------------------------- fasi

  private setPhase(data: Exclude<PhaseData, { phase: 'LOBBY' }> | { phase: 'LOBBY' }, durationMs: number | null, onEnd?: () => void) {
    this.clearTimers();
    this.phaseData = data;
    this.graceScheduled = false;
    this.stepEnd = onEnd ?? null;
    this.endsAt = durationMs === null ? null : Date.now() + durationMs;
    if (durationMs !== null && onEnd) this.later(() => this.runStepEnd(onEnd), durationMs);
    this.broadcast();
    this.scheduleBots();
  }

  private runStepEnd(fn: () => void) {
    if (this.stepEnd !== fn) return;
    this.stepEnd = null;
    fn();
  }

  /** Chiude il passo corrente in anticipo (una sola volta). */
  private endStep(delayMs = 0) {
    const end = this.stepEnd;
    if (!end) return;
    this.stepEnd = null;
    this.clearTimers();
    this.endsAt = Date.now() + delayMs;
    this.later(end, delayMs);
    this.broadcast();
  }

  private hasActed(p: Player): boolean {
    switch (this.phase) {
      case 'LOBBY':
        return p.ready;
      case 'CARD_PICK':
        return p.playsLeft === 0;
      case 'PLAY':
        return this.game?.hasActed(p) ?? false;
      default:
        return false;
    }
  }

  /** Se tutti i giocatori connessi hanno agito, chiude il passo dopo una breve pausa. */
  private checkAllActed() {
    if (!this.stepEnd || this.graceScheduled || (this.phase !== 'PLAY' && this.phase !== 'CARD_PICK')) return;
    const active = [...this.players.values()].filter((p) => p.connected);
    if (active.length === 0 || !active.every((p) => this.hasActed(p))) return;
    this.graceScheduled = true;
    this.endStep(this.scale(CONFIG.ALL_DONE_GRACE_MS));
  }

  private createContext(): GameContext {
    const room = this;
    return {
      players: () => [...room.players.values()],
      connected: () => [...room.players.values()].filter((p) => p.connected),
      get: (id) => room.players.get(id),
      get pool() {
        return room.pool!;
      },
      dur: (key) => room.dur(key),
      scale: (ms) => room.scale(ms),
      setStep: (state: PlayState, durationMs, onEnd) => room.setPhase({ phase: 'PLAY', game: room.gameId!, state }, durationMs, onEnd),
      patchStep: (state) => {
        if (room.phaseData.phase !== 'PLAY') return;
        room.phaseData = { ...room.phaseData, state };
        room.broadcast();
      },
      endStep: (delay) => room.endStep(delay ?? 0),
      later: (fn, ms) => room.later(fn, ms),
      addScore: (p, delta) => {
        const applied = Math.max(-p.score, Math.round(delta));
        p.score += applied;
        p.gameDelta += applied;
        return applied;
      },
      boost: (p, base) => {
        // Doppio: raddoppia, ma il bonus non supera DOUBLE_MAX_BONUS (es. niente Scommesse quadruplicate).
        if (base > 0 && p.doubleArmed) {
          p.doubleArmed = false;
          return base + Math.min(base, CONFIG.DOUBLE_MAX_BONUS);
        }
        return base;
      },
      hit: (target, type, from) => room.hit(target, type, from),
      award: (p, base) => room.ctx.addScore(p, room.ctx.boost(p, base)),
      recordAnswer: (p, correct) => {
        if (!correct) {
          p.streak = 0;
          return;
        }
        p.streak++;
        if (p.streak >= CONFIG.STREAK_FOR_CARD) {
          p.streak = 0;
          p.bonusPlays = 1;
        }
      },
      publicMc: (def, number, total, clue) => ({
        id: def.id,
        category: def.category,
        text: def.text,
        options: def.options,
        number,
        total,
        ...(def.image ? { image: def.image } : {}),
        ...(def.optionImages ? { optionImages: def.optionImages } : {}),
        ...(def.audio ? { audio: def.audio } : {}),
        ...(clue ? { clue } : {})
      }),
      present: (def, to) => {
        for (const p of to ?? room.players.values()) {
          let removed: number[] = [];
          if (p.fiftyLeft > 0 && def.options.length > 2) {
            const wrong = shuffle(def.options.map((_, i) => i).filter((i) => i !== def.correctIndex));
            removed = wrong.slice(0, def.options.length - 2).sort();
            p.fiftyLeft--;
          }
          p.cur = { questionId: def.id, incoming: p.pendingEffects, removed, hint: null };
          p.pendingEffects = [];
        }
      },
      presentNumeric: (def) => {
        for (const p of room.players.values()) {
          let hint: [number, number] | null = null;
          if (p.fiftyLeft > 0) {
            // Aiutino: un intervallo che contiene la risposta.
            const width = Math.max(Math.abs(def.answer) * 0.4, 10);
            const lo = def.answer - width * randomBetween(0.15, 0.85);
            const round = (n: number) => (Math.abs(def.answer) >= 100 ? Math.round(n / 10) * 10 : Math.round(n));
            hint = [round(lo), round(lo + width)];
            if (hint[0] > def.answer) hint[0] = Math.floor(def.answer);
            if (hint[1] < def.answer) hint[1] = Math.ceil(def.answer);
            p.fiftyLeft--;
          }
          p.cur = { questionId: def.id, incoming: p.pendingEffects, removed: [], hint };
          p.pendingEffects = [];
        }
      },
      finish: () => room.finishGame(),
      isLargeGroup: () => room.players.size >= CONFIG.LARGE_GROUP,
      gameOver: (podium) => {
        room.game = null;
        room.setPhase({ phase: 'GAME_OVER', winnerId: podium[0], podium }, null);
      },
      act: (p, a) => {
        room.gameAction(p.id, a);
      }
    };
  }

  canStart(): boolean {
    const connected = [...this.players.values()].filter((p) => p.connected);
    return this.phase === 'LOBBY' && connected.length >= CONFIG.MIN_PLAYERS && connected.every((p) => p.ready && p.characterId);
  }

  setSettings(s: Partial<LobbySettings>): ActionResult {
    if (this.phase !== 'LOBBY') return 'Puoi cambiare le impostazioni solo nella lobby';
    const isGame = (id: unknown): id is GameId => typeof id === 'string' && (GAME_IDS as string[]).includes(id);
    if (s.length && s.length in CONFIG.GAMES_PER_LENGTH) this.settings.length = s.length;
    if (Array.isArray(s.excluded)) this.settings.excluded = s.excluded.filter((id) => typeof id === 'string').slice(0, 100);
    if (s.mode === 'wheel' || s.mode === 'sequence') this.settings.mode = s.mode;
    if (Array.isArray(s.games)) {
      const games = [...new Set(s.games.filter(isGame))];
      if (games.length === 0) return 'Lascia almeno un gioco nella ruota';
      this.settings.games = games;
    }
    if (Array.isArray(s.sequence)) this.settings.sequence = s.sequence.filter(isGame).slice(0, CONFIG.MAX_SEQUENCE);
    this.broadcast();
    return null;
  }

  start(byPlayerId: string | null): ActionResult {
    if (this.phase !== 'LOBBY') return 'La partita è già in corso';
    if (byPlayerId && byPlayerId !== this.vipId()) return 'Solo il capo stanza può avviare la partita';
    if (!this.canStart()) return `Servono almeno ${CONFIG.MIN_PLAYERS} giocatori pronti`;

    const packs = this.packs.all().filter((p) => !this.settings.excluded.includes(p.id));
    const pool = new QuestionPool(packs, () => [...this.players.values()].map((p) => p.name));
    if (pool.mcCount < MIN_MC_QUESTIONS) {
      return `Domande insufficienti nei pacchetti scelti: ne servono almeno ${MIN_MC_QUESTIONS} a risposta multipla o vero/falso`;
    }

    const st = this.settings;
    if (st.mode === 'sequence') {
      if (st.sequence.length === 0) return 'La scaletta è vuota: aggiungi almeno un gioco';
      const bad = st.sequence.find((id) => !gameAvailable(id, pool));
      if (bad) return `«${GAMES[bad].name}» non ha abbastanza domande nei pacchetti scelti`;
      this.show = { total: st.sequence.length, played: [], order: [...st.sequence], wheel: [] };
    } else {
      const wheel = st.games.filter((id) => gameAvailable(id, pool));
      if (wheel.length === 0) return 'Nessuno dei giochi scelti ha abbastanza domande nei pacchetti selezionati';
      this.show = { total: CONFIG.GAMES_PER_LENGTH[st.length], played: [], order: null, wheel };
    }
    this.pool = pool;

    for (const p of [...this.players.values()]) if (!p.connected) this.removePlayer(p.id, false);
    for (const p of this.players.values()) resetForShow(p);
    this.nextGame();
    return null;
  }

  restart(byPlayerId: string | null): ActionResult {
    if (this.phase === 'LOBBY') return null;
    if (byPlayerId && (byPlayerId !== this.vipId() || this.phase !== 'GAME_OVER')) return 'Non puoi riavviare ora';
    for (const p of [...this.players.values()]) if (!p.connected) this.removePlayer(p.id, false);
    for (const p of this.players.values()) {
      p.ready = p.isBot;
      resetForShow(p);
    }
    this.game = null;
    this.gameId = null;
    this.setPhase({ phase: 'LOBBY' }, null);
    return null;
  }

  private nextGame() {
    if (this.show.played.length >= this.show.total) return this.pyramidIntro();
    // Scaletta: niente ruota, si passa direttamente al gioco successivo.
    if (this.show.order) return this.intro(this.show.order[this.show.played.length]);
    // ONLY_GAMES=wager,bomb (solo sviluppo): limita la ruota ai giochi indicati.
    const only = process.env.ONLY_GAMES?.split(',');
    const available = this.show.wheel.filter((id) => !only || only.includes(id));
    const fresh = available.filter((id) => !this.show.played.includes(id));
    const chosen = pick(fresh.length ? fresh : available);
    // Rullo della slot machine: giochi casuali, si ferma sul gioco estratto.
    const reel: GameId[] = [];
    for (let i = 0; i < REEL_LENGTH; i++) {
      const options = available.filter((id) => id !== reel[i - 1]);
      reel.push(i === REEL_STOP ? chosen : pick(options.length ? options : available));
    }
    if (reel[REEL_STOP - 1] === chosen) reel[REEL_STOP - 1] = available.find((id) => id !== chosen) ?? chosen;
    this.setPhase(
      { phase: 'WHEEL', reel, stop: REEL_STOP, chosen, gameNumber: this.show.played.length + 1, totalGames: this.show.total },
      this.dur('WHEEL'),
      () => this.intro(chosen)
    );
  }

  private intro(id: GameId) {
    this.show.played.push(id);
    this.gameId = id;
    this.game = null;
    for (const p of this.players.values()) resetForGame(p);
    this.setPhase({ phase: 'GAME_INTRO', game: id, gameNumber: this.show.played.length, totalGames: this.show.total }, this.dur('GAME_INTRO'), () =>
      this.cardPick(id)
    );
  }

  private cardPick(id: GameId) {
    if (this.players.size < 2) return this.beginGame(id);
    for (const p of this.players.values()) {
      const extra = Math.min(1, p.bonusPlays);
      // Bilanciamento: alcune carte non si pescano in certi giochi (shared/games.ts → cards.excluded).
      p.hand = dealHand(CONFIG.HAND_SIZE + extra, GAMES[id].cards.excluded);
      p.playsLeft = 1 + extra;
      p.played = [];
      p.bonusPlays = 0;
    }
    this.setPhase({ phase: 'CARD_PICK', game: id }, this.dur('CARD_PICK'), () => this.resolveCards(id));
  }

  private resolveCards(id: GameId) {
    const plays = [...this.players.values()].flatMap((p) => p.played.map((c) => ({ from: p.id, card: c.card, targetId: c.targetId })));
    if (plays.length === 0) return this.beginGame(id);
    const big = this.players.size >= CONFIG.LARGE_GROUP;
    const res = resolveCards(plays, [...this.players.keys()], big ? CONFIG.MAX_HITS_PER_TARGET : Infinity);

    for (const [pid, defense] of res.defenses) this.players.get(pid)!.defense = defense;
    for (const play of plays) {
      const p = this.players.get(play.from)!;
      if (play.card === 'DOUBLE') p.doubleArmed = true;
      if (play.card === 'FIFTY') p.fiftyLeft = GAMES[id].cards.fiftyUses;
    }
    for (const hit of res.hits) {
      const t = this.players.get(hit.to);
      if (t) this.hit(t, hit.type, hit.from);
    }
    for (const [pid, count] of res.absorbed) this.ctx.addScore(this.players.get(pid)!, CONFIG.ANTIDOTE_POINTS * count);

    const attacks = res.events.filter((e) => e.result !== 'self').length;
    const duration = Math.min(this.dur('CARD_RESOLVE_MAX'), this.dur('CARD_RESOLVE_BASE') + attacks * this.dur('CARD_RESOLVE_PER_ATTACK'));
    this.setPhase({ phase: 'CARD_RESOLVE', game: id, events: res.events }, duration, () => this.beginGame(id));
  }

  /** Un attacco va a segno: l'effetto si applica alla prossima domanda del bersaglio (e si somma). */
  hit(t: Player, type: PowerType, from: string) {
    const existing = t.pendingEffects.find((e) => e.type === type);
    if (existing) {
      existing.stack++;
      existing.from.push(from);
    } else {
      t.pendingEffects.push({ type, stack: 1, from: [from] });
    }
    t.activeEffects.add(type);
  }

  private beginGame(id: GameId) {
    this.gameId = id;
    this.game = createGame(id, this.ctx);
    this.game.start();
  }

  private finishGame() {
    const id = this.gameId as GameId;
    this.game = null;
    const deltas = Object.fromEntries([...this.players.values()].map((p) => [p.id, p.gameDelta]));
    for (const p of this.players.values()) {
      p.cur = null;
      p.activeEffects.clear();
    }
    this.setPhase(
      { phase: 'GAME_RESULT', game: id, deltas, gameNumber: this.show.played.length, totalGames: this.show.total },
      this.dur('GAME_RESULT'),
      () => this.nextGame()
    );
  }

  private pyramidIntro() {
    for (const p of this.players.values()) resetForGame(p);
    // Partenze calcolate subito: l'introduzione le mostra (con animazione) prima della prima domanda.
    const starts = startingSteps([...this.players.values()]);
    for (const p of this.players.values()) p.pyramidStep = starts.get(p.id) ?? 0;
    this.gameId = 'pyramid';
    this.setPhase({ phase: 'PYRAMID_INTRO', steps: CONFIG.PYRAMID_STEPS }, this.dur('PYRAMID_INTRO'), () => {
      this.game = new PyramidGame(this.ctx);
      this.game.start();
    });
  }

  // ---------------------------------------------------------------- connessioni

  attachHost(socketId: string) {
    this.hostSocketId = socketId;
    this.touch();
    for (const p of this.players.values()) {
      if (p.selfie) this.io.to(socketId).emit('SELFIE_UPDATE', { playerId: p.id, dataUrl: p.selfie });
    }
    this.broadcast();
  }

  join(socketId: string, rawName: string, playerId?: string): { playerId: string; reconnected: boolean } | string {
    this.touch();
    const existing = playerId ? this.players.get(playerId) : undefined;
    if (existing && !existing.isBot) {
      existing.socketId = socketId;
      existing.connected = true;
      const pending = this.lobbyRemovals.get(existing.id);
      if (pending) clearTimeout(pending);
      this.lobbyRemovals.delete(existing.id);
      this.broadcast();
      return { playerId: existing.id, reconnected: true };
    }

    if (this.phase !== 'LOBBY') return 'La partita è già iniziata';
    if (this.players.size >= CONFIG.MAX_PLAYERS) return 'La stanza è piena';
    const name = String(rawName ?? '').trim().slice(0, CONFIG.NAME_MAX_CHARS);
    if (!name) return 'Inserisci un nome';
    if ([...this.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) return 'Nome già in uso';

    const p = newPlayer(name, false);
    p.socketId = socketId;
    this.players.set(p.id, p);
    this.broadcast();
    return { playerId: p.id, reconnected: false };
  }

  disconnect(socketId: string) {
    if (this.hostSocketId === socketId) {
      this.hostSocketId = null;
      return;
    }
    const p = [...this.players.values()].find((x) => x.socketId === socketId);
    if (!p) return;
    p.socketId = null;
    p.connected = false;
    if (this.phase === 'LOBBY') {
      this.lobbyRemovals.set(
        p.id,
        setTimeout(() => {
          this.lobbyRemovals.delete(p.id);
          if (!p.connected && this.phase === 'LOBBY') this.removePlayer(p.id);
        }, LOBBY_DISCONNECT_GRACE_MS)
      );
    }
    this.broadcast();
    this.checkAllActed();
  }

  removePlayer(playerId: string, notify = true) {
    const p = this.players.get(playerId);
    if (!p) return;
    if (p.socketId) this.io.to(p.socketId).emit('KICKED');
    this.players.delete(playerId);
    if (notify) {
      this.io.to(this.channel).emit('SELFIE_UPDATE', { playerId, dataUrl: null });
      this.broadcast();
      this.checkAllActed();
    }
  }

  isAbandoned(now: number, idleMs: number): boolean {
    const humansOnline = [...this.players.values()].some((p) => !p.isBot && p.connected);
    return !this.hostSocketId && !humansOnline && now - this.lastActivity > idleMs;
  }

  private touch() {
    this.lastActivity = Date.now();
  }

  private vipId(): string | null {
    return [...this.players.values()].find((p) => !p.isBot && p.connected)?.id ?? null;
  }

  // ---------------------------------------------------------------- azioni lobby

  selectCharacter(playerId: string, characterId: string, skinId: string, custom?: unknown): ActionResult {
    const p = this.players.get(playerId);
    if (!p || this.phase !== 'LOBBY') return 'Non puoi cambiare personaggio ora';
    if (!getSkin(characterId, skinId)) return 'Personaggio non valido';
    const taken = [...this.players.values()].some((o) => o.id !== playerId && o.characterId === characterId && o.skinId === skinId);
    if (taken) return 'Questa skin è già stata scelta';
    p.characterId = characterId;
    p.skinId = skinId;
    p.custom = sanitizeCustom(characterId, custom);
    this.touch();
    this.broadcast();
    return null;
  }

  setSelfie(playerId: string, dataUrl: string | null): ActionResult {
    const p = this.players.get(playerId);
    if (!p) return 'Giocatore sconosciuto';
    if (dataUrl !== null) {
      if (typeof dataUrl !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) return 'Formato non valido';
      if (dataUrl.length > CONFIG.SELFIE_MAX_CHARS) return 'Foto troppo grande';
    }
    p.selfie = dataUrl;
    this.io.to(this.channel).emit('SELFIE_UPDATE', { playerId, dataUrl });
    this.broadcast();
    return null;
  }

  setReady(playerId: string, ready: boolean) {
    const p = this.players.get(playerId);
    if (!p || this.phase !== 'LOBBY') return;
    p.ready = ready && !!p.characterId;
    this.broadcast();
  }

  addBot(): ActionResult {
    if (this.phase !== 'LOBBY') return 'Puoi aggiungere bot solo nella lobby';
    if (this.players.size >= CONFIG.MAX_PLAYERS) return 'La stanza è piena';
    const usedNames = new Set([...this.players.values()].map((p) => p.name));
    const name = BOT_NAMES.map((n) => `Bot ${n}`).find((n) => !usedNames.has(n)) ?? `Bot ${this.players.size + 1}`;
    const bot = newPlayer(name, true);

    const usedChars = new Set([...this.players.values()].map((p) => p.characterId));
    const freeChars = CHARACTERS.filter((c) => !usedChars.has(c.id));
    const character = pick(freeChars.length ? freeChars : CHARACTERS);
    const usedCombos = new Set([...this.players.values()].map((p) => `${p.characterId}/${p.skinId}`));
    const skin = character.skins.find((s) => !usedCombos.has(`${character.id}/${s.id}`)) ?? character.skins[0];
    bot.characterId = character.id;
    bot.skinId = skin.id;

    this.players.set(bot.id, bot);
    this.broadcast();
    return null;
  }

  // ---------------------------------------------------------------- azioni di gioco

  playCard(playerId: string, card: CardType | null, targetId: string | null): ActionResult {
    const p = this.players.get(playerId);
    if (!p || this.phase !== 'CARD_PICK') return 'Non è il momento delle carte';
    if (p.playsLeft <= 0) return 'Hai già giocato';
    if (card === null) {
      p.playsLeft = 0;
    } else {
      const idx = p.hand.indexOf(card);
      if (idx < 0) return 'Non hai questa carta';
      if (isAttack(card)) {
        if (!targetId || targetId === playerId || !this.players.has(targetId)) return 'Scegli un avversario da colpire';
      } else {
        targetId = null;
      }
      p.hand.splice(idx, 1);
      p.played.push({ card, targetId });
      p.playsLeft--;
    }
    this.broadcast();
    this.checkAllActed();
    return null;
  }

  gameAction(playerId: string, a: GameAction): ActionResult {
    const p = this.players.get(playerId);
    if (!p || this.phase !== 'PLAY' || !this.game || !a || typeof a !== 'object') return 'Azione non valida ora';
    const err = this.game.action(p, a);
    if (err) return err;
    if (a.type === 'answer' || a.type === 'numeric') p.activeEffects.clear();
    this.broadcast();
    this.checkAllActed();
    return null;
  }

  clearEffect(playerId: string, type: string) {
    const p = this.players.get(playerId);
    if (!p || !p.activeEffects.delete(type as never)) return;
    this.broadcast();
  }

  // ---------------------------------------------------------------- bot

  private scheduleBots() {
    const bots = [...this.players.values()].filter((p) => p.isBot);
    if (this.phase === 'PLAY' && this.game) {
      for (const b of bots) this.game.bot(b);
    }
    if (this.phase === 'CARD_PICK') {
      for (const b of bots) {
        const playOne = () => {
          if (this.phase !== 'CARD_PICK' || b.playsLeft <= 0) return;
          if (!b.hand.length || Math.random() < 0.15) return void this.playCard(b.id, null, null);
          const card = pick(b.hand);
          const others = [...this.players.values()].filter((o) => o.id !== b.id);
          const target = isAttack(card) ? (Math.random() < 0.5 ? others.sort((x, y) => y.score - x.score)[0] : pick(others)) : null;
          this.playCard(b.id, card, target?.id ?? null);
          if (b.playsLeft > 0) this.later(playOne, this.scale(randomBetween(600, 1500)));
        };
        this.later(playOne, this.scale(randomBetween(1200, 4500)));
      }
    }
  }

  // ---------------------------------------------------------------- snapshot

  broadcast() {
    const list = [...this.players.values()];
    const ranks = computeRanks(list);
    const vip = this.vipId();
    const players: PlayerPublic[] = list.map((p) => ({
      id: p.id,
      name: p.name,
      characterId: p.characterId,
      skinId: p.skinId,
      custom: p.custom,
      hasSelfie: !!p.selfie,
      ready: p.ready,
      connected: p.connected,
      isBot: p.isBot,
      isVip: p.id === vip,
      score: p.score,
      rank: ranks.get(p.id)!,
      jokerLeft: p.jokerLeft,
      hasActed: this.hasActed(p),
      activeEffects: [...p.activeEffects],
      defense: p.defense,
      doubleArmed: p.doubleArmed,
      bonusCard: p.bonusPlays > 0,
      pyramidStep: p.pyramidStep
    }));
    const phaseData: PhaseData =
      this.phaseData.phase === 'LOBBY' ? { phase: 'LOBBY', settings: this.settings, packs: this.packs.list() } : this.phaseData;
    const base: RoomSnapshot = {
      code: this.code,
      phase: this.phase,
      phaseData,
      endsAt: this.endsAt,
      serverNow: Date.now(),
      pyramidSteps: CONFIG.PYRAMID_STEPS,
      players,
      me: null
    };

    if (this.hostSocketId) this.io.to(this.hostSocketId).emit('ROOM_STATE', base);
    for (const p of list) {
      if (!p.socketId) continue;
      const me: PrivateState = {
        playerId: p.id,
        hand: this.phase === 'CARD_PICK' ? p.hand : [],
        playsLeft: this.phase === 'CARD_PICK' ? p.playsLeft : 0,
        played: p.played,
        cur: this.phase === 'PLAY' ? p.cur : null,
        myVote: null,
        myAnswer: null,
        myNumeric: null,
        myBet: null,
        betOptions: [],
        choose: null,
        blocked: false,
        blitz: null,
        sabotage: null
      };
      if (this.phase === 'PLAY' && this.game) Object.assign(me, this.game.privateFor(p));
      this.io.to(p.socketId).emit('ROOM_STATE', { ...base, me });
    }
  }
}
