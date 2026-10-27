// Registro di verifica: un unico file con tutte le domande approvate e una colonna «verificata» (VERO/FALSO).
//   npm run banca-db                         rigenera banca-domande/DATABASE.csv tenendo i segni di verifica già messi
//   npm run banca-db -- segna vero  <id…>    segna come verificate le righe indicate (con chi e quando)
//   npm run banca-db -- segna falso <id…>    le rimette «non verificate» (con una nota facoltativa: --nota "perché")
//   npm run banca-db -- stato                quante domande verificate / da verificare per categoria
//   npm run banca-db -- verifica             (usato dalla CI) errore se il registro non è aggiornato o ha righe FALSO
// Il file si apre con Excel o LibreOffice (separatore «;»). I segni di verifica sopravvivono alle rigenerazioni (chiave = id).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { approved, BANK } from './banca';
import { isQuiz, type BankItem } from '../shared/question-bank';

export const DB_FILE = join(BANK, 'DATABASE.csv');
export const COLUMNS = [
  'id', 'tipo', 'categoria', 'sottocategoria', 'difficolta', 'domanda', 'risposta_giusta', 'altre_risposte', 'unita',
  'fonte_verifica', 'autore', 'revisore', 'origine', 'licenza', 'verificata', 'verificata_da', 'data_verifica', 'note'
] as const;
export type Row = Record<(typeof COLUMNS)[number], string>;

const esc = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Legge un CSV con «;» e virgolette (anche con ritorni a capo dentro le celle). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') (row.push(cell), (cell = ''));
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

export function readDb(file = DB_FILE): Row[] {
  if (!existsSync(file)) return [];
  const [head, ...body] = parseCsv(readFileSync(file, 'utf8'));
  return body.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ''])) as Row);
}

export function writeDb(rows: Row[], file = DB_FILE) {
  const lines = [COLUMNS.join(';'), ...rows.map((r) => COLUMNS.map((c) => esc(r[c] ?? '')).join(';'))];
  writeFileSync(file, '﻿' + lines.join('\r\n') + '\r\n', 'utf8'); // BOM: Excel legge bene gli accenti
}

/** Una domanda della banca → una riga leggibile (senza i segni di verifica). */
export function toRow(i: BankItem): Row {
  const base: Row = {
    id: i.id, tipo: i.kind, categoria: '', sottocategoria: '', difficolta: String(i.difficulty), domanda: '', risposta_giusta: '',
    altre_risposte: '', unita: '', fonte_verifica: i.verify ?? '', autore: i.author, revisore: i.checked_by ?? '', origine: i.source,
    licenza: i.license, verificata: 'FALSO', verificata_da: '', data_verifica: '', note: i.note ?? ''
  };
  if (isQuiz(i)) {
    base.categoria = i.category;
    base.sottocategoria = i.subcategory;
    base.domanda = i.text;
    if (i.kind === 'multiple') {
      base.risposta_giusta = i.options[i.correct];
      base.altre_risposte = i.options.filter((_, k) => k !== i.correct).join(' | ');
    } else if (i.kind === 'truefalse') base.risposta_giusta = i.answer ? 'Vero' : 'Falso';
    else (base.risposta_giusta = String(i.answer)), (base.unita = i.unit);
    return base;
  }
  base.categoria = '(tascabile)';
  switch (i.kind) {
    case 'fronte': (base.domanda = i.word), (base.altre_risposte = `vietate: ${i.taboo.join(', ')}`); break;
    case 'onda': base.domanda = `${i.left} ⟷ ${i.right}`; break;
    case 'impostore': (base.domanda = i.name), (base.altre_risposte = i.words.join(', ')); break;
    case 'camaleonte': (base.domanda = i.category), (base.altre_risposte = i.words.join(', ')); break;
    case 'duello': (base.domanda = i.text), (base.risposta_giusta = i.truth ? 'Vero' : 'Falso'); break;
    default: base.domanda = i.text;
  }
  return base;
}

