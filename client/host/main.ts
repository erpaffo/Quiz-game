import '@fontsource/baloo-2/500.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import QRCode from 'qrcode';
import { CARDS } from '../../shared/cards';
import { CONFIG } from '../../shared/config';
import { GAMES } from '../../shared/games';
import type { PowerType, RoomSnapshot } from '../../shared/types';
import '../common/base.css';
import { clock, createSocket } from '../common/net';
import './host.css';
import { sfx } from './sfx';
import { Stage } from './stage';
import { HostUI, phaseKey } from './ui';

const SESSION_KEY = 'sep:host';
const socket = createSocket();
const stage = new Stage(document.getElementById('stage')!);
const selfies = new Map<string, string>();
let last: RoomSnapshot | null = null;
let session: { code: string; hostKey: string } | null = null;
let started = false;
const join = { urls: [] as string[], index: 0 };

try {
  session = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
} catch {
  session = null;
}

const report = async (p: Promise<{ ok: boolean; error?: string } | { ok: false; error: string }>) => {
  const r = await p;
  if (!r.ok && 'error' in r) ui.toast(r.error ?? 'Errore');
};

const ui = new HostUI(
  {
    addBot: () => void report(socket.emitWithAck('ADD_BOT', {})),
    start: () => void report(socket.emitWithAck('START_GAME', {})),
    restart: () => void report(socket.emitWithAck('RESTART_GAME', {})),
    setSettings: (s) => void report(socket.emitWithAck('SET_SETTINGS', s))
  },
  (sec, phase) => {
    if (sec > 0 && sec <= 5 && ['CARD_PICK', 'PLAY'].includes(phase)) sfx.tick();
  },
  () => {
    join.index = (join.index + 1) % join.urls.length;
    void drawQr();
  }
);

// ------------------------------------------------------------ stanza e indirizzi

/** Indirizzi con cui i telefoni possono raggiungere il PC (funziona anche offline, es. hotspot). */
async function loadJoinUrls(code: string) {
  const port = location.port || '80';
  let hosts = [location.host];
  try {
    const info: { port: number; lan: { address: string }[] } = await (await fetch('/api/info')).json();
    const lan = info.lan.map((l) => `${l.address}:${location.port || info.port}`);
    hosts = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? lan : [location.host, ...lan.filter((h) => h !== location.host)];
  } catch {
    /* resta l'host corrente */
  }
  if (!hosts.length) hosts = [`${location.hostname}:${port}`];
  join.urls = hosts.map((h) => `${location.protocol}//${h}/controller.html?room=${code}`);
  join.index = 0;
  await drawQr();
}

async function drawQr() {
  const url = join.urls[join.index];
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#14063a', light: '#ffffff' } });
  ui.setJoin(join.urls, join.index, qr);
}

async function createRoom() {
  const r = await socket.emitWithAck('CREATE_ROOM', {});
  if (!r.ok) return ui.toast(r.error);
  session = { code: r.code, hostKey: r.hostKey };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  selfies.clear();
  await loadJoinUrls(r.code);
}

async function openRoom() {
  if (session) {
    const r = await socket.emitWithAck('HOST_REJOIN', session);
    if (r.ok) return loadJoinUrls(session.code);
  }
  await createRoom();
}

const splash = document.getElementById('splash')!;
const splashBtn = document.getElementById('splash-btn') as HTMLButtonElement;
if (session) splashBtn.textContent = `▶ Riprendi la stanza ${session.code}`;
else document.getElementById('new-room')!.hidden = true;
splashBtn.addEventListener('click', async () => {
  sfx.unlock();
  splash.classList.add('hidden');
  started = true;
  await openRoom();
});
document.getElementById('new-room')!.addEventListener('click', async () => {
  sfx.unlock();
  session = null;
  sessionStorage.removeItem(SESSION_KEY);
  splash.classList.add('hidden');
  started = true;
  await createRoom();
});

socket.on('connect', () => {
  // Riconnessione dopo un'interruzione di rete: riprende la stessa stanza.
  if (started) void openRoom();
});

// ------------------------------------------------------------ stato

socket.on('SELFIE_UPDATE', ({ playerId, dataUrl }) => {
  if (dataUrl) selfies.set(playerId, dataUrl);
  else selfies.delete(playerId);
  stage.setSelfie(playerId, dataUrl);
});

socket.on('ROOM_STATE', (s) => {
  clock.sync(s.serverNow);
  const prev = last;
  last = s;
  stage.sync(s.players, { phase: s.phase });
  for (const p of s.players) stage.setSelfie(p.id, selfies.get(p.id) ?? null);
  playerReactions(s, prev);
  if (!prev || phaseKey(prev) !== phaseKey(s)) onPhaseEnter(s, prev);
  ui.render(s);
});

const nameOf = (s: RoomSnapshot, id: string) => s.players.find((p) => p.id === id)?.name ?? '';

