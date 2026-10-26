// «Duello al Tavolo»: affermazioni lampo vere o false (cultura generale facile, da leggere in un attimo).

export interface Fact {
  text: string;
  truth: boolean;
}

const f = (truth: boolean, text: string): Fact => ({ text, truth });

export const DUELLO_FACTS: Fact[] = [
  f(true, 'L’Australia è più grande della Luna?'),
  f(false, 'I ragni hanno 6 zampe?'),
  f(true, 'Il cuore umano ha 4 cavità?'),
  f(false, 'Roma è la capitale della Spagna?'),
  f(true, 'L’acqua bolle a 100 °C al livello del mare?'),
  f(false, 'Un triangolo ha 4 lati?'),
  f(true, 'Le api producono il miele?'),
  f(false, 'Il Sole gira intorno alla Terra?'),
  f(true, 'Una settimana ha 7 giorni?'),
  f(false, 'Il pinguino sa volare?'),
  f(true, 'La balena è un mammifero?'),
  f(false, 'Il Po sfocia nel Tirreno?'),
  f(true, 'Il Monte Bianco è in Europa?'),
  f(false, 'Un anno ha 13 mesi?'),
  f(true, 'L’arcobaleno ha 7 colori?'),
  f(false, 'Il pomodoro è blu?'),
  f(true, 'La Torre di Pisa è in Toscana?'),
  f(false, 'I pesci respirano con i polmoni?'),
  f(true, 'Il ghiaccio galleggia sull’acqua?'),
  f(false, 'Il cane è un rettile?'),
  f(true, 'Marte è chiamato il pianeta rosso?'),
  f(false, 'L’Italia confina con la Spagna?'),
  f(true, 'Le farfalle nascono da un bruco?'),
  f(false, 'Il Polo Nord è caldo?'),
  f(true, 'Un esagono ha 6 lati?'),
  f(false, 'Venezia è in Sicilia?'),
  f(true, 'La Luna gira intorno alla Terra?'),
  f(false, 'Il latte di mucca è verde?'),
  f(true, 'Il calcio si gioca in 11 per squadra?'),
  f(false, 'Il polpo ha 10 tentacoli?'),
  f(true, 'L’oro è un metallo?'),
  f(false, 'Una ora ha 100 minuti?'),
  f(true, 'Il Sahara è un deserto?'),
  f(false, 'Le giraffe hanno il collo corto?'),
  f(true, 'Il leone è un felino?'),
  f(false, 'Napoli è in Lombardia?'),
  f(true, 'Le rane sono anfibi?'),
  f(false, 'Il Natale è il 25 marzo?'),
  f(true, 'Un minuto ha 60 secondi?'),
  f(false, 'La neve è calda?')
];

/** Colori per il test di Stroop (nome scritto e colore dell'inchiostro). */
export const STROOP_COLORS: { name: string; hex: string }[] = [
  { name: 'ROSSO', hex: '#ff4d6d' },
  { name: 'BLU', hex: '#4895ef' },
  { name: 'VERDE', hex: '#52d273' },
  { name: 'GIALLO', hex: '#ffd60a' },
  { name: 'VIOLA', hex: '#b388ff' }
];
