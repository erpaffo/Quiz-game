// Catalogo del Party Pack: ogni "Show" è un gioco completo dell'Hub (stile Jackbox Party Pack).
// Ogni Show condivide la stessa stanza (codice 4 lettere, giocatori connessi, personaggi 3D e selfie).
// L'ordine delle chiavi di SHOWS è l'ordine delle cartucce nel menù.

import { CONFIG } from './config';

export type ShowId =
  | 'quiz'
  | 'tempo'
  | 'gemelle'
  | 'scala'
  | 'bluff'
  | 'impostor'
  | 'leggende'
  | 'guastafeste'
  | 'fila'
  | 'social'
  | 'sondaggi'
  | 'creative'
  | 'colpevole'
  | 'smistatori';

export type ShowCategory = 'trivia' | 'parole' | 'bluff' | 'social' | 'disegno' | 'squadre';

export interface ShowMeta {
  id: ShowId;
  name: string;
  subtitle: string;
  icon: string;
  color: string;
  badge: string;
  /** Testo pronto, derivato da minPlayers/maxPlayers. */
  playersLabel: string;
  durationLabel: string;
  /** True se il gioco è selezionabile dal menù (server + UI pronti). */
  available: boolean;
  highlights: string[];
  category: ShowCategory;
  minPlayers: number;
  maxPlayers: number;
  /** Regole in 3 righe brevi per la scheda di dettaglio del menù. */
  rules: string[];
  /** Quanti round giocare: personalizzabile dal menù (LobbySettings.rounds). */
  rounds: ShowRounds;
  /** Regole modificabili dal sottomenù del gioco (LobbySettings.options). Vuoto per il quiz. */
  options: ShowOption[];
}

/** Una regola con poche scelte («Ritmo»: Veloce / Normale / Rilassato). `choices[].id` è ciò che viaggia in rete. */
export interface ShowOption {
  id: string;
  label: string;
  hint: string;
  choices: { id: string; label: string }[];
  /** id della scelta predefinita. */
  default: string;
}

/** Numero di round scelto nel menù, per gioco. `label` = cosa si conta («Eventi», «Mostri»…). */
export interface ShowRounds {
  label: string;
  min: number;
  max: number;
  default: number;
}

// I massimi dipendono dai contenuti disponibili (eventi, temi, categorie…) e dalla struttura del gioco.
// Quiz: 'default' = durata «Normale»; finché nessuno sceglie un numero vale la Durata (settings.length).
const SHOW_ROUNDS: Record<ShowId, ShowRounds> = {
  quiz: { label: 'Minigiochi', min: 2, max: 9, default: 5 },
  tempo: { label: 'Eventi', min: 3, max: 15, default: 8 },
  gemelle: { label: 'Round', min: 2, max: 8, default: 4 },
  scala: { label: 'Round', min: 1, max: 4, default: 2 },
  bluff: { label: 'Domande', min: 3, max: 10, default: 5 },
  impostor: { label: 'Round', min: 1, max: 8, default: 3 },
  leggende: { label: 'Mostri', min: 2, max: 4, default: 4 },
  guastafeste: { label: 'Round', min: 1, max: 3, default: 3 },
  fila: { label: 'Serie', min: 2, max: 8, default: 4 },
  social: { label: 'Domande', min: 4, max: 15, default: 8 },
  sondaggi: { label: 'Round', min: 2, max: 8, default: 4 },
  creative: { label: 'Giri di disegni', min: 1, max: 3, default: 1 },
  colpevole: { label: 'Casi', min: 1, max: 4, default: 2 },
  smistatori: { label: 'Round', min: 1, max: 6, default: 3 }
};

/** Valore valido per il gioco (intero, dentro min–max) oppure null se `n` non è un numero. */
export function clampRounds(id: ShowId, n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const r = SHOW_ROUNDS[id];
  return Math.min(r.max, Math.max(r.min, Math.round(n)));
}

/**
 * Round da giocare: scelta del menù, altrimenti il valore predefinito del gioco
 * (per il quiz, quello della Durata Corta/Normale/Lunga).
 */
