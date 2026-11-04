// Simula una serata completa contro un server già avviato (nessun browser: carico minimo).
//   USER_PACKS_DIR=$TMP/sim-packs GAME_SPEED=10 npm run dev   (in un terminale; la domanda di prova non sporca user-packs/)
//   npm run simulate              (in un altro; LENGTH=short|normal|long)
// Un "host" crea la stanza e aggiunge 3 bot, un giocatore scriptato gioca tutte le fasi.

import { io, type Socket } from 'socket.io-client';
import { CARDS } from '../shared/cards';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/events';
import type { GameId, GameLength, RoomSnapshot } from '../shared/types';

type S = Socket<ServerToClientEvents, ClientToServerEvents>;
const URL = process.env.URL ?? 'http://localhost:3000';
const LENGTH = (process.env.LENGTH ?? 'long') as GameLength;

function connect(): Promise<S> {
  return new Promise((res, rej) => {
    const s: S = io(URL, { transports: ['websocket'] });
    s.once('connect', () => res(s));
    s.once('connect_error', rej);
  });
}

function must<T extends { ok: boolean }>(label: string, r: T): T {
  if (!r.ok) throw new Error(`${label}: ${(r as unknown as { error: string }).error}`);
  return r;
}

const errors: string[] = [];
const soft = async (label: string, p: Promise<{ ok: boolean; error?: string } | { ok: false; error: string }>) => {
  const r = await p;
  if (!r.ok) errors.push(`${label}: ${'error' in r ? r.error : '?'}`);
};

const host = await connect();
const created = must('CREATE_ROOM', await host.emitWithAck('CREATE_ROOM', {}));
const code = (created as { code: string }).code;
const SEQUENCE = process.env.SEQUENCE?.split(',') as GameId[] | undefined;
must('SET_SETTINGS', await host.emitWithAck('SET_SETTINGS', SEQUENCE ? { mode: 'sequence', sequence: SEQUENCE } : { length: LENGTH }));
const BOTS = Number(process.env.BOTS ?? 3);
for (let i = 0; i < BOTS; i++) must('ADD_BOT', await host.emitWithAck('ADD_BOT', {}));
console.log(`Stanza ${code}, durata ${LENGTH}`);

const me = await connect();
const seen = new Set<string>();
const done = new Set<string>();
const counts: Record<string, number> = {};
let last: RoomSnapshot | null = null;
let images = 0;

function log(s: RoomSnapshot) {
  const d = s.phaseData;
  let key: string = s.phase;
  let line = '';
  switch (d.phase) {
    case 'WHEEL':
      key += d.gameNumber;
      line = `🎡 gioco ${d.gameNumber}/${d.totalGames}: ${d.chosen}`;
      break;
    case 'GAME_INTRO':
      key += d.gameNumber;
      line = `▶ gioco ${d.gameNumber}/${d.totalGames}: ${d.game}`;
      break;
    case 'PYRAMID_INTRO':
      line = `🔺 partenze: ${s.players.map((p) => `${p.name}=${p.pyramidStep}`).join(' ')}`;
      break;
    case 'CARD_RESOLVE':
      key += d.game;
      line = `   🃏 ${d.events.map((e) => `${CARDS[e.card].icon}${e.result}`).join(' ') || 'nessuna carta'}`;
      break;
    case 'PLAY': {
      const st = d.state;
      const q = 'question' in st ? st.question.id : '';
      key += `${d.game}|${st.step}|${q}`;
      counts[`${d.game}:${st.step}`] = (counts[`${d.game}:${st.step}`] ?? 0) + 1;
      if (st.step === 'boom') line = `   💥 BOOM! -${st.penalty}`;
      if (st.step === 'sabotageResult') line = `   🔻 sabotaggio: ${st.events.map((e) => `${CARDS[e.card].icon}${e.result}`).join(' ') || 'nessuno'}`;
      if (st.step === 'question' && st.question.audio) line = `   🎵 ${st.question.audio}`;
      if (st.step === 'transfers') line = `   🦝 ${st.transfers.map((t) => t.amount).join(', ')}`;
      if (st.step === 'numericReveal') line = `   📏 risposta ${st.answer}: ${st.guesses.map((g) => `${g.value}→${g.points}`).join(' ')}`;
      if (st.step === 'blitzEnd') line = `   🔥 ${st.progress.map((p) => `${p.correct}/${p.answered} x${p.multiplier} ${p.points}`).join(' | ')}`;
      if (st.step === 'reveal' && st.moves?.length) line = `   🔺 ${st.moves.map((m) => `${m.from}→${m.to}`).join(' ')}`;
      if (st.step === 'reveal' && st.podium && st.podium.length > 1) line = `   ⚡ podio: ${st.podium.length} premiati`;
      if ('question' in st && (st.question.image || ('optionImages' in st.question && st.question.optionImages))) images++;
      break;
    }
    case 'GAME_RESULT':
      key += d.gameNumber;
      line = `   = ${Object.values(d.deltas).join(' / ')}`;
      break;
    case 'GAME_OVER':
      line = `🏆 ${s.players.find((p) => p.id === d.winnerId)?.name}`;
      break;
  }
  if (!seen.has(key)) {
    if (process.env.DEBUG) console.log(`  · ${key} t+${s.endsAt ? s.endsAt - s.serverNow : "-"}ms`);
    seen.add(key);
    if (line) console.log(line);
  }
}

