// Parole segrete dell'Impostore, per categoria. `clues`: indizi tipici usati dai bot della squadra;
// `generic`: indizi vaghi che usa un bot impostore (conosce solo la categoria).

export interface ImpostorCategory {
  name: string;
  generic: string[];
  words: { word: string; clues: string[] }[];
}

export const IMPOSTOR_CATEGORIES: readonly ImpostorCategory[] = [
  {
    name: 'Animali',
    generic: ['zampe', 'pelo', 'natura', 'zoo', 'verso'],
    words: [
      { word: 'Gatto', clues: ['baffi', 'fusa', 'miagolio', 'topo'] },
      { word: 'Elefante', clues: ['proboscide', 'zanne', 'enorme', 'africa'] },
      { word: 'Pinguino', clues: ['ghiaccio', 'polo', 'smoking', 'goffo'] },
      { word: 'Giraffa', clues: ['collo', 'macchie', 'alta', 'savana'] },
      { word: 'Squalo', clues: ['pinna', 'denti', 'oceano', 'paura'] },
      { word: 'Cane', clues: ['osso', 'guinzaglio', 'cuccia', 'abbaio'] }
    ]
  },
  {
    name: 'Cibo',
    generic: ['gusto', 'piatto', 'fame', 'cena', 'buono'],
    words: [
      { word: 'Pizza', clues: ['forno', 'mozzarella', 'napoli', 'fetta'] },
      { word: 'Sushi', clues: ['riso', 'giappone', 'bacchette', 'crudo'] },
      { word: 'Gelato', clues: ['cono', 'freddo', 'gusti', 'cucchiaino'] },
      { word: 'Lasagne', clues: ['besciamella', 'ragù', 'strati', 'domenica'] },
      { word: 'Cioccolato', clues: ['cacao', 'tavoletta', 'fondente', 'pasqua'] },
      { word: 'Panino', clues: ['pane', 'imbottito', 'prosciutto', 'merenda'] }
    ]
  },
  {
    name: 'Luoghi',
    generic: ['gente', 'edificio', 'città', 'entrare', 'posto'],
    words: [
      { word: 'Spiaggia', clues: ['sabbia', 'ombrellone', 'onde', 'abbronzatura'] },
      { word: 'Ospedale', clues: ['medico', 'barella', 'ambulanza', 'reparto'] },
      { word: 'Scuola', clues: ['banco', 'compiti', 'campanella', 'lavagna'] },
      { word: 'Aeroporto', clues: ['volo', 'valigia', 'gate', 'decollo'] },
      { word: 'Cinema', clues: ['film', 'popcorn', 'schermo', 'poltrona'] },
      { word: 'Palestra', clues: ['pesi', 'sudore', 'tapis', 'muscoli'] }
    ]
  },
  {
    name: 'Oggetti',
    generic: ['casa', 'usare', 'mano', 'comprare', 'utile'],
    words: [
      { word: 'Ombrello', clues: ['pioggia', 'aprire', 'manico', 'bagnato'] },
      { word: 'Forbici', clues: ['tagliare', 'lame', 'carta', 'punta'] },
      { word: 'Specchio', clues: ['riflesso', 'vetro', 'trucco', 'immagine'] },
      { word: 'Chitarra', clues: ['corde', 'plettro', 'accordi', 'rock'] },
      { word: 'Orologio', clues: ['lancette', 'polso', 'ticchettio', 'sveglia'] },
      { word: 'Candela', clues: ['fiamma', 'cera', 'stoppino', 'torta'] }
    ]
  },
  {
    name: 'Mestieri',
    generic: ['lavoro', 'divisa', 'stipendio', 'turno', 'attrezzi'],
    words: [
      { word: 'Pompiere', clues: ['fuoco', 'idrante', 'sirena', 'scala'] },
      { word: 'Cuoco', clues: ['pentole', 'ricetta', 'grembiule', 'cucina'] },
      { word: 'Dentista', clues: ['denti', 'trapano', 'carie', 'apribocca'] },
      { word: 'Pilota', clues: ['aereo', 'cabina', 'decollo', 'hostess'] },
      { word: 'Postino', clues: ['lettere', 'pacchi', 'cassetta', 'francobollo'] },
      { word: 'Astronauta', clues: ['spazio', 'razzo', 'luna', 'tuta'] }
    ]
  },
  {
    name: 'Sport',
    generic: ['squadra', 'gara', 'partita', 'allenamento', 'vincere'],
    words: [
      { word: 'Tennis', clues: ['racchetta', 'pallina', 'set', 'wimbledon'] },
      { word: 'Nuoto', clues: ['piscina', 'cuffia', 'vasca', 'bracciate'] },
      { word: 'Sci', clues: ['neve', 'piste', 'bastoncini', 'slalom'] },
      { word: 'Basket', clues: ['canestro', 'palleggio', 'rimbalzo', 'tripla'] },
      { word: 'Pallavolo', clues: ['schiacciata', 'muro', 'battuta', 'bagher'] },
      { word: 'Boxe', clues: ['guantoni', 'ring', 'pugno', 'gancio'] }
    ]
  }
];
