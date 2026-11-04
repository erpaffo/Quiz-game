// Verifica dei fatti con un modello AI (DeepSeek): logica pura, senza rete.
// Usata da scripts/ai-verifica.ts (la chiamata vera) e dai test.

import { isQuiz, type BankItem } from '../shared/question-bank';

export type Esito = 'vero' | 'falso' | 'incerto';
export interface Verdetto {
  id: string;
  esito: Esito;
  motivo: string;
}

/** Solo quiz e Duello hanno un fatto da verificare: gli altri giochi sono scelte creative. */
export function daVerificare(items: BankItem[]): BankItem[] {
  return items.filter((i) => isQuiz(i) || i.kind === 'duello');
}

export function descrivi(item: BankItem): string {
  const fonte = 'verify' in item && item.verify ? `\nFonte indicata: ${item.verify}` : '';
  if (item.kind === 'duello') return `Affermazione: ${item.text}\nIndicata come: ${item.truth ? 'VERA' : 'FALSA'}`;
  if (item.kind === 'multiple') return `Domanda: ${item.text}\nRisposte: ${item.options.map((o, k) => `${k}) ${o}`).join(' | ')}\nRisposta indicata come giusta: ${item.correct}${fonte}`;
  if (item.kind === 'truefalse') return `Affermazione: ${item.text}\nIndicata come: ${item.answer ? 'VERA' : 'FALSA'}${fonte}`;
  if (item.kind === 'numeric') return `Domanda: ${item.text}\nRisposta numerica indicata: ${item.answer} ${item.unit}${fonte}`;
  return '';
}

/** Richiesta per l'API DeepSeek (formato compatibile OpenAI), un lotto alla volta. */
export function costruisciRichiesta(model: string, lotto: BankItem[]) {
  const system = [
    'Sei un verificatore di fatti per un quiz in italiano.',
    'Per ogni elemento decidi se l\'informazione indicata è corretta:',
    "'vero' = corretta e non ambigua; 'falso' = sbagliata, o la risposta indicata come giusta non lo è, o ci sono più risposte giuste;",
    "'incerto' = non sei sicuro, dipende dal contesto o riguarda fatti recenti oltre la tua conoscenza.",
    'Rispondi SOLO con JSON nella forma {"risultati":[{"id":"...","esito":"vero|falso|incerto","motivo":"breve"}]}, un risultato per ogni elemento, con gli stessi id.'
  ].join(' ');
  const user = lotto.map((i) => `### id: ${i.id}\n${descrivi(i)}`).join('\n\n');
  return {
    model,
    temperature: 0,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  };
}

const ESITI: Esito[] = ['vero', 'falso', 'incerto'];

/** Legge la risposta del modello. Ogni id del lotto ottiene un verdetto: se manca o è illeggibile, è «incerto». */
export function leggiRisposta(content: string, ids: string[]): Verdetto[] {
  let trovati: Map<string, Verdetto>;
  try {
    const parsed = JSON.parse(content) as { risultati?: Partial<Verdetto>[] };
    trovati = new Map(
      (parsed.risultati ?? [])
        .filter((r) => typeof r.id === 'string')
        .map((r) => [r.id as string, { id: r.id as string, esito: ESITI.includes(r.esito as Esito) ? (r.esito as Esito) : 'incerto', motivo: String(r.motivo ?? '') }])
    );
  } catch {
    trovati = new Map();
  }
  return ids.map((id) => trovati.get(id) ?? { id, esito: 'incerto', motivo: 'nessuna risposta valida dal modello' });
}

export interface Soglie {
  /** Quanti «falso» sono ammessi: di default nessuno. */
  maxFalsi: number;
  /** Percentuale massima di «incerto» ammessa sul totale. */
  maxIncertiPct: number;
}

export function esitoComplessivo(verdetti: Verdetto[], soglie: Soglie) {
  const falsi = verdetti.filter((v) => v.esito === 'falso');
  const incerti = verdetti.filter((v) => v.esito === 'incerto');
  const pctIncerti = verdetti.length ? (incerti.length / verdetti.length) * 100 : 0;
  const motivi: string[] = [];
  if (falsi.length > soglie.maxFalsi) motivi.push(`${falsi.length} domande risultano false (ammesse ${soglie.maxFalsi})`);
  if (pctIncerti > soglie.maxIncertiPct) motivi.push(`${pctIncerti.toFixed(1)}% incerte (ammesso ${soglie.maxIncertiPct}%)`);
  return { ok: motivi.length === 0, totale: verdetti.length, falsi: falsi.length, incerti: incerti.length, motivi };
}
