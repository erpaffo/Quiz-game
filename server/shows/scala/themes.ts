// Temi della Scala del Nonsenso. low/mid/high: risposte di esempio usate dai bot (≈ 2, 5, 9 sulla scala).

import type { ScalaTheme } from '../../../shared/scala';

export interface ScalaThemeDef extends ScalaTheme {
  low: string;
  mid: string;
  high: string;
}

export const SCALA_THEMES: readonly ScalaThemeDef[] = [
  { text: 'Una scusa per arrivare in ritardo', scale: 'credibile', low: 'Mi hanno rapito gli alieni', mid: 'Non trovavo le chiavi', high: 'C’era un incidente in tangenziale' },
  { text: 'Un regalo per il compleanno della nonna', scale: 'azzeccato', low: 'Un tatuaggio', mid: 'Un buono Amazon', high: 'Un album con le foto dei nipoti' },
  { text: 'Un nome per un cane', scale: 'adatto', low: 'Ragionier Bianchi', mid: 'Pippo', high: 'Fido' },
  { text: 'Una cosa da dire al primo appuntamento', scale: 'romantica', low: 'Dividiamo il conto al centesimo', mid: 'Che bel ristorante', high: 'Ti guardavo già da mesi' },
  { text: 'Un lavoro', scale: 'pericoloso', low: 'Bibliotecario', mid: 'Pizzaiolo', high: 'Domatore di leoni' },
  { text: 'Un piatto', scale: 'italiano', low: 'Sushi al ketchup', mid: 'Pasta all’ananas', high: 'Lasagne della nonna' },
  { text: 'Un posto per una vacanza', scale: 'rilassante', low: 'Un trasloco a Ferragosto', mid: 'Una città d’arte', high: 'Un’amaca alle Maldive' },
  { text: 'Un superpotere', scale: 'utile', low: 'Far diventare blu i semafori', mid: 'Parlare con i piccioni', high: 'Teletrasporto' },
  { text: 'Un motivo per lasciare qualcuno', scale: 'serio', low: 'Mette il latte prima dei cereali', mid: 'Russa fortissimo', high: 'Mi ha mentito per anni' },
  { text: 'Un film da vedere con i suoceri', scale: 'imbarazzante', low: 'Un cartone Disney', mid: 'Una commedia romantica', high: 'Un horror con scene di nudo' },
  { text: 'Un animale da tenere in casa', scale: 'strano', low: 'Gatto', mid: 'Furetto', high: 'Coccodrillo' },
  { text: 'Una cosa da portare su un’isola deserta', scale: 'intelligente', low: 'Un ferro da stiro', mid: 'Un libro', high: 'Un coltellino svizzero' },
  { text: 'Un modo di dire "ti voglio bene"', scale: 'sdolcinato', low: 'Ok', mid: 'Sei importante per me', high: 'Sei il mio cucciolotto di zucchero' },
  { text: 'Una cosa da fare la domenica', scale: 'faticosa', low: 'Dormire', mid: 'Fare la spesa', high: 'Correre una maratona' },
  { text: 'Un messaggio da mandare al capo', scale: 'rischioso', low: 'Buongiorno!', mid: 'Domani prendo ferie', high: 'Me ne vado e porto via la stampante' },
  { text: 'Un nome per una band', scale: 'rock', low: 'I Coniglietti Felici', mid: 'Gli Amici del Venerdì', high: 'Tuono Infernale' }
];
