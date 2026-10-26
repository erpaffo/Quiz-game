// Importatore Wikidata (dati CC0) → lotti in banca-domande/inbox/claude-W00x.jsonl.
// Le domande nascono da modelli: il FATTO viene da Wikidata, il TESTO è nostro.
// La difficoltà si stima dalla notorietà: quante Wikipedia (in lingue diverse) hanno una pagina sull'argomento (sitelinks).
//   npx tsx scripts/import/wikidata.ts [capitali|elementi|lune|vette …]   (senza argomenti: tutti)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BANK, listCategory } from '../banca';
import type { BankDifficulty } from '../../shared/question-bank';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const UA = 'QuizDelPozzoBanca/0.1 (gioco quiz personale; import CC0)';

type Row = Record<string, string>;

export async function sparql(query: string): Promise<Row[]> {
  const res = await fetch(`${ENDPOINT}?${new URLSearchParams({ query, format: 'json' })}`, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`Wikidata ha risposto ${res.status}`);
  const data = (await res.json()) as { results: { bindings: Record<string, { value: string }>[] } };
  return data.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value.replace('http://www.wikidata.org/entity/', '')])));
}

/** Notorietà → difficoltà (soglie in sitelinks, dalla più famosa alla meno nota). */
export function byFame(links: number, thresholds: [number, number, number, number]): BankDifficulty {
  const [d1, d2, d3, d4] = thresholds;
  return links >= d1 ? 1 : links >= d2 ? 2 : links >= d3 ? 3 : links >= d4 ? 4 : 5;
}

