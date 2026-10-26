// Catalogo degli 8 giochi «Passa-il-Telefono»: cartucce del menù, regole in 3 punti e opzioni del sottomenù.

import type { PassCategory, PassGameId, PassGameMeta, PassOption } from './types';

export const PASS_CATEGORIES: Record<PassCategory, { label: string; icon: string }> = {
  azione: { label: 'Azione & Mimo', icon: '🎭' },
  parole: { label: 'Parole & Velocità', icon: '🔥' },
  ruoli: { label: 'Ruoli Segreti', icon: '🕵️' },
  intuito: { label: 'Sfide & Intuito', icon: '🎯' },
  social: { label: 'Tra Amici', icon: '🎙️' },
  disegno: { label: 'Disegno', icon: '🎨' },
  riflessi: { label: 'Riflessi', icon: '⚡' }
};

const opt = (id: string, label: string, hint: string, choices: [string, string][], def: string): PassOption => ({
  id,
  label,
  hint,
  choices: choices.map(([cid, clabel]) => ({ id: cid, label: clabel })),
  default: def
});

export const PASS_GAMES: Record<PassGameId, PassGameMeta> = {
  fronte: {
    id: 'fronte',
    name: 'Parola in Fronte',
    icon: '🎭',
    subtitle: 'Indovina la parola che hai sulla fronte',
    category: 'azione',
    posture: '📲 In fronte',
    minPlayers: 2,
    maxPlayers: 16,
    duration: '3–6 min',
    color: '#ff9f1c',
    rules: [
      'Chi è di turno tiene il telefono sulla fronte, con lo schermo verso gli amici',
      'Gli amici aiutano (a parole, a mimo o evitando le parole vietate)',
      'Tocca la metà destra se indovini, la sinistra per passare'
    ],
    options: [
      opt('mode', 'Modalità', 'Come possono aiutare gli amici.', [['indizi', '🗣️ Indizi liberi'], ['mimo', '🤐 Solo mimo'], ['tabu', '🚫 Tabù']], 'indizi'),
      opt('time', 'Durata del turno', 'Secondi a disposizione per ogni turno.', [['45', '45 s'], ['60', '60 s'], ['90', '90 s']], '60'),
      opt('turns', 'Turni a testa', 'Quante volte tocca a ognuno.', [['1', '1'], ['2', '2'], ['3', '3']], '1'),
      opt('pack', 'Parole', 'Da quale mazzo pescare.', [['mix', '🎲 Tutto'], ['pop', '🎬 Cultura pop'], ['casa', '🍝 Cibo & casa'], ['natura', '🦁 Animali & natura'], ['difficile', '🧠 Difficile']], 'mix')
    ]
  },
  bomba: {
    id: 'bomba',
    name: 'Bomba Verbale',
    icon: '💣',
    subtitle: 'Rispondi e passa la bomba prima del BOOM',
    category: 'parole',
    posture: '🔄 Passa in cerchio',
    minPlayers: 2,
    maxPlayers: 16,
    duration: '4–8 min',
    color: '#ff4d6d',
    rules: [
      'Leggi l’innesco, di’ una parola valida ad alta voce',
      'Tocca «Passa la bomba» e dai il telefono al vicino indicato',
      'La miccia è segreta: chi ha il telefono al BOOM perde una vita'
    ],
    options: [
      opt('lives', 'Vite', 'Vite di ogni giocatore.', [['2', '❤️ 2'], ['3', '❤️ 3'], ['4', '❤️ 4'], ['5', '❤️ 5']], '3'),
      opt('trigger', 'Innesco', 'Che tipo di sfida esce.', [['mix', '🎲 Misto'], ['sillabe', '🔤 Sillabe'], ['categorie', '🗂️ Categorie'], ['catena', '🔗 Catena']], 'mix'),
      opt('fuse', 'Miccia', 'Quanto dura (in segreto) prima di esplodere.', [['corta', '⚡ Corta'], ['normale', '⏱️ Normale'], ['lunga', '🐢 Lunga']], 'normale')
    ]
  },
  impostore: {
    id: 'impostore',
    name: 'L’Impostore Tascabile',
    icon: '🕵️',
    subtitle: 'Uno di voi non conosce la parola segreta',
    category: 'ruoli',
    posture: '🕵️ Giro segreto',
    minPlayers: 3,
    maxPlayers: 16,
    duration: '5–10 min',
    color: '#c77dff',
    rules: [
      'Il telefono fa il giro: tieni premuto per leggere la tua carta in segreto',
      'Posate il telefono al centro: un indizio a voce a testa, poi discussione',
      'Votate l’impostore; se lo scoprite, ha un’ultima possibilità di indovinare'
    ],
    options: [
      opt('mode', 'Variante', 'Classico: l’impostore sa di esserlo. Camaleonte: ha una parola simile e non lo sa.', [['classico', '🕵️ Classico'], ['camaleonte', '🦎 Camaleonte']], 'classico'),
      opt('impostors', 'Impostori', '2 impostori solo da 6 giocatori in su.', [['1', '1'], ['2', '2']], '1'),
      opt('talk', 'Discussione', 'Tempo per discutere prima del voto.', [['90', '1:30'], ['150', '2:30'], ['240', '4:00']], '150'),
      opt('rounds', 'Partite', 'Quante partite di fila.', [['1', '1'], ['3', '3'], ['5', '5']], '3')
    ]
  },
  panico: {
    id: 'panico',
    name: '5 Secondi di Panico',
    icon: '⏱️',
    subtitle: 'Tre risposte in cinque secondi!',
    category: 'parole',
    posture: '🤲 In mano al lettore',
    minPlayers: 2,
    maxPlayers: 16,
    duration: '4–8 min',
    color: '#ffd60a',
    rules: [
      'Il vicino legge ad alta voce la sfida «Cita 3…»',
      'Appena finisce tocca «VIA!»: hai pochi secondi per dire 3 risposte',
      'Se sbagli, la stessa sfida passa al prossimo (con risposte diverse!)'
    ],
    options: [
      opt('turns', 'Turni a testa', 'Quante sfide tocca a ognuno.', [['1', '1'], ['2', '2'], ['3', '3']], '2'),
      opt('seconds', 'Secondi', 'Tempo per le 3 risposte.', [['4', '4 s · difficile'], ['5', '5 s'], ['7', '7 s · facile']], '5')
    ]
  },
  onda: {
    id: 'onda',
    name: 'Lunghezza d’Onda',
    icon: '📡',
    subtitle: 'Un indizio, un bersaglio nascosto',
    category: 'intuito',
    posture: '🔁 Dal sensitivo al tavolo',
    minPlayers: 2,
    maxPlayers: 16,
    duration: '6–10 min',
    color: '#4cc9f0',
    rules: [
      'Il sensitivo guarda in segreto dov’è il bersaglio tra due opposti',
      'Dice un solo indizio a voce; il tavolo sposta l’ago dove pensa che sia',
      'Più l’ago è vicino al bersaglio, più punti per sensitivo e tavolo'
    ],
    options: [
      opt('rounds', 'Giri', 'Quante volte fa il sensitivo ognuno.', [['1', '1'], ['2', '2']], '1'),
      opt('bet', 'Scommessa', 'Il vicino del sensitivo scommette se il bersaglio è più a sinistra o a destra dell’ago.', [['on', '✅ Sì'], ['off', '🚫 No']], 'on')
    ]
  },
  tribunale: {
    id: 'tribunale',
    name: 'Il Tribunale degli Amici',
    icon: '🎙️',
    subtitle: 'Chi di noi…? 3, 2, 1… indica!',
    category: 'social',
    posture: '⚡ Al centro del tavolo',
    minPlayers: 3,
    maxPlayers: 16,
    duration: '5–10 min',
    color: '#06d6a0',
    rules: [
      'Il giudice di turno prevede in segreto chi verrà indicato da tutti',
      'Al «3, 2, 1… INDICA!» ognuno punta il dito su un amico',
      'Il giudice che indovina il verdetto prende 2 punti; con l’unanimità +1 a tutti'
    ],
    options: [opt('questions', 'Domande', 'Quante domande in tutto.', [['6', '6'], ['10', '10'], ['15', '15']], '10')]
  },
  catena: {
    id: 'catena',
    name: 'Catena Scarabocchiata',
    icon: '🎨',
    subtitle: 'Il telefono senza fili… disegnato',
    category: 'disegno',
    posture: '🔄 Passa in cerchio',
    minPlayers: 3,
    maxPlayers: 12,
    duration: '5–10 min',
    color: '#ff85a1',
    rules: [
      'Il primo sceglie una frase; il secondo la disegna in pochi secondi',
      'Il terzo vede solo il disegno e scrive cosa crede che sia, e così via',
      'Alla fine si guarda tutta la catena e si premiano capolavoro e fraintendimento'
    ],
    options: [
      opt('draw', 'Tempo per disegnare', 'Secondi per ogni disegno.', [['20', '20 s'], ['25', '25 s'], ['40', '40 s']], '25'),
      opt('start', 'Frase iniziale', 'Inventata dal primo giocatore o pescata a caso.', [['random', '🎲 A caso'], ['write', '✍️ La scrivo io']], 'random')
    ]
  },
  duello: {
    id: 'duello',
    name: 'Duello al Tavolo',
    icon: '⚡',
    subtitle: '1 contro 1, telefono piatto in mezzo',
    category: 'riflessi',
    posture: '⚡ Piatto tra due sfidanti',
    minPlayers: 2,
    maxPlayers: 16,
    duration: '3–6 min',
    color: '#ffd60a',
    rules: [
      'Posa il telefono piatto tra i due sfidanti: ognuno ha la sua metà',
      'Se la frase al centro è VERA, colpisci per primo il tuo bottone: +1',
      'Se è FALSA e premi, perdi un punto. Chi vince resta campione'
    ],
    options: [
      opt('target', 'Punti per vincere', 'A quanti punti finisce un duello.', [['3', '3'], ['5', '5'], ['7', '7']], '5'),
      opt('speed', 'Velocità', 'Ogni quanto cambia la frase.', [['slow', '🐢 Lenta'], ['normal', '⏱️ Normale'], ['fast', '⚡ Veloce']], 'normal')
    ]
  }
};

export const PASS_GAME_IDS = Object.keys(PASS_GAMES) as PassGameId[];

export function isPassGameId(v: unknown): v is PassGameId {
  return typeof v === 'string' && v in PASS_GAMES;
}

/** Tiene solo regole e scelte esistenti; quelle mancanti prendono il valore predefinito. */
export function sanitizePassOptions(id: PassGameId, input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  for (const o of PASS_GAMES[id].options) {
    const v = src[o.id];
    out[o.id] = typeof v === 'string' && o.choices.some((c) => c.id === v) ? v : o.default;
  }
  return out;
}

/** Perché il gioco non può partire con questi giocatori (stringa vuota = si può). */
export function passStartProblem(id: PassGameId, players: number): string {
  const m = PASS_GAMES[id];
  if (players < m.minPlayers) return `Servono almeno ${m.minPlayers} giocatori al tavolo.`;
  if (players > m.maxPlayers) return `«${m.name}» si gioca al massimo in ${m.maxPlayers}.`;
  return '';
}
