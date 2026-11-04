// Banca domande — strumenti di lavoro (vedi banca-domande/README.md).
//   npm run banca -- controlla [file…]   controlla i lotti (di default tutti quelli in inbox/), aggiunge gli id mancanti
//                                        e stampa gli AVVISI F2.4 (risposta svelata, banalità): non bloccano la promozione
//   npm run banca -- promuovi <file>     sposta in approvate/ gli elementi revisionati «ok» da un ALTRO autore
//   npm run banca -- costruisci          genera i pacchetti del gioco e i contenuti dell'app tascabile
//   npm run banca -- stato               quante domande per categoria e difficoltà, e dove mancano
//   npm run banca -- elenco <categoria>  domande già esistenti in quella categoria (da NON riscrivere)

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { BOMBA_CATEGORIES, BOMBA_SYLLABLES } from '../client/pass/data/bomba';
import { DUELLO_FACTS } from '../client/pass/data/duello';
import { FRONTE_CARDS } from '../client/pass/data/fronte';
import { CHAMELEON_PAIRS, IMPOSTORE_CATEGORIES } from '../client/pass/data/impostore';
import { ONDA_SPECTRA } from '../client/pass/data/onda';
import { PANICO_PROMPTS } from '../client/pass/data/panico';
import { CATENA_PHRASES, TRIBUNALE_QUESTIONS } from '../client/pass/data/social';
import { validatePack, type Pack, type PackQuestion } from '../shared/packs';
import {
  BANK_DIFFICULTY_LABEL,
  dupKey,
  isQuiz,
  norm,
  OFFLINE_KINDS,
  stableId,
  toGameDifficulty,
  validateItem,
  type BankDifficulty,
  type BankItem,
  type BankOffline,
  type BankQuiz,
  type Taxonomy
} from '../shared/question-bank';

export const ROOT = resolve(import.meta.dirname, '..');
export const BANK = resolve(ROOT, 'banca-domande');
const DIRS = {
  inbox: join(ROOT, 'ai-generati', 'inbox'),
  quiz: join(BANK, 'approvate', 'quiz'),
  offline: join(BANK, 'approvate', 'offline'),
  scartate: join(ROOT, 'ai-generati', 'scartate'),
  packs: resolve(ROOT, 'server/data/packs'),
  passGen: resolve(ROOT, 'client/pass/data/generated')
};
/** Per i test: lavora su una banca in un'altra cartella (inbox, approvate, scartate). */
export function useBankDir(dir: string) {
  DIRS.inbox = join(dir, 'inbox');
  DIRS.quiz = join(dir, 'approvate', 'quiz');
  DIRS.offline = join(dir, 'approvate', 'offline');
  DIRS.scartate = join(dir, 'scartate');
}
/** Obiettivo per ogni casella «categoria × difficoltà» (per vedere i buchi con `stato`). */
const TARGET_PER_CELL = 100;
/** Il gioco accetta al massimo 3000 domande per pacchetto (shared/packs.ts). */
const PACK_MAX = 3000;

export function taxonomy(): Taxonomy {
  return JSON.parse(readFileSync(join(BANK, 'tassonomia.json'), 'utf8'));
}

// ------------------------------------------------------------------ lettura e scrittura dei JSONL

export interface Line {
  n: number;
  raw: unknown;
  error?: string;
}

export function readJsonl(file: string): Line[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((text, i) => ({ text, n: i + 1 }))
    .filter((l) => l.text.trim() && !l.text.trim().startsWith('//'))
    .map(({ text, n }) => {
      try {
        return { n, raw: JSON.parse(text) };
      } catch (err) {
        return { n, raw: null, error: `JSON non valido: ${(err as Error).message}` };
      }
    });
}

function writeJsonl(file: string, items: unknown[]) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, items.map((x) => JSON.stringify(x)).join('\n') + (items.length ? '\n' : ''), 'utf8');
}

function listJsonl(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f)) : [];
}

