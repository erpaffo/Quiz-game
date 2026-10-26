// «Lunghezza d'Onda»: coppie di opposti. Il bersaglio sta da qualche parte tra sinistra (0) e destra (100).

import GEN_ONDA from './generated/onda.json';

export interface Spectrum {
  left: string;
  right: string;
}

const s = (left: string, right: string): Spectrum => ({ left, right });

const BASE_ONDA_SPECTRA: Spectrum[] = [
  s('🥶 Cibo triste', 'Cibo che rende felici 🤩'),
  s('📉 Inutile', 'Indispensabile 📈'),
  s('👼 Da santo', 'Da criminale 😈'),
  s('🧊 Freddo', 'Caldo 🔥'),
  s('😴 Noioso', 'Emozionante 🎢'),
  s('🤏 Piccolo', 'Enorme 🐘'),
  s('🧸 Per bambini', 'Per adulti 🍷'),
  s('💸 Economico', 'Costosissimo 💎'),
  s('🙈 Imbarazzante', 'Di cui vantarsi 🦚'),
  s('🐌 Lento', 'Velocissimo 🚀'),
  s('🧹 Facile', 'Difficilissimo 🧗'),
  s('🤮 Disgustoso', 'Delizioso 😋'),
  s('🌙 Da fare di notte', 'Da fare di giorno ☀️'),
  s('🧓 Antico', 'Moderno 📱'),
  s('🤫 Silenzioso', 'Rumoroso 📢'),
  s('🐭 Innocuo', 'Pericoloso 🦈'),
  s('👔 Elegante', 'Trasandato 🩴'),
  s('🙂 Normale', 'Stranissimo 👽'),
  s('😌 Rilassante', 'Stressante 😫'),
  s('🧠 Intelligente', 'Stupido 🪨'),
  s('🏠 Da fare in casa', 'Da fare all’aperto 🌳'),
  s('💤 Sopravvalutato', 'Sottovalutato 💡'),
  s('🍼 Da principianti', 'Da esperti 🎓'),
  s('🤝 Cosa da amici', 'Cosa da nemici ⚔️'),
  s('🌿 Salutare', 'Malsano 🍟'),
  s('😇 Bugia innocente', 'Bugia gravissima 🤥'),
  s('🎭 Finto', 'Autentico ✅'),
  s('😂 Divertente', 'Serio 🧐'),
  s('🫠 Morbido', 'Duro 🧱'),
  s('🕰️ Passato di moda', 'Di tendenza 🔥'),
  s('🦸 Superpotere inutile', 'Superpotere utilissimo 💪'),
  s('🍝 Piatto da tutti i giorni', 'Piatto delle feste 🎉'),
  s('🧳 Vacanza rilassante', 'Vacanza avventurosa 🗺️'),
  s('🐶 Animale coccoloso', 'Animale spaventoso 🕷️'),
  s('🎬 Film brutto', 'Capolavoro 🏆'),
  s('🧦 Regalo pessimo', 'Regalo perfetto 🎁'),
  s('🫣 Talento nascosto', 'Talento evidente 🌟'),
  s('🛋️ Pigro', 'Iperattivo ⚡'),
  s('📚 Da studiare', 'Da vivere 🎒'),
  s('🍋 Aspro', 'Dolce 🍬'),
  s('👂 Si sente poco', 'Si sente ovunque 🔊'),
  s('🤓 Da secchione', 'Da ribelle 😎'),
  s('🌧️ Giornata no', 'Giornata perfetta 🌈'),
  s('🧯 Rischio basso', 'Rischio altissimo 🎲'),
  s('🧩 Semplice da spiegare', 'Impossibile da spiegare 🤯'),
  s('🪫 Mi scarica', 'Mi ricarica 🔋'),
  s('🐢 Si invecchia male', 'Si invecchia bene 🍷'),
  s('🥱 Cosa da lunedì', 'Cosa da venerdì sera 🕺'),
  s('📦 Si può fare da soli', 'Serve un gruppo 👨‍👩‍👧‍👦'),
  s('🤏 Peccato veniale', 'Peccato mortale 🔥')
];

// Contenuti approvati nella banca domande (npm run banca -- costruisci).
export const ONDA_SPECTRA: Spectrum[] = [...BASE_ONDA_SPECTRA, ...(GEN_ONDA as Spectrum[])];
