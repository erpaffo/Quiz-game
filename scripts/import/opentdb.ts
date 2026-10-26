// Importatore Open Trivia DB (opentdb.com, licenza CC BY-SA 4.0) → lotti in banca-domande/inbox/claude-O00x.jsonl.
// Le domande sono in inglese: escono con `needs_translation: true` e il testo originale in `original`.
// `controlla` le blocca finché qualcuno non le traduce, sceglie la sottocategoria giusta e toglie il campo.
// Licenza: va citata la fonte (campo source) e i pacchetti che le contengono restano CC BY-SA (vedi FONTI.md).
//   npx tsx scripts/import/opentdb.ts [O001 O002 …]   (senza argomenti: tutti)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BANK } from '../banca';
import type { BankDifficulty } from '../../shared/question-bank';

const API = 'https://opentdb.com';
/** Il servizio accetta una richiesta ogni 5 secondi per indirizzo. */
const WAIT_MS = 5500;

/** Lotto → categoria Open Trivia DB e posto nella tassonomia (la sottocategoria si corregge in traduzione). */
const LOTS: Record<string, { otdb: number; category: string; subcategory: string }> = {
  O001: { otdb: 17, category: 'scienza', subcategory: 'biologia' },
  O002: { otdb: 18, category: 'tecnologia', subcategory: 'informatica' },
  O003: { otdb: 22, category: 'geografia', subcategory: 'fisica' },
  O004: { otdb: 20, category: 'miti', subcategory: 'greco-romani' },
  O005: { otdb: 27, category: 'natura', subcategory: 'animali' }
};

const DIFFICULTY: Record<string, BankDifficulty> = { easy: 2, medium: 3, hard: 4 };

interface OtdbQuestion {
  type: 'multiple' | 'boolean';
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`Open Trivia DB ha risposto ${res.status}`);
  return (await res.json()) as T;
}

/** Converte una domanda nel formato della banca (ancora in inglese). */
export function toBank(q: OtdbQuestion, lot: { otdb: number; category: string; subcategory: string }) {
  const d = decodeURIComponent;
  const base = {
    category: lot.category,
    subcategory: lot.subcategory,
    difficulty: DIFFICULTY[q.difficulty] ?? 3,
    text: d(q.question),
    original: d(q.question),
    needs_translation: true,
    verify: 'Da verificare in traduzione (fonte: Open Trivia DB)',
    author: 'script:opentdb',
    source: `opentdb:${lot.otdb}`,
    license: 'CC BY-SA 4.0'
  };
  return q.type === 'boolean'
    ? { kind: 'truefalse', ...base, answer: d(q.correct_answer) === 'True' }
    : { kind: 'multiple', ...base, options: [d(q.correct_answer), ...q.incorrect_answers.map(d)], correct: 0 };
}

async function main() {
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LOTS);
  // il token di sessione evita di ricevere due volte la stessa domanda
  const { token } = await get<{ token: string }>('/api_token.php?command=request');
  for (const name of wanted) {
    const lot = LOTS[name];
    if (!lot) throw new Error(`Lotto sconosciuto: ${name} (disponibili: ${Object.keys(LOTS).join(', ')})`);
    const items = [];
    // priorità alle domande medie e difficili: quelle facili le abbiamo già
    for (const level of ['medium', 'hard']) {
      await sleep(WAIT_MS);
      const r = await get<{ response_code: number; results: OtdbQuestion[] }>(
        `/api.php?amount=25&category=${lot.otdb}&difficulty=${level}&encode=url3986&token=${token}`
      );
      // 1 o 4 = non ce ne sono 25 (nuove): si chiede quante ce ne sono e si riprova
      if (r.response_code === 1 || r.response_code === 4) {
        await sleep(WAIT_MS);
        const c = await get<{ category_question_count: Record<string, number> }>(`/api_count.php?category=${lot.otdb}`);
        const n = Math.min(25, c.category_question_count[`total_${level}_question_count`] ?? 0);
        if (!n) continue;
        await sleep(WAIT_MS);
        const again = await get<{ response_code: number; results: OtdbQuestion[] }>(
          `/api.php?amount=${n}&category=${lot.otdb}&difficulty=${level}&encode=url3986&token=${token}`
        );
        items.push(...again.results.map((q) => toBank(q, lot)));
      } else if (r.response_code === 0) items.push(...r.results.map((q) => toBank(q, lot)));
      else throw new Error(`Open Trivia DB: codice ${r.response_code} per ${name}/${level}`);
    }
    const file = join(BANK, 'inbox', `claude-${name}.jsonl`);
    writeFileSync(file, items.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
    console.log(`✅ ${name} (categoria ${lot.otdb}): ${items.length} domande in inglese → banca-domande/inbox/claude-${name}.jsonl`);
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/import/opentdb.ts')) void main();
