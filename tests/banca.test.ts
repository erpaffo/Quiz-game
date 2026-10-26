// Banca domande: formato, controlli, doppioni, revisione incrociata, promozione e costruzione dei pacchetti.

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { BANK, build, checkFile, existingKeys, promote, readJsonl, taxonomy, useBankDir } from '../scripts/banca';
import { validatePack } from '../shared/packs';
import { toBank } from '../scripts/import/opentdb';
import { mark, parseCsv, readDb, refresh } from '../scripts/banca-db';
import { dupKey, stableId, toGameDifficulty, validateItem, type BankItem } from '../shared/question-bank';

const tax = taxonomy();
const quiz = (over: Record<string, unknown> = {}) => ({
  kind: 'multiple',
  category: 'storia',
  subcategory: 'antica',
  difficulty: 4,
  text: 'Chi fece costruire il Vallo in Britannia?',
  options: ['Adriano', 'Traiano', 'Claudio', 'Nerone'],
  correct: 0,
  verify: 'Treccani',
  author: 'gemini',
  source: 'ai:gemini',
  license: 'originale',
  ...over
});

describe('Banca domande: formato e controlli', () => {
  it('tassonomia: id unici di categorie e sottocategorie', () => {
    const ids = tax.categorie.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const c of tax.categorie) assert.equal(new Set(c.sottocategorie.map((s) => s.id)).size, c.sottocategorie.length, c.id);
  });

  it('una domanda corretta passa; gli errori tipici vengono segnalati in italiano', () => {
    assert.deepEqual(validateItem(quiz(), tax), []);
    const errs = (o: Record<string, unknown>) => validateItem(quiz(o), tax).join(' | ');
    assert.match(errs({ category: 'astrologia' }), /non esiste/);
    assert.match(errs({ subcategory: 'futuro' }), /subcategory/);
    assert.match(errs({ options: ['a', 'b', 'c'] }), /4 risposte/);
    assert.match(errs({ options: ['Roma', 'roma', 'b', 'c'] }), /uguali/);
    assert.match(errs({ correct: 4 }), /correct/);
    assert.match(errs({ difficulty: 6 }), /difficulty/);
    assert.match(errs({ verify: '' }), /verify/);
    assert.match(errs({ checked_by: 'gemini', check: 'ok' }), /un altro autore/);
    assert.match(errs({ check: 'ok' }), /checked_by/);
    assert.match(validateItem({ kind: 'fronte', word: 'Pizza', taboo: ['pizza', 'forno', 'Napoli', 'mozzarella'], pack: 'casa', difficulty: 1, author: 'a', source: 's', license: 'l' }, tax).join(), /parola stessa/);
    assert.match(validateItem({ kind: 'impostore', name: 'Frutta', words: ['mela', 'pera'], difficulty: 1, author: 'a', source: 's', license: 'l' }, tax).join(), /almeno 8/);
    assert.match(validateItem({ kind: 'bomba-sillaba', text: 'sch', difficulty: 1, author: 'a', source: 's', license: 'l' }, tax).join(), /MAIUSCOLE/);
    assert.match(validateItem({ kind: 'oroscopo' }, tax).join(), /sconosciuto/);
  });

  it('doppioni riconosciuti anche con maiuscole, accenti e punteggiatura diversi; id stabili', () => {
    const a = quiz({ text: 'Chi fece costruire il Vallo in Britannia?' }) as unknown as BankItem;
    const b = quiz({ text: '  chi fece costruire il vallo in britannia ' }) as unknown as BankItem;
    assert.equal(dupKey(a), dupKey(b));
    assert.equal(stableId(a), stableId(b));
    const keys = existingKeys();
    assert.ok(keys.has('quiz:qual e la capitale d italia') || keys.size > 1000, 'legge i pacchetti già esistenti');
    assert.ok(keys.has('fronte:pizza'), 'legge i contenuti dell’app tascabile');
  });

  it('Open Trivia DB: decodifica, risposta giusta in testa, bloccata finché non è tradotta', () => {
    const lot = { otdb: 17, category: 'scienza', subcategory: 'biologia' };
    const q = toBank({ type: 'multiple', difficulty: 'hard', question: 'What%20is%20H2O%3F', correct_answer: 'Water', incorrect_answers: ['Salt', 'Iron', 'Air'] }, lot);
    assert.equal(q.text, 'What is H2O?');
    assert.deepEqual([q.kind, q.difficulty, 'options' in q && q.options[0]], ['multiple', 4, 'Water']);
    assert.ok(validateItem(q, taxonomy()).some((e) => e.includes('tradurre')));
    const t = toBank({ type: 'boolean', difficulty: 'medium', question: 'Sky%20is%20blue', correct_answer: 'True', incorrect_answers: ['False'] }, lot);
    assert.deepEqual([t.kind, 'answer' in t && t.answer], ['truefalse', true]);
  });

  it('difficoltà 1–5 della banca → 1–3 del gioco', () => {
    assert.deepEqual(([1, 2, 3, 4, 5] as const).map(toGameDifficulty), [1, 1, 2, 3, 3]);
  });

  it('i file di esempio sono validi e non doppioni', () => {
    for (const f of ['esempio-quiz.jsonl', 'esempio-tascabile.jsonl']) {
      const r = checkFile(join(BANK, 'esempi', f), tax, existingKeys(), false);
      assert.deepEqual(r.problems, [], f);
      assert.ok(r.total >= 4);
    }
  });
});

