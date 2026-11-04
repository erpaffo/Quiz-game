// Verifica AI della banca domande con DeepSeek. Uso: DEEPSEEK_API_KEY=... npm run ai-verifica
// Variabili facoltative: DEEPSEEK_MODEL (default deepseek-flash = DeepSeek-V4.1-Flash), AI_CONCORRENZA (default 4),
// AI_MAX_FALSI (default 0), AI_MAX_INCERTI_PCT (default 10). Esce con 1 se la release va bloccata.
// Scrive il rapporto in ai-generati/verifiche/rapporto.json (cartella ignorata da git).

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { approved } from './banca';
import { costruisciRichiesta, daVerificare, esitoComplessivo, leggiRisposta, type Verdetto } from './ai-verifica-core';

const KEY = process.env.DEEPSEEK_API_KEY;
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-flash'; // DeepSeek-V4.1-Flash
const CONCORRENZA = Number(process.env.AI_CONCORRENZA ?? 4);
const DIMENSIONE_LOTTO = 20;
const URL = 'https://api.deepseek.com/chat/completions';

async function chiama(body: unknown): Promise<string> {
  for (let tentativo = 1; ; tentativo++) {
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      return json.choices[0].message.content;
    } catch (err) {
      if (tentativo >= 3) throw err;
      await new Promise((r) => setTimeout(r, 2000 * tentativo));
    }
  }
}

async function main() {
  if (!KEY) {
    console.error('Manca DEEPSEEK_API_KEY (in CI: Settings → Secrets and variables → Actions).');
    process.exit(2);
  }
  const items = daVerificare(approved());
  const lotti: (typeof items)[] = [];
  for (let k = 0; k < items.length; k += DIMENSIONE_LOTTO) lotti.push(items.slice(k, k + DIMENSIONE_LOTTO));
  console.log(`Verifica AI: ${items.length} domande in ${lotti.length} lotti, modello ${MODEL}, ${CONCORRENZA} in parallelo`);

  const verdetti: Verdetto[] = [];
  let prossimo = 0;
  const lavoratore = async () => {
    while (prossimo < lotti.length) {
      const lotto = lotti[prossimo++];
      const contenuto = await chiama(costruisciRichiesta(MODEL, lotto));
      verdetti.push(...leggiRisposta(contenuto, lotto.map((i) => i.id)));
    }
  };
  await Promise.all(Array.from({ length: CONCORRENZA }, lavoratore));

  const esito = esitoComplessivo(verdetti, {
    maxFalsi: Number(process.env.AI_MAX_FALSI ?? 0),
    maxIncertiPct: Number(process.env.AI_MAX_INCERTI_PCT ?? 10)
  });
  mkdirSync('ai-generati/verifiche', { recursive: true });
  writeFileSync('ai-generati/verifiche/rapporto.json', JSON.stringify({ modello: MODEL, data: new Date().toISOString(), ...esito, verdetti }, null, 1));

  const falsi = verdetti.filter((v) => v.esito === 'falso');
  for (const f of falsi.slice(0, 50)) console.log(`❌ ${f.id}: ${f.motivo}`);
  // Elenco delle false nel riepilogo del job su GitHub, con il testo della domanda.
  if (falsi.length && process.env.GITHUB_STEP_SUMMARY) {
    const per = new Map(items.map((i) => [i.id, i]));
    const righe = falsi.map((f) => `- \`${f.id}\` — ${(per.get(f.id) as { text?: string } | undefined)?.text ?? ''}\n  - ${f.motivo}`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ❌ Domande false (${falsi.length})\n\n${righe.join('\n')}\n`);
  }
  console.log(`Totale ${esito.totale} · veri ${esito.totale - esito.falsi - esito.incerti} · falsi ${esito.falsi} · incerti ${esito.incerti}`);
  if (esito.ok) console.log('✅ Verifica AI superata: la release può procedere.');
  else {
    for (const m of esito.motivi) console.log(`⛔ ${m}`);
    console.log('Rapporto completo in ai-generati/verifiche/rapporto.json');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
