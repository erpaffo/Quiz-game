// Coppie di categorie degli Smistatori. Solo parole che stanno senza ambiguità in UNA categoria
// (esclusi casi dubbi come pomodoro, Apollo, pianoforte).

export interface SmistPair {
  left: string;
  right: string;
  words: { text: string; side: 'left' | 'right' }[];
}

const pair = (left: string, right: string, l: string[], r: string[]): SmistPair => ({
  left,
  right,
  words: [...l.map((text) => ({ text, side: 'left' as const })), ...r.map((text) => ({ text, side: 'right' as const }))]
});

export const SMIST_PAIRS: readonly SmistPair[] = [
  pair(
    'Mammifero',
    'Uccello',
    ['Pipistrello', 'Delfino', 'Balena', 'Ornitorinco', 'Foca', 'Cavallo', 'Lontra', 'Koala'],
    ['Pinguino', 'Struzzo', 'Kiwi', 'Gallina', 'Aquila', 'Colibrì', 'Pellicano', 'Gufo']
  ),
  pair(
    'Frutta',
    'Verdura',
    ['Mela', 'Banana', 'Ciliegia', 'Kiwi', 'Ananas', 'Fragola', 'Mango', 'Pesca'],
    ['Carota', 'Spinaci', 'Cavolfiore', 'Sedano', 'Lattuga', 'Porro', 'Broccolo', 'Carciofo']
  ),
  pair(
    'Capitale europea',
    'Capitale extraeuropea',
    ['Lisbona', 'Vienna', 'Oslo', 'Dublino', 'Varsavia', 'Atene', 'Praga', 'Helsinki'],
    ['Ottawa', 'Canberra', 'Brasilia', 'Nairobi', 'Lima', 'Hanoi', 'Il Cairo', 'Santiago']
  ),
  pair(
    'Strumento a corde',
    'Strumento a fiato',
    ['Violino', 'Chitarra', 'Arpa', 'Violoncello', 'Mandolino', 'Contrabbasso', 'Liuto', 'Banjo'],
    ['Flauto', 'Tromba', 'Clarinetto', 'Sassofono', 'Oboe', 'Trombone', 'Fagotto', 'Tuba']
  ),
  pair(
    'Divinità greca',
    'Divinità romana',
    ['Zeus', 'Atena', 'Ares', 'Afrodite', 'Ermes', 'Poseidone', 'Artemide', 'Efesto'],
    ['Giove', 'Minerva', 'Marte', 'Venere', 'Mercurio', 'Nettuno', 'Diana', 'Vulcano']
  ),
  pair(
    'Pianeta',
    'Stella',
    ['Marte', 'Giove', 'Saturno', 'Venere', 'Nettuno', 'Urano', 'Mercurio', 'Terra'],
    ['Sirio', 'Betelgeuse', 'Vega', 'Sole', 'Stella Polare', 'Rigel', 'Aldebaran', 'Antares']
  )
];