describe('Banca domande: lavoro a due (lotto → revisione → approvate → gioco)', () => {
  it('promuove solo ciò che un ALTRO autore ha approvato; scarta i «no»; il resto resta nel lotto', () => {
    const dir = mkdtempSync(join(tmpdir(), 'banca-'));
    useBankDir(dir);
    mkdirSync(join(dir, 'inbox'), { recursive: true });
    cpSync(join(BANK, 'tassonomia.json'), join(dir, 'tassonomia.json'));
    const lot = join(dir, 'inbox', 'gemini-L001.jsonl');
    const lines = [
      quiz({ text: 'Domanda revisionata e buona?', checked_by: 'claude', check: 'ok' }),
      quiz({ text: 'Domanda non ancora revisionata?' }),
      quiz({ text: 'Domanda sbagliata?', checked_by: 'claude', check: 'no', note: 'fatto falso' }),
      quiz({ text: 'Domanda da correggere?', checked_by: 'claude', check: 'fix', note: 'distrattore troppo facile' }),
      { kind: 'fronte', word: 'Zattera', taboo: ['mare', 'legno', 'naufrago', 'galleggiare'], pack: 'natura', difficulty: 2, author: 'gemini', source: 'ai:gemini', license: 'originale', checked_by: 'claude', check: 'ok' }
    ];
    writeFileSync(lot, lines.map((l) => JSON.stringify(l)).join('\n'));
    assert.deepEqual(checkFile(lot, tax).problems, []);
    assert.ok(readJsonl(lot).every((l) => typeof (l.raw as BankItem).id === 'string'), 'controlla aggiunge gli id');

    const r = promote(lot, tax);
    assert.deepEqual(r, { promoted: 2, rejected: 1, kept: 2 });
    assert.equal(readJsonl(join(dir, 'approvate', 'quiz', 'storia.jsonl')).length, 1);
    assert.equal(readJsonl(join(dir, 'approvate', 'offline', 'fronte.jsonl')).length, 1);
    assert.equal(readJsonl(join(dir, 'scartate', 'gemini-L001.jsonl')).length, 1);
    assert.equal(readJsonl(lot).length, 2);

    // ripromuovere non crea doppioni
    writeFileSync(lot, JSON.stringify(quiz({ text: 'Domanda revisionata e buona?', checked_by: 'claude', check: 'ok' })));
    assert.equal(promote(lot, tax).promoted, 0);

    // costruzione: pacchetto del gioco valido + contenuti tascabili
    const packs = join(dir, 'packs');
    const pass = join(dir, 'pass');
    mkdirSync(packs);
    const b = build(tax, { packsDir: packs, passDir: pass });
    assert.equal(b.packs.length, 1);
    const pack = validatePack(JSON.parse(readFileSync(join(packs, 'banca-storia.json'), 'utf8')));
    assert.equal(pack.questions.length, 1);
    assert.equal(pack.questions[0].difficulty, 3, 'difficoltà 4 della banca = difficile nel gioco');
    assert.deepEqual(pack.categories.map((c) => c.id), ['antica']);
    assert.deepEqual(JSON.parse(readFileSync(join(pass, 'fronte.json'), 'utf8')), [{ word: 'Zattera', taboo: ['mare', 'legno', 'naufrago', 'galleggiare'], pack: 'natura' }]);
    assert.deepEqual(JSON.parse(readFileSync(join(pass, 'panico.json'), 'utf8')), [], 'un file per ogni tipo, anche vuoto');
  });

  it('se un pacchetto non è valido, «costruisci» si ferma senza cancellare quelli già presenti', () => {
    const dir = mkdtempSync(join(tmpdir(), 'banca-'));
    useBankDir(dir);
    mkdirSync(join(dir, 'approvate', 'quiz'), { recursive: true });
    writeFileSync(join(dir, 'approvate', 'quiz', 'storia.jsonl'), JSON.stringify({ ...quiz(), id: 'x1' }));
    const packs = join(dir, 'packs');
    mkdirSync(packs);
    writeFileSync(join(packs, 'banca-vecchio.json'), '{}');
    // sottocategoria tolta dalla tassonomia: la domanda punta a una categoria inesistente
    const broken = { ...tax, categorie: tax.categorie.map((c) => (c.id === 'storia' ? { ...c, sottocategorie: [] } : c)) };
    assert.throws(() => build(broken, { packsDir: packs, passDir: join(dir, 'pass') }), /categoria inesistente/);
    assert.ok(existsSync(join(packs, 'banca-vecchio.json')), 'i pacchetti di prima restano finché il nuovo giro non è tutto valido');
  });
});