export function approved(): BankItem[] {
  return [...listJsonl(DIRS.quiz), ...listJsonl(DIRS.offline)].flatMap((f) => readJsonl(f).map((l) => l.raw as BankItem));
}

// ------------------------------------------------------------------ doppioni: banca + contenuti già nel gioco

/** Chiavi di tutto ciò che esiste già: domande approvate, pacchetti di serie (non generati), contenuti tascabili. */
export function existingKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const i of approved()) keys.set(dupKey(i), `approvate (${i.id})`);
  for (const f of readdirSync(DIRS.packs).filter((x) => x.endsWith('.json') && !x.startsWith('banca-'))) {
    const pack = JSON.parse(readFileSync(join(DIRS.packs, f), 'utf8')) as Pack;
    for (const q of pack.questions) keys.set(`quiz:${norm(q.text)}`, `pacchetto ${f}`);
  }
  const add = (key: string, where: string) => keys.has(key) || keys.set(key, where);
  FRONTE_CARDS.forEach((c) => add(`fronte:${norm(c.word)}`, 'app tascabile'));
  BOMBA_CATEGORIES.forEach((t) => add(`bomba-categoria:${norm(t)}`, 'app tascabile'));
  BOMBA_SYLLABLES.forEach((t) => add(`bomba-sillaba:${norm(t)}`, 'app tascabile'));
  PANICO_PROMPTS.forEach((t) => add(`panico:${norm(t)}`, 'app tascabile'));
  ONDA_SPECTRA.forEach((s) => add(`onda:${norm(s.left)}|${norm(s.right)}`, 'app tascabile'));
  TRIBUNALE_QUESTIONS.forEach((t) => add(`tribunale:${norm(t)}`, 'app tascabile'));
  CATENA_PHRASES.forEach((t) => add(`catena:${norm(t)}`, 'app tascabile'));
  DUELLO_FACTS.forEach((f) => add(`duello:${norm(f.text)}`, 'app tascabile'));
  IMPOSTORE_CATEGORIES.forEach((c) => add(`impostore:${norm(c.name)}`, 'app tascabile'));
  CHAMELEON_PAIRS.forEach((p) => add(`camaleonte:${p.words.map(norm).sort().join('|')}`, 'app tascabile'));
  return keys;
}

// ------------------------------------------------------------------ elenco (contro le domande «sullo stesso argomento»)

/** Categorie dei pacchetti di serie → categoria della tassonomia (per sapere quali argomenti sono già coperti). */
const LEGACY_CATEGORY: Record<string, string> = {
  geografia: 'geografia', geo: 'geografia', europa: 'geografia', asia: 'geografia', africa: 'geografia', nordamerica: 'geografia', sudamerica: 'geografia', oceania: 'geografia',
  storia: 'storia', sto: 'storia', scienza: 'scienza', sci: 'scienza', nat: 'natura', spa: 'spazio', tec: 'tecnologia', mit: 'miti', lin: 'lingua',
  arte: 'arte', art: 'arte', cinema: 'cinema', cin: 'cinema', film: 'cinema', serie: 'cinema', cart: 'cinema',
  musica: 'musica', mus: 'musica', mita: 'musica', mint: 'musica', classica: 'musica', popolare: 'musica', compositori: 'musica',
  sport: 'sport', spo: 'sport', vg: 'sport', cibo: 'cibo', vita: 'societa'
};

