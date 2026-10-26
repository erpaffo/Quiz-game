// «L'Impostore Tascabile»: categorie con parole (variante classica + griglia dell'ultima possibilità)
// e coppie di parole simili per la variante «Camaleonte» (l'infiltrato ha la parola gemella e non lo sa).

import GEN_IMPOSTORE from './generated/impostore.json';
import GEN_CAMALEONTE from './generated/camaleonte.json';

export interface ImpostoreCategory {
  name: string;
  words: string[];
}

const BASE_IMPOSTORE_CATEGORIES: ImpostoreCategory[] = [
  { name: 'Luoghi', words: ['Stazione spaziale', 'Ospedale', 'Spiaggia', 'Scuola', 'Aeroporto', 'Cinema', 'Supermercato', 'Ristorante', 'Museo', 'Palestra', 'Circo', 'Biblioteca'] },
  { name: 'Cibo', words: ['Pizza', 'Sushi', 'Lasagna', 'Gelato', 'Hamburger', 'Tiramisù', 'Risotto', 'Patatine', 'Kebab', 'Cannolo', 'Minestrone', 'Popcorn'] },
  { name: 'Animali', words: ['Leone', 'Pinguino', 'Giraffa', 'Delfino', 'Gatto', 'Cavallo', 'Aquila', 'Serpente', 'Elefante', 'Coniglio', 'Squalo', 'Tartaruga'] },
  { name: 'Mestieri', words: ['Pompiere', 'Medico', 'Cuoco', 'Pilota', 'Maestro', 'Idraulico', 'Astronauta', 'Parrucchiere', 'Poliziotto', 'Contadino', 'Fotografo', 'Dentista'] },
  { name: 'Oggetti di casa', words: ['Divano', 'Frigorifero', 'Lavatrice', 'Ombrello', 'Specchio', 'Forno', 'Lampada', 'Cuscino', 'Scopa', 'Orologio', 'Tostapane', 'Armadio'] },
  { name: 'Sport', words: ['Calcio', 'Tennis', 'Nuoto', 'Sci', 'Pallavolo', 'Boxe', 'Golf', 'Ciclismo', 'Basket', 'Surf', 'Scherma', 'Bowling'] },
  { name: 'Vacanze', words: ['Campeggio', 'Crociera', 'Montagna', 'Città d’arte', 'Villaggio turistico', 'Parco divertimenti', 'Terme', 'Safari', 'Isola deserta', 'Gita in barca', 'Rifugio', 'Agriturismo'] },
  { name: 'Feste', words: ['Natale', 'Capodanno', 'Carnevale', 'Halloween', 'Pasqua', 'Compleanno', 'Matrimonio', 'Laurea', 'Ferragosto', 'Addio al celibato', 'Battesimo', 'San Valentino'] },
  { name: 'Mezzi di trasporto', words: ['Treno', 'Monopattino', 'Aereo', 'Nave', 'Bicicletta', 'Elicottero', 'Tram', 'Taxi', 'Mongolfiera', 'Moto', 'Gondola', 'Razzo'] },
  { name: 'Personaggi', words: ['Babbo Natale', 'Pinocchio', 'Superman', 'Cappuccetto Rosso', 'Dracula', 'Topolino', 'Sherlock Holmes', 'Robin Hood', 'Biancaneve', 'Peter Pan', 'Zorro', 'Frankenstein'] }
];

export interface ChameleonPair {
  category: string;
  /** Parola dei cittadini e parola gemella del camaleonte (si scambiano a caso). */
  words: [string, string];
}