export function roundsFor(
  settings: { rounds?: Partial<Record<ShowId, number>>; length?: keyof typeof CONFIG.GAMES_PER_LENGTH } | null | undefined,
  id: ShowId
): number {
  const chosen = clampRounds(id, settings?.rounds?.[id]);
  if (chosen !== null) return chosen;
  if (id === 'quiz' && settings?.length && settings.length in CONFIG.GAMES_PER_LENGTH) return CONFIG.GAMES_PER_LENGTH[settings.length];
  return SHOW_ROUNDS[id].default;
}

/** Ritmo: moltiplicatore della durata di ogni passo (più basso = più veloce). */
export const PACE_FACTOR: Record<string, number> = { fast: 0.7, normal: 1, slow: 1.5 };

const PACE: ShowOption = {
  id: 'pace',
  label: 'Ritmo',
  hint: 'Quanto tempo si ha per rispondere a ogni passo.',
  choices: [
    { id: 'fast', label: '⚡ Veloce' },
    { id: 'normal', label: '⏱️ Normale' },
    { id: 'slow', label: '🐢 Rilassato' }
  ],
  default: 'normal'
};

const ON_OFF = [
  { id: 'on', label: '✅ Sì' },
  { id: 'off', label: '🚫 No' }
];

/** Regole per gioco: tutti hanno il Ritmo, alcuni hanno una regola propria. */
const SHOW_OPTIONS: Record<ShowId, ShowOption[]> = {
  quiz: [],
  tempo: [PACE],
  gemelle: [PACE],
  scala: [PACE],
  bluff: [
    PACE,
    { id: 'doubles', label: 'Ultime 2 domande doppie', hint: 'Le ultime due domande valgono il doppio dei punti.', choices: ON_OFF, default: 'on' }
  ],
  impostor: [
    PACE,
    { id: 'lastChance', label: 'Ultima possibilità', hint: 'L’impostore smascherato può ancora indovinare la parola e salvarsi.', choices: ON_OFF, default: 'on' }
  ],
  leggende: [
    PACE,
    {
      id: 'hearts',
      label: 'Vite degli eroi',
      hint: 'Quanti cuori ha ogni eroe all’inizio.',
      choices: [
        { id: '2', label: '❤️ 2 · Difficile' },
        { id: '3', label: '❤️ 3 · Normale' },
        { id: '5', label: '❤️ 5 · Facile' }
      ],
      default: '3'
    }
  ],
  guastafeste: [PACE],
  fila: [PACE],
  social: [PACE],
  sondaggi: [PACE],
  creative: [PACE],
  colpevole: [PACE],
  smistatori: [PACE]
};

type OptionSettings = { options?: Partial<Record<ShowId, Record<string, string>>> } | null | undefined;

/** Scelta valida di una regola: quella del menù se esiste ed è ammessa, altrimenti il valore predefinito. */
export function optionFor(settings: OptionSettings, id: ShowId, optionId: string): string {
  const def = SHOW_OPTIONS[id].find((o) => o.id === optionId);
  if (!def) return '';
  const v = settings?.options?.[id]?.[optionId];
  return def.choices.some((c) => c.id === v) ? (v as string) : def.default;
}

/** Controlla le scelte in arrivo dalla rete: tiene solo regole e scelte che esistono per quel gioco. */
export function sanitizeOptions(id: ShowId, input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== 'object') return out;
  for (const def of SHOW_OPTIONS[id]) {
    const v = (input as Record<string, unknown>)[def.id];
    if (typeof v === 'string' && def.choices.some((c) => c.id === v)) out[def.id] = v;
  }
  return out;
}

/** Copertina del pack (schermata iniziale del menù). */
export const PACK = {
  name: 'Sapere è Potere',
  edition: 'Party Pack',
  tagline: '14 giochi per il divano: prendi il telefono e unisciti!'
} as const;

export const SHOW_CATEGORIES: Record<ShowCategory, { label: string; icon: string }> = {
  trivia: { label: 'Quiz & Cultura', icon: '🧠' },
  parole: { label: 'Parole & Battute', icon: '✍️' },
  bluff: { label: 'Bluff & Inganni', icon: '🎭' },
  social: { label: 'Tra Amici', icon: '💬' },
  disegno: { label: 'Disegno', icon: '🎨' },
  squadre: { label: 'A Squadre', icon: '⚔️' }
};

