// Genera il pacchetto di serie «Bandiere del mondo» e copia le bandiere (SVG) nel client.
//   node scripts/build-flags.mjs
// Fonte delle bandiere: pacchetto open source flag-icons (licenza MIT).
// Stati inclusi: i 193 membri dell'ONU + i 2 Stati osservatori (Città del Vaticano, Palestina).

import { copyFileSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const FLAGS_PKG = dirname(require.resolve('flag-icons/package.json'));
const countries = JSON.parse(readFileSync(resolve(FLAGS_PKG, 'country.json'), 'utf8'));

const UN_MEMBERS = `af al dz ad ao ag ar am au at az bs bh bd bb by be bz bj bt bo ba bw br bn bg bf bi cv kh cm ca cf td cl cn co km cg cd
cr ci hr cu cy cz dk dj dm do ec eg sv gq er ee sz et fj fi fr ga gm ge de gh gr gd gt gn gw gy ht hn hu is in id ir iq ie il it jm jp jo kz ke ki kp
kr kw kg la lv lb ls lr ly li lt lu mg mw my mv ml mt mh mr mu mx fm md mc mn me ma mz mm na nr np nl nz ni ne ng mk no om pk pw pa pg py pe ph pl pt
qa ro ru rw kn lc vc ws sm st sa sn rs sc sl sg sk si sb so za ss es lk sd sr se ch sy tj tz th tl tg to tt tn tr tm tv ug ua ae gb us uy uz vu ve vn
ye zm zw`.split(/\s+/);
const OBSERVERS = ['va', 'ps'];
const CODES = [...UN_MEMBERS, ...OBSERVERS];
if (UN_MEMBERS.length !== 193 || new Set(CODES).size !== 195) throw new Error(`Elenco Stati errato: ${UN_MEMBERS.length}`);

// Nomi italiani dal database internazionale (ICU) con qualche ritocco per i nomi più comuni.
const names = new Intl.DisplayNames(['it'], { type: 'region' });
const NAME_FIX = {
  ci: "Costa d'Avorio",
  cd: 'Repubblica Democratica del Congo',
  cg: 'Repubblica del Congo',
  mm: 'Myanmar',
  ps: 'Palestina',
  cz: 'Repubblica Ceca'
};
const nameOf = (code) => (NAME_FIX[code] ?? names.of(code.toUpperCase())).replace(/’/g, "'");

// Difficoltà: i continenti con Stati meno noti sono più difficili (la Piramide sceglie per difficoltà).
const DIFFICULTY = { europa: 2, nordamerica: 2, sudamerica: 2, asia: 3, africa: 3, oceania: 3 };

const CONTINENTS = {
  Europe: { id: 'europa', name: "Bandiere d'Europa", icon: '🇪🇺', color: '#4361ee' },
  Asia: { id: 'asia', name: "Bandiere d'Asia", icon: '🏯', color: '#e63946' },
  Africa: { id: 'africa', name: "Bandiere d'Africa", icon: '🦁', color: '#f77f00' },
  'North America': { id: 'nordamerica', name: 'Bandiere Nord e Centro America', icon: '🗽', color: '#2a9d8f' },
  'South America': { id: 'sudamerica', name: 'Bandiere del Sud America', icon: '🌎', color: '#43aa8b' },
  Oceania: { id: 'oceania', name: "Bandiere dell'Oceania", icon: '🏝️', color: '#4cc9f0' }
};

// Random deterministico: rigenerando il pacchetto le domande restano identiche.
let seed = 20261014;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const sample = (arr, n) => arr.map((v) => ({ v, r: rnd() })).sort((a, b) => a.r - b.r).slice(0, n).map((x) => x.v);

const states = CODES.map((code) => {
  const c = countries.find((x) => x.code === code);
  if (!c) throw new Error(`Bandiera mancante: ${code}`);
  const continent = CONTINENTS[c.continent];
  if (!continent) throw new Error(`Continente sconosciuto per ${code}: ${c.continent}`);
  return { code, name: nameOf(code), continent };
});

const outDir = resolve(ROOT, 'client/public/flags');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const s of states) copyFileSync(resolve(FLAGS_PKG, 'flags/4x3', `${s.code}.svg`), resolve(outDir, `${s.code}.svg`));

const flag = (code) => `/flags/${code}.svg`;
const questions = [];
for (const s of states) {
  // Distrattori dello stesso continente: le bandiere vicine si somigliano di più.
  const neighbours = states.filter((o) => o.continent === s.continent && o.code !== s.code);
  const wrong = sample(neighbours, 3);
  const opts = [s, ...wrong];
  questions.push({
    id: `f-${s.code}`,
    categoryId: s.continent.id,
    type: 'multiple',
    text: 'Di quale Paese è questa bandiera?',
    image: flag(s.code),
    options: opts.map((o) => o.name),
    correctIndex: 0,
    difficulty: DIFFICULTY[s.continent.id]
  });
  const wrong2 = sample(neighbours, 3);
  const opts2 = [s, ...wrong2];
  questions.push({
    id: `n-${s.code}`,
    categoryId: s.continent.id,
    type: 'multiple',
    text: `Trova la bandiera di questo Stato: ${s.name}`,
    options: opts2.map((o) => o.name),
    optionImages: opts2.map((o) => flag(o.code)),
    correctIndex: 0,
    difficulty: DIFFICULTY[s.continent.id]
  });
}

const pack = {
  id: 'bandiere',
  name: 'Bandiere del mondo',
  description: 'Le bandiere dei 195 Stati sovrani (193 membri ONU + Vaticano e Palestina). Bandiere: flag-icons, licenza MIT.',
  builtIn: true,
  updatedAt: 0,
  categories: Object.values(CONTINENTS),
  questions
};
writeFileSync(resolve(ROOT, 'server/data/packs/bandiere.json'), JSON.stringify(pack, null, 1));
const byCont = Object.fromEntries(Object.values(CONTINENTS).map((c) => [c.id, states.filter((s) => s.continent === c).length]));
console.log(`${states.length} Stati, ${questions.length} domande`, byCont);
console.log('Esempi:', states.filter((s) => ['it', 'ci', 'kn', 'va', 'gb', 'tl'].includes(s.code)).map((s) => s.name).join(' | '));
