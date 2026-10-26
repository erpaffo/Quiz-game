// App «Party Tascabile» (client/pass): regole degli 8 giochi, catalogo, memoria del telefono, contenuti.
// Sono test senza browser: la logica dei giochi è separata dalla grafica apposta.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPassGameId, PASS_GAME_IDS, PASS_GAMES, passStartProblem, sanitizePassOptions } from '../client/pass/catalog';
import { BOMBA_CATEGORIES, BOMBA_SYLLABLES } from '../client/pass/data/bomba';
import { DUELLO_FACTS, STROOP_COLORS } from '../client/pass/data/duello';
import { FRONTE_CARDS } from '../client/pass/data/fronte';
import { CHAMELEON_PAIRS, IMPOSTORE_CATEGORIES } from '../client/pass/data/impostore';
import { ONDA_SPECTRA } from '../client/pass/data/onda';
import { PANICO_PROMPTS } from '../client/pass/data/panico';
import { CATENA_PHRASES, TRIBUNALE_QUESTIONS } from '../client/pass/data/social';
import { BombaGame, fuseRange, makeTrigger, tickInterval } from '../client/pass/logic/bomba';
import { CatenaChain, chainKind, type ChainStep } from '../client/pass/logic/catena';
import { DuelloLadder, DuelloMatch, makePrompt, type DuelPrompt } from '../client/pass/logic/duello';
import { FronteTurn, fronteDeck, frontePlan } from '../client/pass/logic/fronte';
import { dealImpostore, impostorCount, impostorePoints, isCaught, outcomeOf } from '../client/pass/logic/impostore';
import { betWins, ondaPlan, ondaScore, ondaTarget } from '../client/pass/logic/onda';
import { PanicoGame } from '../client/pass/logic/panico';
import { tribunaleJudges, tribunalePoints } from '../client/pass/logic/tribunale';
import { Deck, seeded, shuffle } from '../client/pass/rng';
import { MAX_PLAYERS, MemoryStore, PassStore } from '../client/pass/store';
import type { Player } from '../client/pass/types';

const players = (n: number): Player[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `G${i}`, color: '#fff' }));
const unique = <T>(list: T[]) => new Set(list).size === list.length;

describe('Catalogo degli 8 giochi', () => {
  it('8 giochi completi e coerenti', () => {
    assert.deepEqual(PASS_GAME_IDS.sort(), ['bomba', 'catena', 'duello', 'fronte', 'impostore', 'onda', 'panico', 'tribunale']);
    for (const id of PASS_GAME_IDS) {
      const g = PASS_GAMES[id];
      assert.equal(g.id, id);
      assert.equal(g.rules.length, 3, id);
      assert.ok(g.minPlayers >= 2 && g.minPlayers <= g.maxPlayers && g.maxPlayers <= MAX_PLAYERS, id);
      assert.ok(g.options.length >= 1, id);
      for (const o of g.options) {
        assert.ok(o.choices.some((c) => c.id === o.default), `${id}/${o.id}`);
        assert.ok(unique(o.choices.map((c) => c.id)), `${id}/${o.id}`);
      }
    }
    assert.ok(isPassGameId('bomba') && !isPassGameId('quiz') && !isPassGameId(42));
  });

  it('opzioni: valori sbagliati sostituiti dal predefinito; controllo del numero di giocatori', () => {
    assert.deepEqual(sanitizePassOptions('bomba', { lives: '5', trigger: 'hack', extra: 'x' }), { lives: '5', trigger: 'mix', fuse: 'normale' });
    assert.deepEqual(sanitizePassOptions('duello', null), { target: '5', speed: 'normal' });
    assert.match(passStartProblem('impostore', 2), /almeno 3/);
    assert.match(passStartProblem('catena', 13), /massimo in 12/);
    assert.equal(passStartProblem('fronte', 2), '');
  });
});