type ShowInput = Omit<ShowMeta, 'playersLabel' | 'rounds' | 'options'>;
const show = (m: ShowInput): ShowMeta => ({
  ...m,
  playersLabel: `${m.minPlayers}–${m.maxPlayers} giocatori`,
  rounds: SHOW_ROUNDS[m.id],
  options: SHOW_OPTIONS[m.id]
});

// `available: false` = logica server pronta (server/shows/<id>), UI di TV e telefono ancora da fare.
export const SHOWS: Record<ShowId, ShowMeta> = {
  quiz: show({
    id: 'quiz',
    name: 'Sapere è Potere',
    subtitle: 'Quiz show con carte ostacolo e scalata della Piramide',
    icon: '👑',
    color: '#ffd60a',
    badge: 'COMPLETO · 9 GIOCHI',
    durationLabel: '12–25 min',
    available: true,
    category: 'trivia',
    minPlayers: 2,
    maxPlayers: 16,
    highlights: [
      '9 minigiochi (Classico, Bomba, Ruba Punti, Raffica, Stima…)',
      'Carte potere per congelare o riempire di melma i telefoni avversari',
      'Gran finale sulla Piramide della Conoscenza'
    ],
    rules: ['Rispondi alle domande dal telefono', 'Gioca carte per ostacolare gli avversari', 'Scala la Piramide finale per vincere']
  }),
  tempo: show({
    id: 'tempo',
    name: 'Macchina del Tempo',
    subtitle: 'In che anno è successo? Vince chi sbaglia di meno',
    icon: '🕰️',
    color: '#f4a261',
    badge: 'TRIVIA · VELOCE',
    durationLabel: '5–8 min',
    available: true,
    category: 'trivia',
    minPlayers: 2,
    maxPlayers: 16,
    highlights: [
      "8 eventi storici e di cultura pop: scegli l'anno dal telefono",
      "Più ti avvicini, più punti: l'anno esatto vale un bonus",
      'Le pedine scorrono sulla linea del tempo alla rivelazione'
    ],
    rules: ['Leggi l’evento sulla TV', 'Scegli l’anno sul telefono', 'Più ti avvicini, più punti']
  }),
  gemelle: show({
    id: 'gemelle',
    name: 'Anime Gemelle',
    subtitle: 'Scrivi più parole possibili: conta solo chi la pensa come te',
    icon: '💞',
    color: '#ff8fab',
    badge: 'PAROLE · INTESA',
    durationLabel: '8–10 min',
    available: true,
    category: 'parole',
    minPlayers: 3,
    maxPlayers: 12,
    highlights: [
      'Una parola sulla TV, 45 secondi per scrivere tutte quelle che ti vengono in mente',
      'Punti per ogni parola che anche altri hanno scritto',
      'Alla fine si scopre la coppia di Anime Gemelle della serata'
    ],
    rules: ['Leggi la parola sulla TV', 'Scrivi tutte le parole che ti ricorda', 'Fai punti se gli altri scrivono le stesse']
  }),
  scala: show({
    id: 'scala',
    name: 'Scala del Nonsenso',
    subtitle: 'Scrivi una risposta che valga esattamente 7 su 10',
    icon: '📊',
    color: '#90be6d',
    badge: 'PAROLE · INTUITO',
    durationLabel: '10–12 min',
    available: true,
    category: 'parole',
    minPlayers: 3,
    maxPlayers: 10,
    highlights: [
      'Ricevi un tema e un numero segreto da 1 a 10',
      'Scrivi una risposta che "valga" quel numero',
      'Gli altri devono indovinare il tuo numero'
    ],
    rules: ['Ricevi tema e numero segreto', 'Scrivi una risposta che valga quel numero', 'Indovina i numeri degli altri']
  }),
  bluff: show({
    id: 'bluff',
    name: "Fuffa d'Autore",
    subtitle: 'Inventa bugie credibili su fatti assurdi e inganna gli amici',
    icon: '🎭',
    color: '#ff4d6d',
    badge: 'BLUFF & INGANNI',
    durationLabel: '12–15 min',
    available: true,
    category: 'bluff',
    minPlayers: 3,
    maxPlayers: 8,
    highlights: [
      'Scrivi dal telefono una risposta falsa ma verosimile',
      'Pulsante «Bugia Salvagente» se sei a corto di idee',
      '+500 punti per ogni amico che casca nel tuo bluff!'
    ],
    rules: ['Completa il fatto vero con una bugia', 'Trova la verità tra le bugie', 'Punti a chi indovina e a chi inganna']
  }),
  impostor: show({
    id: 'impostor',
    name: "L'Impostore",
    subtitle: 'Uno di voi non conosce la parola segreta: chi sta fingendo?',
    icon: '🕵️',
    color: '#52d273',
    badge: 'VELOCE · 3 MIN',
    durationLabel: '5–8 min',
    available: true,
    category: 'bluff',
    minPlayers: 4,
    maxPlayers: 10,
    highlights: [
      'Perfetto per rompere il ghiaccio a inizio serata',
      'Scrivi un indizio di una sola parola senza farti scoprire',
      "Se l'Impostore viene smascherato, può ancora vincere indovinando la parola!"
    ],
    rules: ['Tutti vedono la parola segreta, tranne uno', 'Dai un indizio di una sola parola', 'Vota chi sta fingendo']
  }),
  leggende: show({
    id: 'leggende',
    name: 'Leggende del Quiz',
    subtitle: 'Tutti insieme contro i mostri: ogni risposta giusta è un colpo di spada',
    icon: '🐉',
    color: '#e76f51',
    badge: 'COOPERATIVO · AVVENTURA',
    durationLabel: '12–18 min',
    available: true,
    category: 'trivia',
    minPlayers: 2,
    maxPlayers: 8,
    highlights: [
      'Quiz cooperativo: si vince o si perde tutti insieme',
      'Negozio di pozioni, bombe e scudi tra un mostro e l’altro',
      'Sconfiggi il drago finale prima di finire i cuori'
    ],
    rules: ['Rispondi giusto per colpire il mostro', 'Se sbagliate in tanti, il mostro attacca', 'Battete il boss finale']
  }),
  guastafeste: show({
    id: 'guastafeste',
    name: 'Guastafeste',
    subtitle: 'Rovina le cose belle, poi prova a rimetterle a posto',
    icon: '💥',
    color: '#f15bb5',
    badge: 'BATTUTE · 1 CONTRO 1',
    durationLabel: '15–20 min',
    available: true,
    category: 'parole',
    minPlayers: 3,
    maxPlayers: 8,
    highlights: [
      'Sfide di battute 1 contro 1, vota il pubblico',
      'Tre round: rovina, il tuo preferito, ripara',
      'Vittoria schiacciante se prendi tutti i voti'
    ],
    rules: ['Scrivi la battuta migliore per il tema', 'Sfida un avversario 1 contro 1', 'Il pubblico vota la più divertente']
  }),
  fila: show({
    id: 'fila',
    name: 'Fila Indiana',
    subtitle: 'Metti tutto nell’ordine giusto prima che scada il tempo',
    icon: '🧩',
    color: '#4895ef',
    badge: 'TRIVIA · ORDINE',
    durationLabel: '6–8 min',
    available: true,
    category: 'trivia',
    minPlayers: 2,
    maxPlayers: 16,
    highlights: [
      'Dal più antico al più recente, dal più vicino al più lontano…',
      'Trascina le voci sul telefono per ordinarle',
      'Bonus per la fila perfetta'
    ],
    rules: ['Leggi il criterio sulla TV', 'Ordina le voci sul telefono', 'Punti per ogni posizione giusta']
  }),
  social: show({
    id: 'social',
    name: 'Chi di Noi?',
    subtitle: 'Domande scomode, affinità di gruppo e votazioni col selfie',
    icon: '⚖️',
    color: '#4cc9f0',
    badge: 'SOCIAL & CONSENSO',
    durationLabel: '8–10 min',
    available: true,
    category: 'social',
    minPlayers: 3,
    maxPlayers: 12,
    highlights: [
      'Zero cultura generale: il tema siete voi e i vostri amici',
      'Vota toccando i selfie dei giocatori sul tuo smartphone',
      'Fai punti se voti come la maggioranza del divano'
    ],
    rules: ['Leggi la domanda «Chi di noi…?»', 'Vota un amico', 'Punti se voti come la maggioranza']
  }),
  sondaggi: show({
    id: 'sondaggi',
    name: 'Miniera dei Sondaggi',
    subtitle: 'Indovina cosa ha scelto la maggioranza del gruppo',
    icon: '⛏️',
    color: '#b5838d',
    badge: 'SOCIAL · SONDAGGI',
    durationLabel: '8–10 min',
    available: true,
    category: 'social',
    minPlayers: 3,
    maxPlayers: 10,
    highlights: [
      'Prima rispondi a un sondaggio sui gusti del gruppo',
      'Poi indovina la top 3 della maggioranza',
      'Chi conosce meglio gli amici scava più in profondità'
    ],
    rules: ['Scegli le tue 3 risposte preferite', 'Indovina la top 3 del gruppo', 'Più indovini, più punti']
  }),
  creative: show({
    id: 'creative',
    name: 'Scarabocchi Animati',
    subtitle: 'Disegna in due fotogrammi, poi inventa titoli falsi',
    icon: '🎨',
    color: '#c77dff',
    badge: 'DISEGNO · BLUFF',
    durationLabel: '12–18 min',
    available: true,
    category: 'disegno',
    minPlayers: 3,
    maxPlayers: 8,
    highlights: [
      'Lavagna tattile sul telefono: non serve saper disegnare!',
      'Il tuo disegno si anima sulla TV',
      'Gli altri inventano titoli falsi: trova quello vero'
    ],
    rules: ['Disegna il tema segreto in 2 fotogrammi', 'Inventa titoli falsi per i disegni altrui', 'Trova il titolo vero']
  }),
  colpevole: show({
    id: 'colpevole',
    name: 'Il Colpevole',
    subtitle: 'Uno di voi ha combinato il guaio: gli indizi sono le vostre risposte',
    icon: '🔍',
    color: '#6d597a',
    badge: 'DEDUZIONE · SEGRETI',
    durationLabel: '12–15 min',
    available: true,
    category: 'bluff',
    minPlayers: 4,
    maxPlayers: 8,
    highlights: [
      'Rispondi a un sondaggio: le risposte diventano indizi',
      'Il colpevole può falsificare una sua risposta',
      'Alibi, sospetti e accusa finale'
    ],
    rules: ['Rispondi al sondaggio', 'Leggi gli indizi e difenditi', 'Accusa il colpevole']
  }),
  smistatori: show({
    id: 'smistatori',
    name: 'Smistatori',
    subtitle: 'Due squadre, due categorie, parole a raffica: smista più veloce!',
    icon: '🗂️',
    color: '#43aa8b',
    badge: 'SQUADRE · VELOCITÀ',
    durationLabel: '6–8 min',
    available: true,
    category: 'squadre',
    minPlayers: 4,
    maxPlayers: 16,
    highlights: [
      'Ogni parola arriva su un solo telefono della squadra',
      'Suggerite a voce: sinistra o destra?',
      'Serie di risposte giuste = punti doppi'
    ],
    rules: ['Le parole arrivano sul telefono', 'Smistale a sinistra o a destra', 'La squadra più precisa vince']
  })
};

