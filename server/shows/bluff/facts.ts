// Fatti di Fuffa d'Autore. Regole: il fatto deve essere VERO e verificabile; le bugie della casa
// devono essere FALSE (attenzione ai casi in cui anche una "bugia" è vera, es. l'isola dei gatti).

export interface BluffFact {
  id: string;
  /** Il fatto con "___" al posto della risposta. */
  text: string;
  answer: string;
  /** Bugie della casa: salvagente per chi non ha idee e riempitivo delle opzioni. */
  lies: string[];
}

export const BLUFF_FACTS: readonly BluffFact[] = [
  { id: 'google', text: 'Il primo nome del motore di ricerca Google era «___».', answer: 'BackRub', lies: ['CercaTutto', 'BigIndex', 'Googolplex'] },
  { id: 'topolino', text: 'Walt Disney voleva chiamare Topolino «___ Mouse».', answer: 'Mortimer', lies: ['Marvin', 'Rupert', 'Oswald'] },
  { id: 'okunoshima', text: 'In Giappone c’è un’isola famosa perché è piena di ___ selvatici.', answer: 'conigli', lies: ['pinguini', 'pappagalli', 'fenicotteri'] },
  { id: 'fenicotteri', text: 'I fenicotteri devono il loro colore rosa ai ___ che mangiano.', answer: 'gamberetti', lies: ['fiori', 'coralli', 'lamponi'] },
  { id: 'robot', text: 'La parola «robot» viene da un termine ceco che significa ___.', answer: 'lavoro forzato', lies: ['uomo di ferro', 'pupazzo', 'macchina pensante'] },
  { id: 'eiffel', text: 'In estate, con il caldo, la Torre Eiffel può allungarsi di circa 15 ___.', answer: 'centimetri', lies: ['millimetri', 'pollici', 'metri'] },
  { id: 'carroll', text: 'Lewis Carroll, l’autore di «Alice nel Paese delle Meraviglie», era anche un ___.', answer: 'matematico', lies: ['pugile', 'orologiaio', 'farmacista'] },
  { id: 'luna', text: 'Gli astronauti dell’Apollo dicevano che la polvere lunare odorava di ___.', answer: 'polvere da sparo', lies: ['cannella', 'caffè', 'pioggia'] },
  { id: 'tifoso', text: 'La parola «tifoso» deriva dal nome di una ___.', answer: 'malattia', lies: ['trombetta', 'danza napoletana', 'bandiera'] },
  { id: 'banane', text: 'Le banane sono leggermente ___ perché contengono potassio.', answer: 'radioattive', lies: ['magnetiche', 'salate', 'elettriche'] },
  { id: 'ebay', text: 'Il primo oggetto venduto su eBay fu un ___ rotto.', answer: 'puntatore laser', lies: ['telecomando', 'orologio', 'mouse'] },
  { id: 'miele', text: 'Se conservato bene, il miele non ___ mai.', answer: 'scade', lies: ['cristallizza', 'cambia colore', 'perde il profumo'] },
  { id: 'napoleone', text: 'Durante una battuta di caccia, Napoleone fu assalito da un’orda di ___.', answer: 'conigli', lies: ['cinghiali', 'cani da caccia', 'oche'] },
  { id: 'steamboat', text: 'Il primo cartone sonoro di Topolino si intitola «Steamboat ___».', answer: 'Willie', lies: ['Jack', 'Bill', 'Johnny'] },
  { id: 'polpi', text: 'I polpi hanno ___ cuori.', answer: 'tre', lies: ['due', 'quattro', 'cinque'] },
  { id: 'cocacola', text: 'All’inizio la Coca-Cola veniva venduta come ___.', answer: 'medicina', lies: ['colla', 'tinta per capelli', 'detersivo'] },
  { id: 'venere', text: 'Su Venere un giorno dura più di un ___.', answer: 'anno', lies: ['mese', 'inverno', 'secolo'] },
  { id: 'nutella', text: 'Il «World Nutella Day» si festeggia ogni anno il 5 ___.', answer: 'febbraio', lies: ['marzo', 'maggio', 'dicembre'] },
  { id: 'romani', text: 'Gli antichi Romani si sciacquavano la bocca con ___.', answer: 'urina', lies: ['aceto', 'vino', 'latte d’asina'] },
  { id: 'tintin', text: 'Nell’edizione italiana, il cane di Tintin si chiama ___.', answer: 'Milù', lies: ['Fido', 'Bobby', 'Pippo'] },
  { id: 'scozia', text: 'L’animale nazionale della Scozia è l’___.', answer: 'unicorno', lies: ['aquila', 'orso', 'airone'] },
  { id: 'nepal', text: 'La bandiera del Nepal non è rettangolare: ha la forma di due ___ sovrapposti.', answer: 'triangoli', lies: ['cerchi', 'quadrati', 'rombi'] },
  { id: 'margherita', text: 'La pizza margherita prende il nome da una ___.', answer: 'regina', lies: ['cantante', 'nave', 'pizzaiola'] },
  { id: 'fulmine', text: 'Un fulmine è circa ___ volte più caldo della superficie del Sole.', answer: 'cinque', lies: ['due', 'dieci', 'cento'] },
  { id: 'abba', text: 'Il gruppo ABBA prende il nome dalle ___ dei suoi componenti.', answer: 'iniziali', lies: ['città', 'canzoni', 'auto'] }
];