/** Tutte le domande esistenti di una categoria: pacchetti di serie, banca approvata e lotti in inbox. */
export function listCategory(category: string): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const f of readdirSync(DIRS.packs).filter((x) => x.endsWith('.json') && !x.startsWith('banca-'))) {
    const pack = JSON.parse(readFileSync(join(DIRS.packs, f), 'utf8')) as Pack;
    for (const q of pack.questions) if (LEGACY_CATEGORY[q.categoryId] === category) out.push({ where: f.replace('.json', ''), text: q.text });
  }
  const fromBank = (file: string, where: string) =>
    readJsonl(file).forEach((l) => {
      const i = l.raw as BankItem;
      if (i && isQuiz(i) && i.category === category) out.push({ where, text: `[${i.subcategory}·d${i.difficulty}] ${i.text}` });
    });
  fromBank(join(DIRS.quiz, `${category}.jsonl`), 'banca');
  listJsonl(DIRS.inbox).forEach((f) => fromBank(f, basename(f, '.jsonl')));
  return out;
}

// ------------------------------------------------------------------ controlla

export interface FileReport {
  file: string;
  total: number;
  ok: number;
  problems: string[];
  /** Avvisi F2.4: non bloccano la promozione, vanno solo riletti. */
  warnings: string[];
}

/** Parole assolute che in una vero/falso rivelano la risposta (o la rendono banale). */
const ABSOLUTE_WORDS = ['sempre', 'mai', 'unico', 'unica', 'unici', 'uniche', 'tutti', 'tutte', 'nessuno', 'nessuna'];

/** Risposta in forma testuale: '' per le vero/falso (risposta sì/no, niente da cercare). */
function answerText(q: BankQuiz): string {
  return q.kind === 'multiple' ? (q.options[q.correct] ?? '') : q.kind === 'numeric' ? String(q.answer) : '';
}

/** La risposta compare come parola intera nel testo? (maiuscole e accenti indifferenti) */
function containsText(text: string, answer: string): boolean {
  const a = norm(answer);
  return a.length >= 4 && new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(norm(text));
}

function containsNumber(text: string, answer: number): boolean {
  return text.toLowerCase().split(/[^\d.-]+/).includes(String(answer));
}

/** Avvisi F2.4 su un lotto: «risposta svelata» e «banalità». Restituisce «file:riga: …». */
function advisories(label: string, items: { n: number; q: BankQuiz }[]): string[] {
  const out: string[] = [];
  for (const { n, q } of items) {
    for (const other of items) {
      if (other.n === n) continue;
      const hit = other.q.kind === 'numeric' ? containsNumber(q.text, other.q.answer) : containsText(q.text, answerText(other.q));
      if (hit) out.push(`${label}:${n}: ⚠️ risposta svelata: «${answerText(other.q)}» (risposta della riga ${other.n}) compare nel testo`);
    }
    if (q.kind === 'numeric' && containsNumber(q.text, q.answer)) out.push(`${label}:${n}: ⚠️ banalità: la risposta (${q.answer}) compare già nel testo della domanda`);
    if (q.kind === 'truefalse') {
      const abs = ABSOLUTE_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(norm(q.text)));
      if (abs) out.push(`${label}:${n}: ⚠️ banalità: vero/falso con parola assoluta «${abs}» da rivedere`);
    }
  }
  return out;
}

/** Controlla un lotto; con `fix` aggiunge gli id mancanti e riscrive il file. */
export function checkFile(file: string, tax: Taxonomy, known = existingKeys(), fix = true): FileReport {
  const lines = readJsonl(file);
  const problems: string[] = [];
  const seen = new Map<string, number>();
  let changed = false;
  let ok = 0;
  for (const l of lines) {
    if (l.error) {
      problems.push(`riga ${l.n}: ${l.error}`);
      continue;
    }
    const errs = validateItem(l.raw, tax);
    const item = l.raw as BankItem;
    if (!errs.length) {
      if (!item.id) {
        item.id = stableId(item);
        changed = true;
      }
      const key = dupKey(item);
      if (seen.has(key)) errs.push(`doppione della riga ${seen.get(key)}`);
      else if (known.has(key) && !known.get(key)!.includes(`(${item.id})`)) errs.push(`esiste già (${known.get(key)})`);
      seen.set(key, l.n);
    }
    if (errs.length) problems.push(`riga ${l.n}: ${errs.join(' · ')}`);
    else ok++;
  }
  // Con una riga rotta non si riscrive: la riga verrebbe salvata come «null» e il testo andrebbe perso.
  if (fix && changed && !lines.some((l) => l.error)) writeJsonl(file, lines.map((l) => l.raw));
  const warnings = advisories(relative(ROOT, file), lines.filter((l) => !l.error && isQuiz(l.raw as BankItem)).map((l) => ({ n: l.n, q: l.raw as BankQuiz })));
  return { file, total: lines.length, ok, problems, warnings };
}