function playerReactions(s: RoomSnapshot, prev: RoomSnapshot | null) {
  if (!prev) return;
  for (const p of s.players) {
    const old = prev.players.find((o) => o.id === p.id);
    if (!old) {
      sfx.join();
      continue;
    }
    if (old.characterId !== p.characterId || old.skinId !== p.skinId) {
      stage.play(p.id, 'wave');
      sfx.pop();
    }
    if (s.phase === prev.phase && !old.hasActed && p.hasActed && s.phase !== 'LOBBY') {
      sfx.pop();
      stage.play(p.id, s.phase === 'PLAY' ? 'idle' : 'wave');
    }
    if (!old.bonusCard && p.bonusCard) stage.floatText(p.id, '🃏 +1 carta!', 'info');
    if (s.phase === 'PLAY' && prev.phase === 'PLAY') {
      for (const e of old.activeEffects) {
        if (!p.activeEffects.includes(e) && !p.hasActed) stage.floatText(p.id, `${CARDS[e].icon} superato!`, 'info');
      }
    }
  }
  // Raffica: reazioni live a ogni risposta.
  const d = s.phaseData;
  const pd = prev.phaseData;
  if (d.phase === 'PLAY' && d.state.step === 'blitz' && pd.phase === 'PLAY' && pd.state.step === 'blitz') {
    const before = new Map(pd.state.progress.map((x) => [x.playerId, x]));
    for (const now of d.state.progress) {
      const b = before.get(now.playerId);
      if (!b || now.answered === b.answered) continue;
      if (now.correct > b.correct) {
        stage.floatText(now.playerId, `+${now.points - b.points}`, 'good');
        if (now.multiplier > b.multiplier) stage.play(now.playerId, 'cheer');
      } else {
        stage.floatText(now.playerId, '✗', 'bad');
        stage.play(now.playerId, 'hit');
      }
    }
  }
}

function onPhaseEnter(s: RoomSnapshot, prev: RoomSnapshot | null) {
  const d = s.phaseData;
  const inPyramid = d.phase === 'PYRAMID_INTRO' || d.phase === 'GAME_OVER' || (d.phase === 'PLAY' && d.game === 'pyramid');
  if (inPyramid && stage.mode === 'studio') stage.enterPyramid(s.players, s.pyramidSteps, d.phase === 'PYRAMID_INTRO');
  if (!inPyramid && stage.mode === 'pyramid') stage.exitPyramid();
  if (!(d.phase === 'PLAY' && d.game === 'bomb')) stage.setBomb(null);

  switch (d.phase) {
    case 'LOBBY':
      stage.setBulbs('calm');
      stage.playAll('idle');
      break;
    case 'WHEEL':
      stage.setBulbs('chase');
      stage.playAll('idle');
      sfx.spin();
      if (d.gameNumber === 1 && prev?.phase === 'LOBBY') ui.banner('Si comincia!');
      break;
    case 'GAME_INTRO':
      stage.setBulbs('blink');
      stage.playAll('wave');
      sfx.join();
      ui.banner(`${GAMES[d.game].icon} ${GAMES[d.game].name}`, GAMES[d.game].color);
      break;
    case 'CARD_PICK':
      stage.setBulbs('calm');
      stage.playAll('think');
      break;
    case 'CARD_RESOLVE':
      stage.playAll('idle');
      void stage.playCardEvents(d.events, (e) => {
        const c = CARDS[e.card];
        const last = e.path[e.path.length - 1];
        if (e.result === 'self') {
          stage.floatText(e.from, `${c.icon} ${c.label}`, 'info');
          c.kind === 'defense' ? sfx.shield() : sfx.coin();
        } else if (e.result === 'hit') {
          sfx.hit(e.card as PowerType);
          stage.floatText(last, `${c.icon} ${c.label}!`, 'bad');
        } else if (e.result === 'absorbed') {
          sfx.coin();
          stage.floatText(last, `🧪 +${CONFIG.ANTIDOTE_POINTS}`, 'good');
        } else if (e.result === 'crowded') {
          sfx.shield();
          stage.floatText(last, '🛑 Troppi attacchi!', 'info');
        } else if (e.result === 'blocked') {
          sfx.shield();
          stage.floatText(last, `${CARDS[e.defense!].icon} Bloccato!`, 'info');
        } else {
          sfx.whoosh();
          stage.floatText(last, '👻 Mancato!', 'info');
        }
      });
      break;
    case 'PLAY':
      onStep(s, d.game, d.state);
      break;
    case 'GAME_RESULT': {
      stage.setBulbs('blink');
      stage.playAll('idle');
      for (const [id, delta] of Object.entries(d.deltas)) if (delta) stage.floatText(id, `${delta > 0 ? '+' : ''}${delta}`, delta > 0 ? 'good' : 'bad');
      const leader = s.players.find((p) => p.rank === 1);
      if (leader) stage.play(leader.id, 'cheer');
      break;
    }
    case 'PYRAMID_INTRO': {
      stage.setBulbs('chase');
      ui.banner('🔺 FINALE!', '#ffd60a');
      sfx.fanfare();
      // Dopo il volo della camera, ognuno sale al proprio gradino di partenza (più punti = più in alto).
      const climbs = s.players.filter((p) => p.pyramidStep > 0).map((p) => ({ playerId: p.id, from: 0, to: p.pyramidStep }));
      setTimeout(() => {
        stage.movePyramid(climbs, (m) => stage.floatText(m.playerId, `Gradino ${m.to}`, 'good'));
        if (climbs.length) sfx.whoosh2();
        for (const p of s.players) if (p.pyramidStep === 0) stage.floatText(p.id, 'Da terra!', 'info');
      }, 2600);
      break;
    }
    case 'GAME_OVER':
      stage.setBulbs('blink');
      for (const p of s.players) stage.play(p.id, p.id === d.winnerId ? 'dance' : 'idle');
      ui.confetti();
      sfx.fanfare();
      break;
  }
}