const BASE_CHAMELEON_PAIRS: ChameleonPair[] = [
  { category: 'Luoghi', words: ['Spiaggia', 'Piscina'] },
  { category: 'Luoghi', words: ['Cinema', 'Teatro'] },
  { category: 'Luoghi', words: ['Ospedale', 'Farmacia'] },
  { category: 'Luoghi', words: ['Biblioteca', 'Libreria'] },
  { category: 'Luoghi', words: ['Supermercato', 'Mercato'] },
  { category: 'Luoghi', words: ['Aeroporto', 'Stazione'] },
  { category: 'Luoghi', words: ['Montagna', 'Collina'] },
  { category: 'Luoghi', words: ['Bar', 'Pasticceria'] },
  { category: 'Personaggi', words: ['Batman', 'Spider-Man'] },
  { category: 'Personaggi', words: ['Harry Potter', 'Mago Merlino'] },
  { category: 'Personaggi', words: ['Babbo Natale', 'Befana'] },
  { category: 'Personaggi', words: ['Cenerentola', 'Biancaneve'] },
  { category: 'Personaggi', words: ['Topolino', 'Paperino'] },
  { category: 'Cibo', words: ['Pizza', 'Focaccia'] },
  { category: 'Cibo', words: ['Gelato', 'Granita'] },
  { category: 'Cibo', words: ['Caffè', 'Tè'] },
  { category: 'Cibo', words: ['Lasagna', 'Cannelloni'] },
  { category: 'Cibo', words: ['Cornetto', 'Ciambella'] },
  { category: 'Cibo', words: ['Sushi', 'Poke'] },
  { category: 'Cibo', words: ['Hamburger', 'Hot dog'] },
  { category: 'Cibo', words: ['Vino', 'Birra'] },
  { category: 'Animali', words: ['Cane', 'Lupo'] },
  { category: 'Animali', words: ['Leone', 'Tigre'] },
  { category: 'Animali', words: ['Delfino', 'Balena'] },
  { category: 'Animali', words: ['Cavallo', 'Asino'] },
  { category: 'Animali', words: ['Aquila', 'Falco'] },
  { category: 'Animali', words: ['Coccodrillo', 'Alligatore'] },
  { category: 'Animali', words: ['Ape', 'Vespa'] },
  { category: 'Sport', words: ['Calcio', 'Calcetto'] },
  { category: 'Sport', words: ['Tennis', 'Padel'] },
  { category: 'Sport', words: ['Sci', 'Snowboard'] },
  { category: 'Sport', words: ['Pallavolo', 'Beach volley'] },
  { category: 'Sport', words: ['Basket', 'Pallamano'] },
  { category: 'Oggetti', words: ['Penna', 'Matita'] },
  { category: 'Oggetti', words: ['Chitarra', 'Violino'] },
  { category: 'Oggetti', words: ['Orologio', 'Sveglia'] },
  { category: 'Oggetti', words: ['Ombrello', 'Impermeabile'] },
  { category: 'Oggetti', words: ['Zaino', 'Valigia'] },
  { category: 'Oggetti', words: ['Telefono', 'Tablet'] },
  { category: 'Oggetti', words: ['Forchetta', 'Cucchiaio'] },
  { category: 'Oggetti', words: ['Sedia', 'Sgabello'] },
  { category: 'Mezzi', words: ['Treno', 'Metropolitana'] },
  { category: 'Mezzi', words: ['Bicicletta', 'Monopattino'] },
  { category: 'Mezzi', words: ['Aereo', 'Elicottero'] },
  { category: 'Mezzi', words: ['Nave', 'Traghetto'] },
  { category: 'Feste', words: ['Natale', 'Capodanno'] },
  { category: 'Feste', words: ['Matrimonio', 'Battesimo'] },
  { category: 'Feste', words: ['Halloween', 'Carnevale'] },
  { category: 'Mestieri', words: ['Medico', 'Infermiere'] },
  { category: 'Mestieri', words: ['Cuoco', 'Pizzaiolo'] },
  { category: 'Mestieri', words: ['Pompiere', 'Poliziotto'] },
  { category: 'Mestieri', words: ['Maestro', 'Professore'] }
];

// Contenuti approvati nella banca domande (npm run banca -- costruisci).
export const IMPOSTORE_CATEGORIES: ImpostoreCategory[] = [...BASE_IMPOSTORE_CATEGORIES, ...(GEN_IMPOSTORE as ImpostoreCategory[])];
export const CHAMELEON_PAIRS: ChameleonPair[] = [...BASE_CHAMELEON_PAIRS, ...(GEN_CAMALEONTE as ChameleonPair[])];