describe('Memoria del telefono (PassStore)', () => {
  it('aggiunge giocatori con controlli su nome, doppioni e limite', () => {
    const s = new PassStore(new MemoryStore());
    assert.equal(s.addPlayer('   '), 'Scrivi un nome');
    assert.equal(s.addPlayer('  Paffo   il  Re  '), null);
    assert.equal(s.players()[0].name, 'Paffo il Re', 'spazi ripuliti');
    assert.match(s.addPlayer('paffo IL re') ?? '', /già al tavolo/);
    assert.equal(s.addPlayer('Unnomelunghissimoesagerato'), null);
    assert.equal(s.players()[1].name.length, 14);
    for (let i = 0; i < 20; i++) s.addPlayer(`Amico ${i}`);
    assert.equal(s.players().length, MAX_PLAYERS);
    assert.match(s.addPlayer('Altro') ?? '', /massimo/);
    assert.ok(unique(s.players().map((p) => p.color)), 'colori tutti diversi');
    assert.ok(unique(s.players().map((p) => p.id)));
  });

  it('togli, sposta, mescola; i nomi usati restano come suggerimenti', () => {
    const s = new PassStore(new MemoryStore());
    for (const n of ['Sandro', 'Samuele', 'Valerio']) s.addPlayer(n);
    const [a, b] = s.players();
    s.movePlayer(b.id, -1);
    assert.deepEqual(s.players().map((p) => p.name), ['Samuele', 'Sandro', 'Valerio']);
    s.movePlayer(b.id, -1); // già primo: niente
    s.removePlayer(a.id);
    assert.deepEqual(s.players().map((p) => p.name), ['Samuele', 'Valerio']);
    assert.ok(s.history().includes('Sandro'));
    s.addPlayer('Pacio');
    s.shufflePlayers(seeded(3));
    assert.equal(s.players().length, 3);
  });

  it('Coppa del Tavolo: punti sommati, mai negativi, classifica e azzeramento', () => {
    const s = new PassStore(new MemoryStore());
    s.addPlayer('A');
    s.addPlayer('B');
    const [a, b] = s.players();
    s.addPoints(a.id, 3);
    s.addPoints(b.id, 5);
    s.addPoints(a.id, -10);
    s.addPoints(b.id, NaN);
    assert.deepEqual(s.standings().map((r) => [r.player.name, r.points]), [['B', 5], ['A', 0]]);
    s.removePlayer(b.id);
    assert.equal(s.standings().length, 1, 'chi lascia il tavolo sparisce dalla classifica');
    s.resetScores();
    assert.equal(s.standings()[0].points, 0);
  });

  it('regole scelte salvate per gioco e ripulite; dati rovinati non bloccano l’app', () => {
    const kv = new MemoryStore();
    const s = new PassStore(kv);
    s.setOption('fronte', 'time', '90');
    s.setOption('fronte', 'time', 'mille');
    assert.equal(s.options('fronte').time, '60');
    s.setOption('fronte', 'mode', 'tabu');
    assert.equal(s.options('fronte').mode, 'tabu');
    kv.setItem('sep:pass:players', '{rotto');
    kv.setItem('sep:pass:scores', 'null');
    assert.deepEqual(s.players(), []);
    assert.deepEqual(s.scores(), {});
  });
});

describe('Contenuti (offline, dentro l’app)', () => {
  it('Parola in Fronte: 4 parole vietate diverse dalla parola, nessun doppione, mazzi pieni', () => {
    assert.ok(unique(FRONTE_CARDS.map((c) => c.word.toLowerCase())));
    for (const c of FRONTE_CARDS) {
      assert.equal(c.taboo.filter(Boolean).length, 4, c.word);
      assert.ok(!c.taboo.some((t) => t.toLowerCase() === c.word.toLowerCase()), c.word);
    }
    for (const pack of ['pop', 'casa', 'natura', 'difficile']) assert.ok(FRONTE_CARDS.filter((c) => c.pack === pack).length >= 25, pack);
  });

  it('Impostore: ogni categoria ha almeno 8 parole diverse; le coppie del camaleonte sono diverse', () => {
    for (const c of IMPOSTORE_CATEGORIES) assert.ok(c.words.length >= 8 && unique(c.words), c.name);
    for (const p of CHAMELEON_PAIRS) assert.notEqual(p.words[0], p.words[1]);
  });

  it('liste senza doppioni e abbastanza lunghe', () => {
    const lists: [string, string[], number][] = [
      ['sillabe', BOMBA_SYLLABLES, 30],
      ['categorie bomba', BOMBA_CATEGORIES, 30],
      ['panico', PANICO_PROMPTS, 50],
      ['onda', ONDA_SPECTRA.map((s) => s.left + s.right), 40],
      ['tribunale', TRIBUNALE_QUESTIONS, 40],
      ['catena', CATENA_PHRASES, 30],
      ['fatti duello', DUELLO_FACTS.map((f) => f.text), 30]
    ];
    for (const [name, list, min] of lists) {
      assert.ok(list.length >= min, `${name}: ${list.length}`);
      assert.ok(unique(list), name);
    }
    assert.ok(DUELLO_FACTS.some((f) => f.truth) && DUELLO_FACTS.some((f) => !f.truth));
  });
});