describe('Database di verifica (DATABASE.csv)', () => {
  const quiz = (text: string, extra = {}) =>
    ({ id: 'multiple-t1', kind: 'multiple', category: 'scienza', subcategory: 'fisica', difficulty: 3, text, options: ['A; "uno"', 'B', 'C', 'D'], correct: 0, verify: 'fonte', author: 'a', source: 's', license: 'l', ...extra }) as BankItem;

  it('i segni di verifica restano alla rigenerazione, ma si azzerano se la domanda cambia', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'bancadb-')), 'db.csv');
    refresh([quiz('Domanda?')], file);
    assert.equal(readDb(file)[0].verificata, 'FALSO');
    assert.equal(mark(['multiple-t1'], true, 'claude', 'ok', file), 1);
    refresh([quiz('Domanda?'), quiz('Altra?', { id: 'multiple-t2' })], file);
    const rows = readDb(file);
    assert.deepEqual(rows.map((r) => r.verificata), ['VERO', 'FALSO']);
    assert.equal(rows[0].risposta_giusta, 'A; "uno"', 'punto e virgola e virgolette sopravvivono al CSV');
    refresh([quiz('Domanda corretta?')], file);
    assert.equal(readDb(file)[0].verificata, 'FALSO', 'testo cambiato: da verificare di nuovo');
  });

  it('parseCsv legge celle con virgolette e a capo', () => {
    const csv = ['a;"b;c";"d""e"', 'x;"y', 'z";w', ''].join(String.fromCharCode(13, 10));
    assert.deepEqual(parseCsv(csv), [['a', 'b;c', 'd"e'], ['x', `y${String.fromCharCode(13, 10)}z`, 'w']]);
  });
});
