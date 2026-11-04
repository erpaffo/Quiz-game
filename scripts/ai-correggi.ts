// Corregge le domande che la verifica AI ha giudicato false. Uso: DEEPSEEK_API_KEY=... npm run ai-correggi
// Legge ai-generati/verifiche/rapporto.json, chiede a DeepSeek una versione corretta (o di scartare la domanda
// se non si può salvare), riscrive le righe nei .jsonl e scrive il riepilogo in ai-generati/verifiche/correzioni.md
// (usato come testo della pull request). Dopo: npm run banca-db e npm run banca -- costruisci (lo fa il workflow).

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BANK } from './banca';
import { descrivi, type Verdetto } from './ai-verifica-core';
import type { BankItem } from '../shared/question-bank';

const KEY = process.env.DEEPSEEK_API_KEY;
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-flash';
const RAPPORTO = 'ai-generati/verifiche/rapporto.json';
/** Solo questi campi possono cambiare: id, difficoltà, categoria, autore ecc. restano com'erano. */
const MODIFICABILI = ['text', 'options', 'correct', 'answer', 'unit', 'truth', 'verify'];

interface Proposta {
  azione?: 'correggi' | 'scarta';
  item?: Record<string, unknown>;
  motivo?: string;
}

async function chiedi(item: BankItem, motivo: string): Promise<Proposta> {
  const system = [
    'Sei un redattore di quiz in italiano. Una domanda è stata giudicata sbagliata o ambigua da un verificatore.',
    'Se puoi renderla corretta e non ambigua con una modifica minima (cambiare il testo, le opzioni, la risposta giusta, il verso vero/falso), rispondi azione "correggi" e restituisci in "item" la domanda completa nello stesso formato JSON, con gli stessi campi.',
    'Se non è salvabile, rispondi azione "scarta". Non inventare fatti di cui non sei sicuro.',
    'Rispondi SOLO con JSON: {"azione":"correggi|scarta","item":{...},"motivo":"breve"}.'
  ].join(' ');
  const user = `Problema segnalato: ${motivo}\n\n${descrivi(item)}\n\nDomanda in JSON:\n${JSON.stringify(item)}`;
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal: AbortSignal.timeout(180_000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(json.choices[0].message.content) as Proposta;
}

/** La correzione deve restare una domanda valida dello stesso tipo. */
function valida(vecchia: BankItem, nuova: Record<string, unknown>): boolean {
  if (nuova.kind !== vecchia.kind || typeof nuova.text !== 'string' || !nuova.text.trim()) return false;
  if (vecchia.kind === 'multiple') {
    const o = nuova.options;
    return Array.isArray(o) && o.length === vecchia.options.length && o.every((x) => typeof x === 'string' && x.trim()) && new Set(o).size === o.length && Number.isInteger(nuova.correct) && (nuova.correct as number) >= 0 && (nuova.correct as number) < o.length;
  }
  if (vecchia.kind === 'truefalse') return typeof nuova.answer === 'boolean';
  if (vecchia.kind === 'numeric') return typeof nuova.answer === 'number' && Number.isFinite(nuova.answer) && typeof nuova.unit === 'string';
  if (vecchia.kind === 'duello') return typeof nuova.truth === 'boolean';
  return false;
}

async function main() {
  if (!KEY) {
    console.error('Manca DEEPSEEK_API_KEY.');
    process.exit(2);
  }
  if (!existsSync(RAPPORTO)) return console.log('Nessun rapporto: niente da correggere.');
  const falsi = (JSON.parse(readFileSync(RAPPORTO, 'utf8')).verdetti as Verdetto[]).filter((v) => v.esito === 'falso');
  if (!falsi.length) return console.log('Nessuna domanda falsa.');
  const motivi = new Map(falsi.map((f) => [f.id, f.motivo]));

  const dirs = ['quiz', 'offline'].map((d) => join(BANK, 'approvate', d));
  const files = dirs.flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.jsonl')).map((f) => join(d, f)) : []));
  const righe: string[] = [];
  let corrette = 0;
  for (const file of files) {
    const out: string[] = [];
    let cambiato = false;
    for (const riga of readFileSync(file, 'utf8').split('\n')) {
      let item: BankItem | null = null;
      try {
        item = riga.trim() && !riga.trim().startsWith('//') ? (JSON.parse(riga) as BankItem) : null;
      } catch {
        /* riga illeggibile: la lascio com'è */
      }
      if (!item || !motivi.has(item.id)) {
        out.push(riga);
        continue;
      }
      const motivo = motivi.get(item.id)!;
      let p: Proposta;
      try {
        p = await chiedi(item, motivo);
      } catch (err) {
        righe.push(`- ⚠️ \`${item.id}\` non toccata (errore API: ${(err as Error).message})`);
        out.push(riga);
        continue;
      }
      if (p.azione === 'scarta') {
        righe.push(`- 🗑️ **Rimossa** \`${item.id}\` — ${descrivi(item).split('\n')[0]}\n  - Problema: ${motivo}\n  - ${p.motivo ?? ''}`);
        cambiato = true;
      } else if (p.azione === 'correggi' && p.item && valida(item, p.item)) {
        const nuova: Record<string, unknown> = { ...item };
        for (const k of MODIFICABILI) if (k in p.item) nuova[k] = p.item[k];
        out.push(JSON.stringify(nuova));
        righe.push(`- ✏️ **Corretta** \`${item.id}\`\n  - Prima: ${descrivi(item).replace(/\n/g, ' · ')}\n  - Dopo: ${descrivi(nuova as unknown as BankItem).replace(/\n/g, ' · ')}\n  - Problema: ${motivo}`);
        corrette++;
        cambiato = true;
      } else {
        righe.push(`- ⚠️ \`${item.id}\` non toccata (correzione non valida): ${motivo}`);
        out.push(riga);
      }
    }
    if (cambiato) writeFileSync(file, out.join('\n'), 'utf8');
  }
  const testo = `La verifica AI (${MODEL}) ha giudicato false ${falsi.length} domande. Proposte di correzione da controllare a mano prima di unire:\n\n${righe.join('\n')}\n`;
  writeFileSync('ai-generati/verifiche/correzioni.md', testo, 'utf8');
  console.log(testo);
  console.log(`${corrette} corrette, ${righe.length - corrette} rimosse o non toccate.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