// ------------------------------------------------------------------ promuovi

export interface PromoteResult {
  promoted: number;
  rejected: number;
  kept: number;
}

/** Elementi validi, senza doppioni e approvati («check: ok») da un revisore diverso dall'autore → approvate/. */
export function promote(file: string, tax: Taxonomy): PromoteResult {
  const known = existingKeys();
  const lines = readJsonl(file);
  const broken = lines.find((l) => l.error);
  if (broken) throw new Error(`riga ${broken.n}: ${broken.error}. Correggila prima di promuovere, altrimenti andrebbe persa.`);
  const keep: unknown[] = [];
  const rejected: unknown[] = [];
  const byTarget = new Map<string, BankItem[]>();
  for (const l of lines) {
    const item = l.raw as BankItem;
    const errs = l.error ? [l.error] : validateItem(item, tax);
    if (!errs.length && !item.id) item.id = stableId(item);
    if (item && item.check === 'no') {
      rejected.push(item);
      continue;
    }
    const dup = !errs.length && known.has(dupKey(item));
    if (errs.length || dup || item.check !== 'ok') {
      keep.push(l.raw);
      continue;
    }
    known.set(dupKey(item), `approvate (${item.id})`);
    const target = isQuiz(item) ? join(DIRS.quiz, `${item.category}.jsonl`) : join(DIRS.offline, `${item.kind}.jsonl`);
    byTarget.set(target, [...(byTarget.get(target) ?? []), item]);
  }
  for (const [target, items] of byTarget) writeJsonl(target, [...readJsonl(target).map((l) => l.raw), ...items]);
  if (rejected.length) writeJsonl(join(DIRS.scartate, basename(file)), [...readJsonl(join(DIRS.scartate, basename(file))).map((l) => l.raw), ...rejected]);
  if (keep.length) writeJsonl(file, keep);
  else unlinkSync(file);
  return { promoted: [...byTarget.values()].reduce((n, x) => n + x.length, 0), rejected: rejected.length, kept: keep.length };
}

// ------------------------------------------------------------------ costruisci

function toPackQuestion(q: BankQuiz): PackQuestion {
  const base = { id: q.id, categoryId: q.subcategory, text: q.text, difficulty: toGameDifficulty(q.difficulty), ...(q.image ? { image: q.image } : {}) };
  if (q.kind === 'multiple') return { ...base, type: 'multiple', options: q.options, correctIndex: q.correct };
  if (q.kind === 'truefalse') return { ...base, type: 'truefalse', answer: q.answer };
  return { ...base, type: 'numeric', answer: q.answer, unit: q.unit };
}

/** Contenuto tascabile nella forma usata da client/pass/data/*.ts. */
function toOffline(i: BankOffline): unknown {
  switch (i.kind) {
    case 'fronte':
      return { word: i.word, taboo: i.taboo, pack: i.pack };
    case 'onda':
      return { left: i.left, right: i.right };
    case 'duello':
      return { text: i.text, truth: i.truth };
    case 'impostore':
      return { name: i.name, words: i.words };
    case 'camaleonte':
      return { category: i.category, words: i.words };
    default:
      return i.text;
  }
}

export interface BuildResult {
  packs: { file: string; questions: number }[];
  offline: Record<string, number>;
}