function shuffleWith<T>(list: T[], seed: number): T[] {
  const a = list.slice();
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 3 distrattori dagli elementi più «vicini» (per notorietà o numero), escluso quello giusto e i duplicati. */
export function nearest<T>(pool: T[], target: T, key: (x: T) => number, label: (x: T) => string, n = 3): string[] {
  const right = label(target).toLowerCase();
  const seen = new Set([right]);
  const out: string[] = [];
  for (const x of pool.slice().sort((a, b) => Math.abs(key(a) - key(target)) - Math.abs(key(b) - key(target)))) {
    const l = label(x);
    if (seen.has(l.toLowerCase())) continue;
    seen.add(l.toLowerCase());
    out.push(l);
    if (out.length === n) break;
  }
  return out;
}

const META = { author: 'script:wikidata', license: 'CC0' };
const qnum = (s: string) => Number(s.replace(/\D/g, '')) || 1;

/** Argomenti già trattati dalle domande esistenti (per non ripeterli). */
function alreadyCovered(category: string): (name: string) => boolean {
  // le bandiere nominano tutti i paesi, ma sono un altro argomento: non contano
  // esclusi anche i lotti di questo importatore (claude-W…): si rigenerano da zero
  const texts = listCategory(category).filter((x) => x.where !== 'bandiere' && !x.where.startsWith('claude-W')).map((x) => x.text.toLowerCase());
  return (name) => texts.some((t) => t.includes(name.toLowerCase()));
}

// ------------------------------------------------------------------ W001 capitali

/** Nomi come li direbbe un giocatore (Wikidata usa il nome ufficiale del regno). */
const LABEL_FIX: Record<string, string> = { 'Regno dei Paesi Bassi': 'Paesi Bassi', 'Regno di Danimarca': 'Danimarca' };
/** Correzioni di difficoltà dopo la revisione (la notorietà mondiale non è quella in Italia). */
const DIFFICULTY_FIX: Record<string, BankDifficulty> = { Nicaragua: 4 };

/** Stati discussi o con più capitali: domanda ambigua, si saltano. */
const SKIP_COUNTRIES = new Set(['Q801', 'Q219060', 'Q1246', 'Q865', 'Q750', 'Q258', 'Q1050', 'Q833', 'Q854', 'Q55', 'Q40362', 'Q23681']);

export async function capitali() {
  const rows = await sparql(`
    SELECT ?country ?countryLabel ?capital ?capitalLabel ?links ?continentLabel (COUNT(DISTINCT ?cap2) AS ?ncap) WHERE {
      ?country wdt:P463 wd:Q1065 ; wdt:P31 wd:Q3624078 ; wdt:P36 ?capital ; wdt:P36 ?cap2 ; wdt:P30 ?continent .
      FILTER NOT EXISTS { ?country wdt:P576 [] }  # niente Stati che non esistono più (Germania Ovest, RDT…)
      ?capital wikibase:sitelinks ?links .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "it". }
    } GROUP BY ?country ?countryLabel ?capital ?capitalLabel ?links ?continentLabel`);
  const covered = alreadyCovered('geografia');
  const byCountry = new Map<string, Row>();
  for (const r of rows) if (!byCountry.has(r.country)) byCountry.set(r.country, { ...r, countryLabel: LABEL_FIX[r.countryLabel] ?? r.countryLabel });
  const list = [...byCountry.values()].filter(
    (r) =>
      r.ncap === '1' &&
      !SKIP_COUNTRIES.has(r.country) &&
      !/^Q\d+$/.test(r.countryLabel) &&
      !/^Q\d+$/.test(r.capitalLabel) &&
      !r.capitalLabel.toLowerCase().includes(r.countryLabel.toLowerCase()) &&
      !r.countryLabel.toLowerCase().includes(r.capitalLabel.toLowerCase()) &&
      !covered(r.countryLabel) &&
      !covered(r.capitalLabel)
  );
  const texts = new Set<string>();
  return list.map((r, i) => {
    const links = Number(r.links);
    const difficulty = DIFFICULTY_FIX[r.countryLabel] ?? byFame(links, [250, 200, 170, 140]);
    // distrattori dallo stesso continente; se sono pochi (Oceania) da tutto il mondo
    const same = list.filter((x) => x.continentLabel === r.continentLabel).length >= 6 ? list.filter((x) => x.continentLabel === r.continentLabel) : list;
    const askCapital = i % 2 === 0;
    const options = askCapital
      ? [r.capitalLabel, ...nearest(same, r, (x) => Number(x.links), (x) => x.capitalLabel)]
      : [r.countryLabel, ...nearest(same, r, (x) => Number(x.links), (x) => x.countryLabel)];
    return {
      kind: 'multiple',
      category: 'geografia',
      subcategory: 'capitali',
      difficulty,
      text: askCapital ? `${r.countryLabel}: qual è la sua capitale?` : `Di quale Stato è capitale ${r.capitalLabel}?`,
      options,
      correct: 0,
      verify: `Wikidata ${r.country} (P36 capitale = ${r.capital})`,
      source: `wikidata:${r.country}`,
      ...META,
      tags: [r.continentLabel]
    };
  }).filter((q) => !texts.has(q.text) && texts.add(q.text));
}

// ------------------------------------------------------------------ W002 elementi chimici

/** Elementi che (quasi) tutti conoscono: la regola automatica li darebbe troppo difficili. */
const FAMOUS: Record<string, BankDifficulty> = { H: 1, O: 1, C: 1, Fe: 1, Au: 1, N: 2, He: 2, Ag: 2, Cu: 2, Ca: 2, Cl: 2, Na: 2, Al: 2, Zn: 2, U: 2, Pb: 3, Hg: 3, S: 2, Si: 3, P: 3, Mg: 2, Ne: 2 };

export async function elementi() {
  const rows = await sparql(`
    SELECT ?el ?elLabel ?symbol ?z WHERE {
      ?el wdt:P31 wd:Q11344 ; wdt:P246 ?symbol ; wdt:P1086 ?z .
      FILTER(?z <= 100)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "it". }
    }`);
  const covered = alreadyCovered('scienza');
  const byZ = new Map<number, Row>();
  for (const r of rows) if (!byZ.has(Number(r.z)) && /^[A-Z][a-z]?$/.test(r.symbol) && !/^Q\d+$/.test(r.elLabel)) byZ.set(Number(r.z), r);
  const els = [...byZ.values()].sort((a, b) => Number(a.z) - Number(b.z));
  const out: object[] = [];
  for (const r of els) {
    const name = r.elLabel.toLowerCase();
    if (covered(name) || covered(`«${r.symbol}»`)) continue;
    const z = Number(r.z);
    // simbolo «che non somiglia» al nome italiano (W = tungsteno, Hg = mercurio…): più difficile
    const tricky = !name.startsWith(r.symbol.toLowerCase().slice(0, 1)) || (r.symbol.length === 2 && !name.includes(r.symbol[1].toLowerCase()));
    // simbolo che si deduce leggendo il nome (Pr = praseodimio): facile da indovinare, e per gli elementi rari non insegna nulla
    if (!tricky && z > 36 && !FAMOUS[r.symbol]) continue;
    const base = z <= 20 ? 2 : z <= 36 ? 3 : z <= 56 ? 4 : 5;
    const difficulty = (FAMOUS[r.symbol] ?? (tricky ? Math.min(5, base + 1) : Math.min(base, 2))) as BankDifficulty;
    const askName = z % 2 === 0;
    const near = (k: (x: Row) => string) => nearest(els, r, (x) => Number(x.z), k);
    out.push({
      kind: 'multiple',
      category: 'scienza',
      subcategory: 'chimica',
      difficulty,
      text: askName ? `Quale elemento chimico ha il simbolo «${r.symbol}»?` : `Qual è il simbolo chimico dell'elemento ${name}?`,
      options: askName ? [name.charAt(0).toUpperCase() + name.slice(1), ...near((x) => x.elLabel.charAt(0).toUpperCase() + x.elLabel.slice(1))] : [r.symbol, ...near((x) => x.symbol)],
      correct: 0,
      verify: `Wikidata ${r.el} (P246 simbolo ${r.symbol}, numero atomico ${z})`,
      source: `wikidata:${r.el}`,
      ...META,
      tags: [`Z${z}`]
    });
  }
  return out;
}

// ------------------------------------------------------------------ W003 lune dei pianeti

const PLANETS: Record<string, string> = { Q111: 'Marte', Q319: 'Giove', Q193: 'Saturno', Q324: 'Urano', Q332: 'Nettuno' };

export async function lune() {
  const rows = await sparql(`
    SELECT ?moon ?moonLabel ?planet ?links WHERE {
      VALUES ?planet { wd:Q111 wd:Q319 wd:Q193 wd:Q324 wd:Q332 }
      ?moon wdt:P397 ?planet ; wdt:P31/wdt:P279* wd:Q2537 ; wikibase:sitelinks ?links .
      FILTER(?links >= 60)  # solo le lune più note (sono centinaia)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "it". }
    }`);
  const covered = alreadyCovered('spazio');
  const seen = new Set<string>();
  const perPlanet: Record<string, number> = {};
  return rows
    .sort((a, b) => Number(b.links) - Number(a.links))
    .filter((r) => !/^Q\d+$/.test(r.moonLabel) && !/^S\/|\d{4}/.test(r.moonLabel) && !seen.has(r.moon) && seen.add(r.moon) && !covered(r.moonLabel))
    // al massimo 8 lune per pianeta, le più note: altrimenti Giove riempie il lotto di lunette sconosciute
    .filter((r) => (perPlanet[r.planet] = (perPlanet[r.planet] ?? 0) + 1) <= 8)
    .map((r) => {
      const planet = PLANETS[r.planet];
      const others = shuffleWith(Object.values(PLANETS).filter((p) => p !== planet), qnum(r.moon)).slice(0, 3);
      return {
        kind: 'multiple',
        category: 'spazio',
        subcategory: 'sistema-solare',
        difficulty: Math.max(3, byFame(Number(r.links), [999, 999, 110, 75])) as BankDifficulty,
        text: `Attorno a quale pianeta orbita il satellite naturale ${r.moonLabel}?`,
        options: [planet, ...others],
        correct: 0,
        verify: `Wikidata ${r.moon} (P397 corpo principale = ${r.planet} ${planet})`,
        source: `wikidata:${r.moon}`,
        ...META
      };
    });
}

// ------------------------------------------------------------------ W004 vette

export async function vette() {
  const rows = await sparql(`
    SELECT ?m ?mLabel ?links (MAX(?h) AS ?hmax) (MIN(?h) AS ?hmin) (GROUP_CONCAT(DISTINCT ?countryLabel; separator=" / ") AS ?where) WHERE {
      ?m wdt:P31 wd:Q8502 ; wdt:P2044 ?h ; wikibase:sitelinks ?links .
      # lo Stato è più affidabile della catena montuosa (su Wikidata a volte è sbagliata)
      OPTIONAL { ?m wdt:P17 ?c . ?c rdfs:label ?countryLabel . FILTER(LANG(?countryLabel) = "it") }
      FILTER(?links >= 70)  # solo le montagne abbastanza conosciute
      SERVICE wikibase:label { bd:serviceParam wikibase:language "it". }
    } GROUP BY ?m ?mLabel ?links`);
  const covered = alreadyCovered('geografia');
  return rows
    .filter((r) => !/^Q\d+$/.test(r.mLabel) && !covered(r.mLabel))
    // Rushmore: l'altezza non dice nulla; Olimpo, Sinai, Athos: appartengono a miti e religioni
    .filter((r) => !/Rushmore|Olimpo|Sinai|Athos/i.test(r.mLabel))
    // valori diversi tra le fonti (oltre 1%): altezza incerta, si salta
    .filter((r) => Number(r.hmax) > 1000 && (Number(r.hmax) - Number(r.hmin)) / Number(r.hmax) < 0.01)
    .map((r) => ({
      kind: 'numeric',
      category: 'geografia',
      subcategory: 'fisica',
      difficulty: Math.max(3, byFame(Number(r.links), [999, 140, 100, 70])) as BankDifficulty,
      text: `Quanti metri è alta la montagna «${r.mLabel.charAt(0).toUpperCase() + r.mLabel.slice(1)}»${r.where ? ` (${r.where})` : ''}?`,
      answer: Math.round(Number(r.hmax)),
      unit: 'metri',
      verify: `Wikidata ${r.m} (P2044 altitudine ${Math.round(Number(r.hmax))} m)`,
      source: `wikidata:${r.m}`,
      ...META
    }));
}

// ------------------------------------------------------------------ riga di comando

const TEMPLATES = { capitali: ['W001', capitali], elementi: ['W002', elementi], lune: ['W003', lune], vette: ['W004', vette] } as const;

async function main() {
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TEMPLATES);
  for (const name of wanted) {
    const t = TEMPLATES[name as keyof typeof TEMPLATES];
    if (!t) throw new Error(`Modello sconosciuto: ${name} (disponibili: ${Object.keys(TEMPLATES).join(', ')})`);
    const [lot, fn] = t;
    const items = await fn();
    const file = join(BANK, 'inbox', `claude-${lot}.jsonl`);
    writeFileSync(file, items.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
    console.log(`✅ ${lot} ${name}: ${items.length} domande → banca-domande/inbox/claude-${lot}.jsonl`);
    await new Promise((r) => setTimeout(r, 1500)); // gentili con il servizio pubblico
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/import/wikidata.ts')) void main();
