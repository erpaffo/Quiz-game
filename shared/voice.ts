// Contratto del catalogo voci (F3.2). Lo legge client/host/audio.ts (F3.3, A5); i file li genera
// scripts/build-audio.py (F3.7). `client/public/audio/audio.json` rispetta `AudioManifest`:
//   "voice": { "<chiave>": ["voice/....mp3", "voice/....mp3"] }   // più file = varianti, se ne sceglie una
// Quiz (compatibilità, 44 battute): chiavi piatte già in uso, file `voice/<chiave>-<n>.mp3`.
// Giochi del Pack: chiave `<gioco>/<passo>`, file `voice/<gioco>/<passo>-<n>.mp3` (n = 1, 2, 3…).

import type { ShowId } from './shows';

/** Prefissi delle chiavi: i giochi del Pack più `pack/*` del menù. */
export type VoiceNamespace = ShowId | 'pack';

/** Le 44 battute del quiz in 30 chiavi. Non rinominarle: sono già in audio.json e in client/host/main.ts. */
export const QUIZ_VOICE_KEYS = [
  'welcome',
  'player_join',
  'start',
  'wheel',
  'game_classic',
  'game_fastest',
  'game_bomb',
  'game_steal',
  'game_wager',
  'game_blitz',
  'game_estimate',
  'game_clues',
  'game_music',
  'cards',
  'hit',
  'blocked',
  'question',
  'last_seconds',
  'correct',
  'wrong',
  'nobody',
  'leaderboard',
  'boom',
  'steal',
  'joker',
  'final',
  'sabotage',
  'climb',
  'winner',
  'restart'
] as const;

export type QuizVoiceKey = (typeof QUIZ_VOICE_KEYS)[number];

// shortcut: i passi dei giochi non sono un'unione chiusa (manca docs/COPIONE_VOCE.md); string → unione dei passi a F3.1/F3.6.
/** Battuta di un gioco del Pack: `tempo/intro`, `impostor/reveal`… */
export type GameVoiceKey = `${VoiceNamespace}/${string}`;

export type VoiceKey = QuizVoiceKey | GameVoiceKey;

/** Sezione `voice` di audio.json: chiave → file. Più file = varianti della stessa battuta. */
export type VoiceCatalog = Partial<Record<VoiceKey, string[]>>;

/** Forma di `client/public/audio/audio.json` (`_istruzioni` è testo per chi modifica il file). */
export interface AudioManifest {
  volume?: Partial<Record<'music' | 'sfx' | 'voice', number>>;
  music: Record<string, string>;
  sfx: Record<string, string[] | string>;
  voice: VoiceCatalog;
}

/** `high` = il lettore non la salta (es. il vincitore). */
export type VoicePriority = 'normal' | 'high';

/** Payload di `VOICE_SAY`: `key` per suonare il file, `text` per i sottotitoli sulla TV. */
export interface VoiceSayPayload {
  key: VoiceKey;
  text: string;
  /** Testi delle varianti, nello stesso ordine dei file (n-1); `text` è il ripiego. */
  texts?: string[];
  /** Nome del giocatore per le battute con {nome}. */
  args?: { nome?: string };
  priority?: VoicePriority;
}

/** Nome letto dalla sintesi vocale: solo lettere/numeri/spazi/apostrofi/trattini, max 20 caratteri; '' = salta il nome. */
export function sanitizeName(raw: string): string {
  const s = Array.from(raw.replace(/[^\p{L}\p{N} '’-]/gu, '').replace(/\s+/g, ' ').trim()).slice(0, 20).join('').trim();
  return /[\p{L}\p{N}]/u.test(s) ? s : '';
}

/** Sostituisce {nome}; senza nome toglie il segnaposto e la punteggiatura orfana ("Bravo, {nome}!" → "Bravo!"). */
export function fillName(text: string, nome?: string): string {
  if (nome) return text.replace(/\{nome\}/g, nome);
  const t = text
    .replace(/\s*,\s*\{nome\}/g, '')
    .replace(/\{nome\}\s*[,:;]?\s*/g, '')
    .replace(/\s+([!?.,;:])/g, '$1')
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Testi nell'ordine dei file (-1, -2…). Una stringa = una sola variante. Un testo con {nome} deve avere
// anche una variante senza nome (usata quando il nome manca). Prima variante = copione (docs/COPIONE_VOCE.md).
export const VOICE_LINES: Partial<Record<VoiceKey, string | string[]>> = {
  start: 'Si comincia! Che vinca il più sapiente!',
  wheel: 'Giriamo la ruota!',
  game_classic: 'Il classico! Votate la categoria.',
  game_fastest: 'Il più veloce! Solo il primo vince.',
  game_bomb: 'Bomba a orologeria! Attenti alla miccia.',
  game_steal: 'Ruba punti! Rispondete giusto e derubate gli avversari.',
  game_wager: 'Scommessa! Quanto vi fidate di voi stessi?',
  game_blitz: 'Raffica! Quarantacinque secondi, via!',
  game_estimate: 'La stima! Avvicinatevi il più possibile.',
  game_clues: 'Indizio dopo indizio! Prima rispondete, più punti vincete.',
  game_music: 'Indovina il brano! Ascoltate bene.',
  correct: 'Esatto!',
  wrong: 'Peccato!',
  nobody: 'Nessuno ha indovinato!',
  winner: ['Abbiamo un vincitore! Complimenti!', 'Bravo {nome}! Hai vinto!'],
  'tempo/intro': "La Macchina del Tempo! Vi dico un evento, voi indovinate l'anno: più siete vicini, più punti.",
  'tempo/reveal': "L'anno giusto era... eccolo.",
  'tempo/perfect': 'Anno esatto! Bonus pieno e applausi.',
  'tempo/final': 'Classifica finale della Macchina del Tempo: chi ha sbagliato meno, vince.',
  'bluff/intro': "Fuffa d'Autore! Un fatto vero, una parola mancante e voi che inventate bugie credibili.",
  'bluff/reveal': 'Ecco la verità, e i vostri capolavori.',
  'bluff/final': "Classifica di Fuffa d'Autore: vince chi ha mentito meglio e chi ha capito gli altri.",
  'impostor/intro': "L'Impostore! Tutti conoscono la parola segreta, tranne uno: e deve fingere benissimo.",
  'impostor/reveal': "Ecco chi era l'impostore.",
  'impostor/final': "Classifica finale dell'Impostore: applausi a chi ha mentito con stile."
};

/** Tutte le varianti di una battuta, nell'ordine dei file. */
export function voiceTexts(key: VoiceKey): string[] {
  const t = VOICE_LINES[key];
  return t === undefined ? [] : Array.isArray(t) ? t : [t];
}
