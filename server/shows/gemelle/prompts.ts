// Parole di partenza di Anime Gemelle, con le associazioni usate dai bot.

export interface GemellePrompt {
  word: string;
  /** Associazioni "tipiche": i bot ne scelgono alcune. */
  associations: string[];
}

export const GEMELLE_PROMPTS: readonly GemellePrompt[] = [
  { word: 'Mare', associations: ['spiaggia', 'sole', 'onde', 'sabbia', 'sale', 'pesce', 'estate', 'costume', 'ombrellone', 'barca', 'blu', 'conchiglia'] },
  { word: 'Natale', associations: ['albero', 'regali', 'neve', 'panettone', 'presepe', 'babbo natale', 'famiglia', 'dicembre', 'luci', 'renne', 'pandoro', 'stella'] },
  { word: 'Scuola', associations: ['compiti', 'zaino', 'professore', 'banco', 'lavagna', 'esame', 'voto', 'ricreazione', 'libri', 'compagni', 'interrogazione', 'gita'] },
  { word: 'Pizza', associations: ['mozzarella', 'pomodoro', 'napoli', 'forno', 'margherita', 'basilico', 'impasto', 'pizzeria', 'birra', 'sabato', 'olio', 'diavola'] },
  { word: 'Cane', associations: ['abbaiare', 'osso', 'guinzaglio', 'coda', 'cuccia', 'fedele', 'passeggiata', 'gatto', 'cucciolo', 'pelo', 'zampa', 'amico'] },
  { word: 'Calcio', associations: ['pallone', 'gol', 'stadio', 'arbitro', 'squadra', 'rigore', 'portiere', 'tifosi', 'serie a', 'mondiali', 'fuorigioco', 'maglia'] },
  { word: 'Inverno', associations: ['freddo', 'neve', 'sciarpa', 'cappotto', 'natale', 'ghiaccio', 'camino', 'sci', 'guanti', 'pioggia', 'influenza', 'cioccolata'] },
  { word: 'Cinema', associations: ['film', 'popcorn', 'biglietto', 'attore', 'schermo', 'buio', 'poltrona', 'regista', 'oscar', 'trailer', 'sala', 'pellicola'] },
  { word: 'Cucina', associations: ['pentola', 'forno', 'ricetta', 'chef', 'coltello', 'frigorifero', 'pasta', 'fornelli', 'piatti', 'mestolo', 'sale', 'tavola'] },
  { word: 'Vacanza', associations: ['viaggio', 'valigia', 'mare', 'montagna', 'aereo', 'albergo', 'relax', 'foto', 'estate', 'sole', 'passaporto', 'spiaggia'] },
  { word: 'Musica', associations: ['canzone', 'chitarra', 'concerto', 'cuffie', 'pianoforte', 'cantante', 'note', 'radio', 'ballare', 'disco', 'batteria', 'ritmo'] },
  { word: 'Ospedale', associations: ['medico', 'infermiere', 'malato', 'ambulanza', 'letto', 'siringa', 'pronto soccorso', 'operazione', 'camice', 'visita', 'cura', 'farmaci'] },
  { word: 'Montagna', associations: ['neve', 'sci', 'scarponi', 'vetta', 'baita', 'escursione', 'alpi', 'freddo', 'bosco', 'funivia', 'rifugio', 'roccia'] },
  { word: 'Halloween', associations: ['zucca', 'fantasma', 'strega', 'caramelle', 'dolcetto', 'scherzetto', 'costume', 'paura', 'vampiro', 'ottobre', 'ragno', 'scheletro'] },
  { word: 'Caffè', associations: ['bar', 'tazzina', 'espresso', 'moka', 'zucchero', 'colazione', 'cappuccino', 'mattina', 'caldo', 'amaro', 'latte', 'sveglia'] },
  { word: 'Matrimonio', associations: ['sposa', 'anello', 'chiesa', 'abito', 'torta', 'invitati', 'fiori', 'festa', 'luna di miele', 'bacio', 'fedi', 'confetti'] },
  { word: 'Spazio', associations: ['stelle', 'pianeti', 'astronauta', 'razzo', 'luna', 'galassia', 'alieni', 'sole', 'buio', 'nasa', 'universo', 'satellite'] },
  { word: 'Ufficio', associations: ['computer', 'scrivania', 'capo', 'riunione', 'colleghi', 'stampante', 'caffè', 'email', 'lavoro', 'stipendio', 'sedia', 'telefono'] },
  { word: 'Gelato', associations: ['cono', 'coppetta', 'cioccolato', 'fragola', 'estate', 'freddo', 'gelateria', 'panna', 'pistacchio', 'vaniglia', 'dolce', 'cucchiaino'] },
  { word: 'Supereroe', associations: ['mantello', 'poteri', 'maschera', 'cattivo', 'volare', 'forza', 'fumetto', 'salvare', 'costume', 'superman', 'batman', 'film'] },
  { word: 'Compleanno', associations: ['torta', 'candeline', 'regali', 'festa', 'auguri', 'palloncini', 'amici', 'anni', 'cappellino', 'sorpresa', 'biglietto', 'spumante'] },
  { word: 'Treno', associations: ['binario', 'stazione', 'biglietto', 'ritardo', 'vagone', 'viaggio', 'controllore', 'locomotiva', 'rotaie', 'finestrino', 'pendolare', 'freccia'] }
];

/** Parole generiche per i bot quando il prompt l'ha scelto il gruppo (round 3–4). */
export const GEMELLE_FALLBACK = ['casa', 'amore', 'tempo', 'soldi', 'festa', 'famiglia', 'amici', 'colore', 'cibo', 'viaggio', 'gioco', 'sole'];