function onStep(s: RoomSnapshot, game: string, st: Extract<RoomSnapshot['phaseData'], { phase: 'PLAY' }>['state']) {
  switch (st.step) {
    case 'vote':
      stage.setBulbs('chase');
      stage.playAll('idle');
      break;
    case 'voteResult':
      sfx.reveal();
      if (st.jokerBy) {
        ui.banner(`🃏 JOKER di ${nameOf(s, st.jokerBy)}!`, '#ff4d6d');
        stage.play(st.jokerBy, 'cheer');
      }
      break;
    case 'question':
      stage.setBulbs('calm');
      sfx.whoosh2();
      stage.playAll('think');
      if (game === 'bomb' && st.holder) stage.setBomb(st.holder, st.fuse ?? 0);
      break;
    case 'reveal': {
      sfx.reveal();
      setTimeout(() => {
        let anyCorrect = false;
        for (const r of st.results) {
          anyCorrect ||= r.correct;
          stage.play(r.playerId, r.correct ? 'cheer' : 'sad');
          if (game === 'pyramid') stage.floatText(r.playerId, r.correct ? '✓' : '✗', r.correct ? 'good' : 'bad');
          else if (r.points) stage.floatText(r.playerId, `${r.points > 0 ? '+' : ''}${r.points}`, r.points > 0 ? 'good' : 'bad');
          else if (!r.correct) stage.floatText(r.playerId, r.optionIndex === null ? '⏰' : '✗', 'bad');
        }
        anyCorrect ? sfx.correct() : sfx.wrong();
      }, 600);
      if (st.moves?.length) {
        const moves = st.moves;
        setTimeout(() => stage.movePyramid(moves, (m) => stage.floatText(m.playerId, `▲ ${m.to - m.from}`, 'good')), 1400);
      }
      if (game === 'fastest' && st.winner) ui.banner(`⚡ ${nameOf(s, st.winner)}!`, '#f77f00');
      break;
    }
    case 'steal':
      sfx.reveal();
      for (const t of st.thieves) stage.play(t.playerId, 'cheer');
      break;
    case 'transfers':
      st.transfers.forEach((t, i) =>
        setTimeout(() => {
          stage.coins(t.from, t.to);
          sfx.coin();
          stage.floatText(t.to, `+${t.amount}`, 'good');
          stage.floatText(t.from, `-${t.amount}`, 'bad');
        }, i * 500)
      );
      break;
    case 'bet':
      stage.setBulbs('blink');
      stage.playAll('think');
      break;
    case 'pass':
      stage.play(st.holder, 'cheer');
      sfx.correct();
      break;
    case 'boom':
      stage.explodeBomb();
      sfx.boom();
      ui.banner('💥 BOOM!', '#e63946');
      stage.floatText(st.holder, `-${st.penalty}`, 'bad');
      break;
    case 'numeric':
      stage.setBulbs('calm');
      sfx.whoosh2();
      stage.playAll('think');
      break;
    case 'numericReveal':
      sfx.reveal();
      setTimeout(() => {
        for (const g of st.guesses) {
          stage.play(g.playerId, g.rank === 1 ? 'cheer' : g.points ? 'idle' : 'sad');
          if (g.points) stage.floatText(g.playerId, `+${g.points}`, 'good');
        }
        sfx.correct();
      }, 600);
      break;
    case 'blitz':
      stage.setBulbs('chase');
      stage.playAll('think');
      ui.banner('🔥 VIA!', '#ff4d6d');
      break;
    case 'blitzEnd': {
      const best = st.progress.slice().sort((a, b) => b.points - a.points)[0];
      stage.playAll('idle');
      if (best) stage.play(best.playerId, 'cheer');
      sfx.fanfare();
      break;
    }
  }
}