describe('Casualità e mazzi', () => {
  it('stesso seme = stessa sequenza; il mazzo non ripete finché non finisce', () => {
    assert.deepEqual(shuffle(seeded(7), [1, 2, 3, 4, 5]), shuffle(seeded(7), [1, 2, 3, 4, 5]));
    const deck = new Deck([1, 2, 3, 4, 5], seeded(1));
    const first = Array.from({ length: 5 }, () => deck.draw());
    assert.deepEqual([...first].sort(), [1, 2, 3, 4, 5]);
    for (let i = 0; i < 50; i++) {
      const prev = deck.draw();
      assert.notEqual(deck.draw(), prev === undefined ? -1 : Number.NaN); // pesca sempre qualcosa
    }
    const d2 = new Deck(['a', 'b'], seeded(9));
    let last = d2.draw();
    for (let i = 0; i < 40; i++) {
      const x = d2.draw();
      assert.notEqual(x, last, 'mai la stessa carta due volte di fila');
      last = x;
    }
    assert.throws(() => new Deck([], seeded(1)));
  });
});

describe('🎭 Parola in Fronte', () => {
  it('indovinate, passate, tabù, correzioni e punteggio mai negativo', () => {
    const turn = new FronteTurn(fronteDeck('mix', seeded(1)));
    const w1 = turn.current.word;
    turn.answer(true);
    assert.notEqual(turn.current.word, w1);
    turn.answer(false);
    turn.taboo();
    turn.taboo();
    assert.equal(turn.correct, 1);
    assert.equal(turn.tabooHits, 2);
    assert.equal(turn.score, 0);
    turn.toggle(1); // passata → indovinata
    turn.toggle(2); // tabù: non si corregge
    assert.equal(turn.correct, 2);
    assert.equal(turn.results[2].taboo, true);
    assert.equal(frontePlan(players(3), 2).length, 6);
    assert.ok(fronteDeck('difficile', seeded(2)).draw().pack === 'difficile');
  });
});

describe('💣 Bomba Verbale', () => {
  it('passa saltando gli eliminati; BOOM toglie vite; contestazione; classifica', () => {
    const g = new BombaGame(players(3), { lives: 1, trigger: 'mix', fuse: 'normale' }, seeded(5));
    g.holder = 0;
    g.startRound();
    const [min, max] = fuseRange('normale');
    assert.ok(g.fuse >= min && g.fuse <= max);
    g.pass();
    assert.equal(g.holder, 1);
    g.contest();
    assert.equal(g.advance(999_999), false, 'in pausa la miccia non brucia');
    g.resolveContest(false);
    assert.equal(g.holder, 0, 'parola non valida: bomba torna indietro');
    assert.equal(g.advance(g.fuse), true);
    assert.equal(g.explode().id, 'p0');
    assert.deepEqual(g.out, ['p0']);
    assert.equal(g.holder, 1, 'il prossimo round parte dal primo vivo');
    g.startRound();
    g.pass();
    assert.equal(g.holder, 2);
    g.pass();
    assert.equal(g.holder, 1, 'salta p0 eliminato');
    g.explode();
    assert.ok(g.over);
    assert.deepEqual(g.ranking().map((p) => p.id), ['p2', 'p1', 'p0']);
  });

  it('con più vite si resta in gioco; ticchettio sempre più veloce; inneschi dei 3 tipi', () => {
    const g = new BombaGame(players(2), { lives: 3, trigger: 'sillabe', fuse: 'corta' }, seeded(2));
    g.startRound();
    g.explode();
    assert.equal(g.alive.length, 2);
    assert.equal(g.trigger.kind, 'sillaba');
    let prev = Infinity;
    for (let e = 0; e <= 1; e += 0.1) {
      const iv = tickInterval(e * 10_000, 10_000);
      assert.ok(iv <= prev && iv >= 100);
      prev = iv;
    }
    const kinds = new Set(Array.from({ length: 60 }, (_, i) => makeTrigger('mix', seeded(i)).kind));
    assert.deepEqual([...kinds].sort(), ['categoria', 'catena', 'sillaba']);
    assert.deepEqual(fuseRange('lunga'), [25_000, 60_000]);
  });
});

