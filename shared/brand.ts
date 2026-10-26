// Nome del gioco: si cambia SOLO in shared/brand.json.
// Lo leggono i titoli delle pagine, il logo, la finestra dell'app e la configurazione di electron-builder.
// Nome proprio del gioco: «Quiz del Pozzo» (in inglese «Quiz of Well»). Non usare nomi di giochi di altri.
import brand from './brand.json';

export const BRAND = brand;

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Logo testuale: la parola centrale (o l'ultima) è evidenziata in rosa. */
export function brandLogoHtml(name = BRAND.name): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return esc(name);
  const mark = words.length >= 3 ? 1 : words.length - 1;
  return words.map((w, i) => (i === mark ? `<span>${esc(w)}</span>` : esc(w))).join(' ');
}