export function build(tax: Taxonomy, opts: { packsDir?: string; passDir?: string } = {}): BuildResult {
  const packsDir = opts.packsDir ?? DIRS.packs;
  const passDir = opts.passDir ?? DIRS.passGen;
  const items = approved();
  const result: BuildResult = { packs: [], offline: {} };

  // pacchetti del gioco: uno per macro-categoria, con le sottocategorie come categorie del pacchetto.
  // Prima si validano tutti, poi si sostituiscono i vecchi: un errore a metà non lascia il gioco senza categorie.
  const built: { file: string; pack: Pack; questions: number }[] = [];
  for (const cat of tax.categorie) {
    const qs = items.filter((i): i is BankQuiz => isQuiz(i) && i.category === cat.id);
    if (!qs.length) continue;
    // shortcut: oltre 3000 domande per categoria il pacchetto va diviso per sottocategoria; per ora si ferma con un errore chiaro
    if (qs.length > PACK_MAX) throw new Error(`«${cat.id}» ha ${qs.length} domande: oltre ${PACK_MAX} va divisa per sottocategoria (scripts/banca.ts)`);
    const used = cat.sottocategorie.filter((s) => qs.some((q) => q.subcategory === s.id));
    const pack = validatePack({
      id: `banca-${cat.id}`,
      name: `📚 ${cat.nome}`.slice(0, 40),
      description: `Banca domande · ${qs.length} domande verificate, difficoltà da facile a esperti.`,
      categories: used.map((s) => ({ id: s.id, name: s.nome.slice(0, 30), icon: cat.icona, color: cat.colore })),
      questions: qs.map(toPackQuestion)
    });
    built.push({ file: join(packsDir, `banca-${cat.id}.json`), pack, questions: qs.length });
  }
  for (const f of readdirSync(packsDir).filter((x) => x.startsWith('banca-') && x.endsWith('.json'))) rmSync(join(packsDir, f));
  for (const { file, pack, questions } of built) {
    writeFileSync(file, JSON.stringify({ ...pack, builtIn: true, updatedAt: 0 }, null, 1), 'utf8');
    result.packs.push({ file: relative(ROOT, file), questions });
  }

  // contenuti dell'app tascabile: un file per tipo (sempre presenti, anche vuoti, perché l'app li importa)
  mkdirSync(passDir, { recursive: true });
  for (const kind of OFFLINE_KINDS) {
    const list = items.filter((i): i is BankOffline => i.kind === kind).map(toOffline);
    writeFileSync(join(passDir, `${kind}.json`), JSON.stringify(list, null, 1) + '\n', 'utf8');
    result.offline[kind] = list.length;
  }

  // attribuzioni: obbligatorie per le fonti con licenza CC BY / CC BY-SA
  const credits = new Map<string, number>();
  for (const i of items) if (i.license !== 'originale') credits.set(`${i.license} · ${i.source.split(':')[0]}`, (credits.get(`${i.license} · ${i.source.split(':')[0]}`) ?? 0) + 1);
  writeFileSync(
    join(resolve(DIRS.inbox, '..'), 'ATTRIBUZIONI.txt'),
    ['Contenuti della banca domande provenienti da fonti esterne (generato da `npm run banca -- costruisci`):', '', ...[...credits].map(([k, n]) => `- ${k}: ${n} elementi`), ''].join('\n'),
    'utf8'
  );
  return result;
}

// ------------------------------------------------------------------ stato