describe('🕵️ L’Impostore Tascabile', () => {
  it('classico: un impostore senza parola, non inizia lui, 8 parole per l’ultima possibilità', () => {
    for (let seed = 0; seed < 30; seed++) {
      const d = dealImpostore(players(5), { mode: 'classico', impostors: 2 }, seeded(seed));
      assert.equal(d.impostorIds.length, 1, '2 impostori solo da 6 giocatori');
      const imp = d.cards.find((c) => c.role === 'impostor')!;
      assert.equal(imp.word, null);
      assert.ok(d.cards.filter((c) => c.role === 'citizen').every((c) => c.word === d.secret));
      assert.ok(!d.impostorIds.includes(d.starterId));
      assert.equal(d.guessOptions.length, 8);
      assert.ok(d.guessOptions.includes(d.secret) && unique(d.guessOptions));
    }
    assert.equal(impostorCount(2, 6), 2);
    assert.throws(() => dealImpostore(players(2), { mode: 'classico', impostors: 1 }, seeded(1)));
  });

  it('camaleonte: ha la parola gemella (diversa), stessa categoria', () => {
    const d = dealImpostore(players(6), { mode: 'camaleonte', impostors: 2 }, seeded(4));
    assert.equal(d.impostorIds.length, 2);
    for (const c of d.cards) {
      assert.equal(c.category, d.category);
      if (c.role === 'impostor') assert.ok(c.word && c.word !== d.secret);
      else assert.equal(c.word, d.secret);
    }
  });

  it('voto, ultima possibilità e punti', () => {
    const d = dealImpostore(players(4), { mode: 'classico', impostors: 1 }, seeded(8));
    const imp = d.impostorIds[0];
    const citizen = d.cards.find((c) => c.role === 'citizen')!.playerId;
    assert.equal(isCaught(d, imp), true);
    assert.equal(outcomeOf(d, citizen, null), 'impostors', 'accusato un innocente');
    assert.equal(outcomeOf(d, imp, d.secret), 'impostors', 'preso ma indovina la parola');
    assert.equal(outcomeOf(d, imp, d.guessOptions.find((w) => w !== d.secret)!), 'citizens');
    const pts = impostorePoints(d, 'citizens');
    assert.equal(Object.keys(pts).length, 3);
    assert.ok(Object.values(pts).every((n) => n === 2));
    assert.deepEqual(impostorePoints(d, 'impostors'), { [imp]: 3 });
    const cham = dealImpostore(players(4), { mode: 'camaleonte', impostors: 1 }, seeded(9));
    assert.equal(outcomeOf(cham, cham.impostorIds[0], cham.secret), 'citizens', 'il camaleonte non ha ultima possibilità');
  });
});

describe('⏱️ 5 Secondi di Panico', () => {
  it('turni, lettore, rimbalzo della stessa sfida e punto di consolazione', () => {
    const g = new PanicoGame(players(3), 2, seeded(1));
    assert.equal(g.totalTurns, 6);
    assert.ok(g.nextTurn());
    assert.equal(g.examineePlayer.id, 'p0');
    assert.equal(g.readerPlayer.id, 'p1');
    const prompt = g.prompt;
    assert.deepEqual(g.fail(), { kind: 'bounce', playerId: 'p1' });
    assert.equal(g.prompt, prompt, 'stessa sfida');
    assert.equal(g.readerPlayer.id, 'p2');
    assert.deepEqual(g.fail(), { kind: 'bounce', playerId: 'p2' });
    assert.deepEqual(g.fail(), { kind: 'consolation', playerId: 'p0' });
    assert.ok(g.nextTurn());
    assert.deepEqual(g.success(), { kind: 'point', playerId: 'p1' });
    let n = 2;
    while (g.nextTurn()) n++;
    assert.equal(n, 6);
    assert.ok(g.done);
  });
});

describe('📡 Lunghezza d’Onda', () => {
  it('fasce di punteggio, scommessa, bersaglio mai sui bordi', () => {
    assert.equal(ondaScore(50, 54), 4);
    assert.equal(ondaScore(50, 60), 3);
    assert.equal(ondaScore(50, 34), 2);
    assert.equal(ondaScore(50, 70), 0);
    assert.equal(betWins(40, 70, 'right'), true);
    assert.equal(betWins(40, 70, 'left'), false);
    assert.equal(betWins(40, 42, 'right'), false, 'centro perfetto: scommessa persa');
    for (let i = 0; i < 200; i++) {
      const t = ondaTarget(seeded(i));
      assert.ok(t >= 6 && t <= 94);
    }
    assert.equal(ondaPlan(players(4), 2).length, 8);
  });
});