/** Rigenera il database tenendo i segni di verifica (e le note) già presenti, riga per riga. */
export function refresh(items = approved(), file = DB_FILE): { rows: Row[]; added: number; removed: number } {
  const old = new Map(readDb(file).map((r) => [r.id, r]));
  const rows = items.map((it) => {
    const r = toRow(it);
    const prev = old.get(r.id);
    if (prev) {
      // un segno vale solo per il testo con cui è stato messo: se la domanda è stata corretta, torna FALSO
      const same = prev.domanda === r.domanda && prev.risposta_giusta === r.risposta_giusta && prev.altre_risposte === r.altre_risposte;
      if (same) Object.assign(r, { verificata: prev.verificata, verificata_da: prev.verificata_da, data_verifica: prev.data_verifica });
      r.note = prev.note || r.note;
    }
    return r;
  });
  const ids = new Set(rows.map((r) => r.id));
  const removed = [...old.keys()].filter((id) => !ids.has(id)).length;
  writeDb(rows, file);
  return { rows, added: rows.filter((r) => !old.has(r.id)).length, removed };
}

export function mark(ids: string[], value: boolean, who: string, note = '', file = DB_FILE): number {
  const rows = readDb(file);
  const wanted = new Set(ids);
  let n = 0;
  for (const r of rows) {
    if (!wanted.has(r.id)) continue;
    r.verificata = value ? 'VERO' : 'FALSO';
    // anche per FALSO si ricorda chi ha messo in dubbio la riga e quando (le righe mai controllate li hanno vuoti)
    r.verificata_da = who;
    r.data_verifica = new Date().toISOString().slice(0, 10);
    if (note) r.note = note;
    n++;
  }
  writeDb(rows, file);
  return n;
}

/** Problemi del registro: righe mancanti o vecchie rispetto alla banca, e domande pubblicate ancora FALSO. */
export function problems(items = approved(), file = DB_FILE): string[] {
  const rows = new Map(readDb(file).map((r) => [r.id, r]));
  const out: string[] = [];
  for (const it of items) {
    const want = toRow(it);
    const r = rows.get(want.id);
    if (!r) out.push(`${want.id}: manca nel registro (lancia npm run banca-db)`);
    else if (r.domanda !== want.domanda || r.risposta_giusta !== want.risposta_giusta || r.altre_risposte !== want.altre_risposte) out.push(`${want.id}: testo cambiato, registro da rigenerare (npm run banca-db)`);
    else if (r.verificata !== 'VERO') out.push(`${want.id}: non verificata${r.note ? ` (${r.note})` : ''}`);
    rows.delete(want.id);
  }
  for (const id of rows.keys()) out.push(`${id}: nel registro ma non più nella banca (lancia npm run banca-db)`);
  return out;
}

export function summary(rows = readDb()): string {
  const by = new Map<string, [number, number]>();
  for (const r of rows) {
    const k = r.categoria;
    const c = by.get(k) ?? [0, 0];
    c[r.verificata === 'VERO' ? 0 : 1]++;
    by.set(k, c);
  }
  const lines = [...by].sort().map(([k, [v, f]]) => `${k.padEnd(14)} verificate ${String(v).padStart(4)} · da verificare ${String(f).padStart(4)}`);
  const tot = rows.filter((r) => r.verificata === 'VERO').length;
  return [...lines, `${'TOTALE'.padEnd(14)} verificate ${String(tot).padStart(4)} · da verificare ${String(rows.length - tot).padStart(4)}`].join('\n');
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'segna') {
    const [val, ...rest] = args;
    if (val !== 'vero' && val !== 'falso') throw new Error('Uso: segna vero|falso <id…> [--nota "testo"] [--da nome]');
    const flag = (name: string) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
    const ids = rest.filter((a, i) => !a.startsWith('--') && !['--nota', '--da'].includes(rest[i - 1] ?? ''));
    console.log(`✅ ${mark(ids, val === 'vero', flag('--da') ?? 'claude', flag('--nota') ?? '')} righe aggiornate`);
  } else if (cmd === 'stato') console.log(summary());
  else if (cmd === 'verifica') {
    const p = problems();
    p.slice(0, 50).forEach((x) => console.log(`❌ ${x}`));
    if (p.length > 50) console.log(`… e altri ${p.length - 50}`);
    console.log(p.length ? `${p.length} problemi nel registro di verifica` : '✅ Registro di verifica in ordine: tutte le domande pubblicate sono verificate');
    process.exitCode = p.length ? 1 : 0;
  }
  else {
    const r = refresh();
    console.log(`📚 ${r.rows.length} domande in banca-domande/DATABASE.csv (nuove: ${r.added}, tolte: ${r.removed})`);
    console.log(summary(r.rows));
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/banca-db.ts')) main();
