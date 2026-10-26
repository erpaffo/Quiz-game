// Eventi di serie della Macchina del Tempo. Regola: solo date certe e puntuali
// (niente "circa", niente eventi lunghi più anni), tra TEMPO.MIN_YEAR e TEMPO.MAX_YEAR.

export interface TempoEvent {
  id: string;
  text: string;
  year: number;
}

export const TEMPO_EVENTS: readonly TempoEvent[] = [
  { id: 'colombo', text: 'Cristoforo Colombo arriva nelle Americhe', year: 1492 },
  { id: 'muro-berlino', text: 'Cade il Muro di Berlino', year: 1989 },
  { id: 'luna', text: 'Il primo uomo cammina sulla Luna', year: 1969 },
  { id: 'regno-italia', text: "Viene proclamato il Regno d'Italia", year: 1861 },
  { id: 'referendum', text: 'Con un referendum gli italiani scelgono la Repubblica', year: 1946 },
  { id: 'costituzione', text: 'Entra in vigore la Costituzione italiana', year: 1948 },
  { id: 'ww1', text: 'Inizia la Prima guerra mondiale', year: 1914 },
  { id: 'ww2-fine', text: 'Finisce la Seconda guerra mondiale', year: 1945 },
  { id: 'bastiglia', text: 'Presa della Bastiglia a Parigi', year: 1789 },
  { id: 'usa', text: "Gli Stati Uniti dichiarano l'indipendenza", year: 1776 },
  { id: 'titanic', text: 'Affonda il Titanic', year: 1912 },
  { id: 'sanremo', text: 'Prima edizione del Festival di Sanremo', year: 1951 },
  { id: 'mondiali-82', text: "L'Italia vince i Mondiali di calcio in Spagna", year: 1982 },
  { id: 'mondiali-06', text: "L'Italia vince i Mondiali di calcio in Germania", year: 2006 },
  { id: 'iphone', text: 'Viene presentato il primo iPhone', year: 2007 },
  { id: 'google', text: 'Viene fondata Google', year: 1998 },
  { id: 'facebook', text: 'Nasce Facebook', year: 2004 },
  { id: 'euro', text: "Monete e banconote in euro entrano in circolazione in Italia", year: 2002 },
  { id: 'lutero', text: 'Martin Lutero affigge le sue 95 tesi', year: 1517 },
  { id: 'dante', text: 'Muore Dante Alighieri', year: 1321 },
  { id: 'leonardo', text: 'Nasce Leonardo da Vinci', year: 1452 },
  { id: 'eiffel', text: 'Viene inaugurata la Torre Eiffel', year: 1889 },
  { id: 'wright', text: 'Primo volo a motore dei fratelli Wright', year: 1903 },
  { id: 'chernobyl', text: 'Incidente nucleare di Chernobyl', year: 1986 },
  { id: '11-settembre', text: 'Attentati dell’11 settembre a New York', year: 2001 },
  { id: 'fiat-500', text: 'Debutta la Nuova Fiat 500', year: 1957 },
  { id: 'sputnik', text: 'Lo Sputnik 1 è il primo satellite artificiale in orbita', year: 1957 },
  { id: 'urss', text: "Si dissolve l'Unione Sovietica", year: 1991 },
  { id: 'brexit', text: 'Il Regno Unito vota la Brexit con un referendum', year: 2016 },
  { id: 'garibaldi', text: 'Nasce Giuseppe Garibaldi', year: 1807 },
  { id: 'waterloo', text: 'Napoleone viene sconfitto a Waterloo', year: 1815 },
  { id: 'penicillina', text: 'Alexander Fleming scopre la penicillina', year: 1928 },
  { id: 'mozart', text: 'Nasce Wolfgang Amadeus Mozart', year: 1756 },
  { id: 'mondiali-1930', text: 'Si gioca il primo Mondiale di calcio, in Uruguay', year: 1930 },
  { id: 'olimpiadi', text: 'Prime Olimpiadi moderne ad Atene', year: 1896 },
  { id: 'giro', text: "Primo Giro d'Italia di ciclismo", year: 1909 },
  { id: 'alluvione-firenze', text: 'La grande alluvione di Firenze', year: 1966 },
  { id: 'tutankhamon', text: 'Viene scoperta la tomba di Tutankhamon', year: 1922 },
  { id: 'love-me-do', text: 'I Beatles pubblicano il primo singolo, «Love Me Do»', year: 1962 },
  { id: 'harry-potter', text: 'Esce il primo libro di Harry Potter', year: 1997 },
  { id: 'papa-francesco', text: 'Jorge Mario Bergoglio viene eletto papa', year: 2013 },
  { id: 'westfalia', text: 'La Pace di Vestfalia chiude la Guerra dei trent’anni', year: 1648 }
];