describe('🎙️ Il Tribunale degli Amici', () => {
  it('giudici a rotazione; +2 al giudice che indovina; plebiscito +1 a tutti', () => {
    const ps = players(3);
    assert.deepEqual(tribunaleJudges(ps, 5).map((p) => p.id), ['p0', 'p1', 'p2', 'p0', 'p1']);
    assert.deepEqual(tribunalePoints(ps, 'p0', 'p1', ['p1'], false), { p0: 2 });
    assert.deepEqual(tribunalePoints(ps, 'p0', 'p2', ['p1'], true), { p0: 1, p1: 1, p2: 1 });
    assert.deepEqual(tribunalePoints(ps, 'p0', 'p1', ['p1', 'p2'], true), { p0: 2 }, 'plebiscito solo con una persona');
  });
});

describe('🎨 Catena Scarabocchiata', () => {
  it('frase → disegno → titolo…; ognuno vede solo il passo precedente', () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(chainKind), ['phrase', 'draw', 'guess', 'draw', 'guess']);
    const c = new CatenaChain(players(4));
    assert.equal(c.visible, null);
    c.add('Un gatto astronauta');
    assert.equal(c.currentKind, 'draw');
    assert.equal(c.currentPlayer.id, 'p1');
    assert.equal(c.lastText(), 'Un gatto astronauta');
    c.add('data:image/jpeg;base64,AAA');
    assert.equal((c.visible as ChainStep | null)?.kind, 'draw');
    c.add('   ');
    assert.equal(c.lastText(), 'Un gatto astronauta', 'titolo vuoto: si usa l’ultimo testo valido');
    c.add('data:image/jpeg;base64,BBB');
    assert.ok(c.complete);
    assert.throws(() => c.add('altro'));
    assert.deepEqual(c.candidates('draw'), ['p1', 'p3']);
    assert.deepEqual(c.candidates('guess'), ['p2']);
    assert.throws(() => new CatenaChain(players(2)));
  });
});

describe('⚡ Duello al Tavolo', () => {
  const check = (p: DuelPrompt) => {
    if (p.kind === 'count') return p.blue > p.red;
    if (p.kind === 'stroop') return STROOP_COLORS.find((c) => c.name === p.word)!.hex === p.ink;
    if (p.kind === 'math') {
      const m = /^(\d+) ([×+]) (\d+) = (\d+)$/.exec(p.text)!;
      const v = m[2] === '×' ? Number(m[1]) * Number(m[3]) : Number(m[1]) + Number(m[3]);
      return v === Number(m[4]);
    }
    return DUELLO_FACTS.find((f) => f.text === p.text)!.truth;
  };

  it('ogni frase generata è davvero vera o falsa come dichiara (500 frasi)', () => {
    const rng = seeded(11);
    const kinds = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const p = makePrompt(rng);
      kinds.add(p.kind);
      assert.equal(check(p), p.truth, JSON.stringify(p));
      if (p.kind === 'count') assert.notEqual(p.blue, p.red);
    }
    assert.equal(kinds.size, 4);
  });

  it('punto al primo sul vero, −1 una volta sola sul falso, vittoria al bersaglio', () => {
    const m = new DuelloMatch([players(2)[0], players(2)[1]], 2);
    m.next({ kind: 'fact', truth: true, question: '', text: '' });
    assert.equal(m.tap(1), 'point');
    assert.equal(m.tap(0), 'ignored', 'il punto è già stato preso');
    assert.ok(m.resolved);
    m.next({ kind: 'fact', truth: false, question: '', text: '' });
    assert.equal(m.tap(1), 'penalty');
    assert.equal(m.tap(1), 'ignored');
    assert.equal(m.tap(0), 'penalty');
    assert.deepEqual(m.scores, [0, 0], 'mai sotto zero');
    m.next({ kind: 'fact', truth: true, question: '', text: '' });
    m.tap(0);
    m.next({ kind: 'fact', truth: true, question: '', text: '' });
    m.tap(0);
    assert.equal(m.winner, 0);
    assert.equal(m.tap(1), 'ignored');
  });

  it('torneo: il campione resta, finisce dopo che tutti hanno sfidato', () => {
    const ps = players(4);
    const l = new DuelloLadder(ps);
    assert.equal(l.champion.id, 'p0');
    assert.equal(l.challenger!.id, 'p1');
    assert.ok(l.record(ps[1]));
    assert.equal(l.champion.id, 'p1');
    assert.equal(l.challenger!.id, 'p2');
    assert.ok(l.record(ps[1]));
    assert.equal(l.record(ps[3]), false);
    assert.equal(l.wins.get('p1'), 2);
  });
});