export const SHOW_IDS = Object.keys(SHOWS) as ShowId[];

export function isShowId(id: unknown): id is ShowId {
  return typeof id === 'string' && (SHOW_IDS as string[]).includes(id);
}

export function getShowMeta(id?: ShowId | string | null): ShowMeta {
  return isShowId(id) ? SHOWS[id] : SHOWS.quiz;
}

// ---------------------------------------------------------------- menù del Pack

/** Schermata del menù: copertina del pack → griglia delle cartucce → scheda di un gioco. */
export type MenuView = 'cover' | 'grid' | 'detail';

/** Stato del menù, condiviso tra TV e telefoni (lo pilota il capo stanza o lo schermo principale). */
export interface MenuState {
  view: MenuView;
  /** Cartuccia evidenziata nella griglia / aperta nel dettaglio. */
  focus: ShowId;
}

export function isMenuView(v: unknown): v is MenuView {
  return v === 'cover' || v === 'grid' || v === 'detail';
}

// ---------------------------------------------------------------- stato comune dei giochi

/** Riga della classifica finale, comune a tutti gli Show. */
export interface ShowRanking {
  playerId: string;
  points: number;
}

/** Ultimo passo di ogni Show (tranne il quiz): classifica, poi ritorno automatico al menù. */
export interface ShowFinal {
  step: 'final';
  ranking: ShowRanking[];
}

export const SHOW_FINAL_MS = 15_000;