me.on('ROOM_STATE', async (s) => {
  last = s;
  log(s);
  const m = s.me!;
  const d = s.phaseData;
  const others = s.players.filter((p) => p.id !== m.playerId);

  if (d.phase === 'LOBBY') {
    if (!done.has('lobby') && s.players.find((p) => p.id === m.playerId)) {
      done.add('lobby');
      await soft('ADD_QUESTION', me.emitWithAck('ADD_QUESTION', { type: 'multiple', categoryName: 'Test simulazione', text: 'Chi vince sempre a {giocatore}?', options: ['Io', 'Tu'], correctIndex: 0 }));
      must('SELECT', await me.emitWithAck('SELECT_CHARACTER', { characterId: 'robot', skinId: 'glitch', custom: { 'color-body': 'c2', hacker: 'x' } }));
      me.emit('PLAYER_READY', { ready: true });
      setTimeout(async () => must('START', await me.emitWithAck('START_GAME', {})), 300);
    }
    return;
  }

  if (d.phase === 'CARD_PICK' && m.playsLeft > 0) {
    const card = m.hand[0];
    const k = `card|${d.game}|${m.hand.join()}`;
    if (done.has(k)) return;
    done.add(k);
    await soft('PLAY_CARD', me.emitWithAck('PLAY_CARD', { card, targetId: CARDS[card].kind === 'attack' ? others[0].id : null }));
    return;
  }

  if (d.phase !== 'PLAY') return;
  const st = d.state;
  if (st.step === 'sabotage' && m.sabotage && m.sabotage.left > 0) {
    // Il tester in fondo alla piramide sabota il primo in classifica.
    const ks = `sab|${s.endsAt}|${m.sabotage.left}`;
    if (done.has(ks)) return;
    done.add(ks);
    const leader = others.slice().sort((a, b) => b.pyramidStep - a.pyramidStep)[0];
    await soft('SABOTAGE', me.emitWithAck('GAME_ACTION', { type: 'sabotage', card: m.sabotage.left > 1 ? 'GOO' : 'ICE', targetId: leader.id }));
    return;
  }
  const k = `${d.game}|${st.step}|${'question' in st ? st.question.id : ''}|${m.blitz?.question.id ?? ''}`;
  if (done.has(k)) return;

  if (st.step === 'vote' && !m.myVote) {
    done.add(k);
    await soft('VOTE', me.emitWithAck('GAME_ACTION', { type: 'vote', categoryId: st.categories[0].id, useJoker: true }));
  } else if (st.step === 'question' && m.myAnswer === null && !m.blocked) {
    done.add(k);
    for (const e of m.cur?.incoming ?? []) me.emit('CLEAR_EFFECT', { type: e.type });
    const allowed = st.question.options.map((_, i) => i).filter((i) => !m.cur?.removed.includes(i));
    await soft('ANSWER', me.emitWithAck('GAME_ACTION', { type: 'answer', questionId: st.question.id, optionIndex: allowed[Math.floor(Math.random() * allowed.length)] }));
  } else if (st.step === 'numeric' && m.myNumeric === null) {
    done.add(k);
    await soft('NUMERIC', me.emitWithAck('GAME_ACTION', { type: 'numeric', questionId: st.question.id, value: m.cur?.hint ? m.cur.hint[0] : 100 }));
  } else if (st.step === 'bet' && m.myBet === null && m.betOptions.length) {
    done.add(k);
    await soft('BET', me.emitWithAck('GAME_ACTION', { type: 'bet', index: m.betOptions.length - 1 }));
  } else if (m.choose && !m.choose.done && (st.step === 'pass' || st.step === 'steal')) {
    done.add(k);
    await soft('TARGET', me.emitWithAck('GAME_ACTION', { type: 'target', targetId: others[0].id }));
  } else if (st.step === 'blitz' && m.blitz) {
    done.add(k);
    setTimeout(() => void soft('BLITZ', me.emitWithAck('GAME_ACTION', { type: 'answer', questionId: m.blitz!.question.id, optionIndex: 0 })), 150);
  } else if (d.phase === 'PLAY' && st.step === 'boom') {
    done.add(k);
  }
  if (s.phase === 'GAME_OVER') return;
});

me.on('ROOM_STATE', (s) => {
  if (s.phaseData.phase !== 'GAME_OVER') return;
  console.log('\nClassifica finale:');
  for (const id of s.phaseData.podium) {
    const p = s.players.find((x) => x.id === id)!;
    console.log(`  ${p.name.padEnd(10)} gradino ${p.pyramidStep}  punti ${p.score}`);
  }
  console.log('\nPassi visti:', Object.keys(counts).sort().join(', '));
  console.log(errors.length ? `\nAzioni rifiutate (${errors.length}):\n  ${[...new Set(errors)].join('\n  ')}` : '\nNessuna azione rifiutata.');
  process.exit(0);
});

must('JOIN_ROOM', await me.emitWithAck('JOIN_ROOM', { code, name: 'Tester' }));

setTimeout(() => {
  console.error('Timeout: la partita non è terminata. Ultima fase:', last?.phase, last?.phaseData.phase === 'PLAY' ? last.phaseData.state.step : '');
  process.exit(1);
}, 300_000);