export function status(tax: Taxonomy): string {
  const items = approved();
  const rows = tax.categorie.map((c) => {
    const cells = ([1, 2, 3, 4, 5] as BankDifficulty[]).map((d) => items.filter((i) => isQuiz(i) && i.category === c.id && i.difficulty === d).length);
    return `${c.icona} ${c.nome.padEnd(22)} ${cells.map((n) => String(n).padStart(5)).join(' ')}   ${cells.filter((n) => n < TARGET_PER_CELL).length ? '⚠️ sotto obiettivo' : '✅'}`;
  });
  const offline = OFFLINE_KINDS.map((k) => `${k}: ${items.filter((i) => i.kind === k).length}`).join(' · ');
  const inbox = listJsonl(DIRS.inbox).map((f) => `${basename(f)} (${readJsonl(f).length})`);
  return [
    `Domande approvate per categoria e difficoltà (obiettivo ${TARGET_PER_CELL} per casella):`,
    `Difficoltà: ${([1, 2, 3, 4, 5] as BankDifficulty[]).map((d) => `${d} ${BANK_DIFFICULTY_LABEL[d].toLowerCase()}`).join(' · ')}`,
    `${''.padEnd(25)} ${([1, 2, 3, 4, 5] as BankDifficulty[]).map((d) => `d${d}`.padStart(5)).join(' ')}`,
    ...rows,
    '',
    `Contenuti tascabili approvati: ${offline}`,
    `Lotti in inbox: ${inbox.length ? inbox.join(', ') : 'nessuno'}`
  ].join('\n');
}

// ------------------------------------------------------------------ riga di comando

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const tax = taxonomy();
  for (const d of [DIRS.inbox, DIRS.quiz, DIRS.offline, DIRS.scartate]) mkdirSync(d, { recursive: true });
  if (cmd === 'controlla') {
    const files = args.length ? args.map((a) => resolve(a)) : listJsonl(DIRS.inbox);
    if (!files.length) return console.log('Nessun lotto in banca-domande/inbox/.');
    const known = existingKeys();
    let bad = 0;
    for (const f of files) {
      const r = checkFile(f, tax, known);
      console.log(`${r.problems.length ? '❌' : '✅'} ${relative(ROOT, f)}: ${r.ok}/${r.total} validi${r.warnings.length ? ` · ${r.warnings.length} avvisi (non bloccano)` : ''}`);
      r.problems.slice(0, 40).forEach((p) => console.log(`   - ${p}`));
      if (r.problems.length > 40) console.log(`   … e altri ${r.problems.length - 40}`);
      r.warnings.slice(0, 30).forEach((w) => console.log(`   ${w}`));
      if (r.warnings.length > 30) console.log(`   … e altri ${r.warnings.length - 30} avvisi`);
      bad += r.problems.length;
    }
    process.exitCode = bad ? 1 : 0;
  } else if (cmd === 'promuovi') {
    if (!args[0]) throw new Error('Indica il file: npm run banca -- promuovi banca-domande/inbox/<lotto>.jsonl');
    const r = promote(resolve(args[0]), tax);
    console.log(`✅ approvati: ${r.promoted} · 🗑️ scartati: ${r.rejected} · ⏳ restano nel lotto (da correggere o da revisionare): ${r.kept}`);
  } else if (cmd === 'costruisci') {
    const r = build(tax);
    r.packs.forEach((p) => console.log(`📦 ${p.file}: ${p.questions} domande`));
    console.log(`📲 app tascabile: ${Object.entries(r.offline).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
    console.log('Ricorda: `npm run build` per includerli nel gioco.');
  } else if (cmd === 'elenco') {
    if (!args[0] || !tax.categorie.some((c) => c.id === args[0])) throw new Error(`Indica una categoria: ${tax.categorie.map((c) => c.id).join(', ')}`);
    const list = listCategory(args[0]);
    const flags = list.filter((x) => x.where === 'bandiere').length;
    console.log(`Domande che esistono già in «${args[0]}» (${list.length}): NON riscrivere questi argomenti.`);
    if (flags) console.log(`- bandiere: ${flags} domande «Di quale paese è questa bandiera?» (tutti i paesi del mondo)`);
    list.filter((x) => x.where !== 'bandiere').forEach((x) => console.log(`- (${x.where}) ${x.text}`));
  } else if (cmd === 'stato') {
    console.log(status(tax));
  } else {
    console.log('Comandi: controlla [file…] · promuovi <file> · costruisci · stato · elenco <categoria>   (vedi banca-domande/README.md)');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
