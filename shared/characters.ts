// Personaggi in stile cartoon. Il campo `id` sceglie il costruttore 3D procedurale
// (client/common/characters3d.ts); `variant` sceglie gli accessori alternativi della skin.
// Ogni personaggio può dichiarare dei tratti personalizzabili (`custom`): opzioni (occhiali, oggetti
// in mano…) oppure ricolorazioni di un colore della skin. Le skin fanno da preset dei tratti.
// Per passare a modelli .glb basta aggiungere un campo `model` e un loader con la stessa interfaccia.

export interface SkinColors {
  skin: string;
  hair: string;
  body: string;
  pants: string;
  accent: string;
}

export interface SkinDef {
  id: string;
  name: string;
  variant: string;
  colors: SkinColors;
  /** Valori predefiniti dei tratti per questa skin (il giocatore può cambiarli). */
  traits?: Record<string, string>;
}

export type CharacterKind = 'rocker' | 'astronaut' | 'chef' | 'granny' | 'robot' | 'pirate' | 'sandro' | 'basso';

export interface CustomOption {
  id: string;
  label: string;
  /** Solo per le ricolorazioni: il colore da applicare (assente = colore originale della skin). */
  color?: string;
}

export interface CustomDef {
  id: string;
  label: string;
  /** Se presente, il tratto ricolora questo colore della skin invece di cambiare un accessorio. */
  recolor?: keyof SkinColors;
  /** La prima opzione è quella predefinita, se la skin non dice altro. */
  options: CustomOption[];
}

export interface CharacterDef {
  id: CharacterKind;
  name: string;
  tagline: string;
  skins: SkinDef[];
  custom?: CustomDef[];
}

/** Scelte del giocatore: id del tratto → id dell'opzione. */
export type CustomChoice = Record<string, string>;

const CLOTHES = ['#e63946', '#f77f00', '#ffd60a', '#06d6a0', '#118ab2', '#4361ee', '#7b2cbf', '#ff4fb8', '#f1f3f5', '#2b2b2b'];
const HAIR = ['#1b1b1f', '#4a2c1a', '#8b5a2b', '#c68642', '#f4d35e', '#e9ecef', '#d62828', '#ff4fb8', '#4361ee', '#39d353'];
const NAMES = ['Rosso', 'Arancio', 'Giallo', 'Verde', 'Petrolio', 'Blu', 'Viola', 'Rosa', 'Bianco', 'Nero'];
const HAIR_NAMES = ['Nero', 'Castano scuro', 'Castano', 'Rame', 'Biondo', 'Grigio', 'Rosso', 'Rosa', 'Blu', 'Verde'];

/** Tratto di ricolorazione: «Originale» più una tavolozza. */
function recolor(target: keyof SkinColors, label: string, palette = CLOTHES, names = NAMES): CustomDef {
  return {
    id: `color-${target}`,
    label,
    recolor: target,
    options: [{ id: 'skin', label: 'Originale' }, ...palette.map((color, i) => ({ id: `c${i}`, label: names[i] ?? color, color }))]
  };
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'rocker',
    name: 'Rocky Ciuffo',
    tagline: 'Risponde a tempo di assolo.',
    skins: [
      { id: 'classic', name: 'Classica', variant: 'quiff', colors: { skin: '#f2c79a', hair: '#1b1b1f', body: '#1f1f24', pants: '#2d3a8c', accent: '#e63946' } },
      { id: 'glam', name: 'Glam', variant: 'glam', colors: { skin: '#f6d2b0', hair: '#ff4fb8', body: '#7b2cbf', pants: '#1a1a1a', accent: '#ffd60a' } },
      { id: 'punk', name: 'Punk', variant: 'mohawk', colors: { skin: '#e9b98f', hair: '#39d353', body: '#2b2b2b', pants: '#a4161a', accent: '#c0c0c0' } }
    ],
    custom: [recolor('hair', 'Capelli', HAIR, HAIR_NAMES), recolor('body', 'Giacca'), recolor('accent', 'Chitarra e dettagli')]
  },
  {
    id: 'astronaut',
    name: 'Cap. Orbita',
    tagline: 'Ha la testa tra le stelle.',
    skins: [
      { id: 'white', name: 'Bianca', variant: 'classic', colors: { skin: '#f0c49b', hair: '#6b4226', body: '#f1f3f5', pants: '#dee2e6', accent: '#ff6b35' } },
      { id: 'retro', name: 'Retrò', variant: 'retro', colors: { skin: '#e8b58a', hair: '#2b2b2b', body: '#c0c4c8', pants: '#8d99ae', accent: '#d62828' } },
      { id: 'martian', name: 'Marziana', variant: 'martian', colors: { skin: '#8ee06b', hair: '#3a7d2c', body: '#5a189a', pants: '#3c096c', accent: '#80ffdb' } }
    ],
    custom: [recolor('body', 'Tuta'), recolor('accent', 'Dettagli')]
  },
  {
    id: 'chef',
    name: 'Chef Baffo',
    tagline: 'Sa tutto, soprattutto di sughi.',
    skins: [
      { id: 'pizza', name: 'Pizza', variant: 'toque', colors: { skin: '#f1c093', hair: '#3b2a1e', body: '#ffffff', pants: '#2b2d42', accent: '#d62828' } },
      { id: 'sushi', name: 'Sushi', variant: 'bandana', colors: { skin: '#f3cfa6', hair: '#111111', body: '#1d3557', pants: '#111111', accent: '#e63946' } },
      { id: 'pastry', name: 'Pasticcere', variant: 'toque', colors: { skin: '#f6d5b5', hair: '#a0522d', body: '#ffd6e8', pants: '#ffffff', accent: '#ff85a1' } }
    ],
    custom: [recolor('hair', 'Baffi', HAIR, HAIR_NAMES), recolor('body', 'Giacca'), recolor('accent', 'Fazzoletto')]
  },
  {
    id: 'granny',
    name: 'Nonna Sprint',
    tagline: '92 anni, riflessi da ninja.',
    skins: [
      { id: 'sweater', name: 'Maglioncino', variant: 'bun', colors: { skin: '#f0c8a8', hair: '#e9ecef', body: '#9d4edd', pants: '#495057', accent: '#ffb703' } },
      { id: 'ninja', name: 'Ninja', variant: 'ninja', colors: { skin: '#f0c8a8', hair: '#e9ecef', body: '#212529', pants: '#212529', accent: '#e63946' } },
      { id: 'disco', name: 'Disco', variant: 'afro', colors: { skin: '#c68b59', hair: '#d0d0d0', body: '#ff006e', pants: '#3a86ff', accent: '#ffbe0b' } }
    ],
    custom: [recolor('hair', 'Capelli', HAIR, HAIR_NAMES), recolor('body', 'Maglione')]
  },
  {
    id: 'robot',
    name: 'Quizbot 3000',
    tagline: 'Database pieno, batteria scarica.',
    skins: [
      { id: 'tin', name: 'Latta', variant: 'antenna', colors: { skin: '#adb5bd', hair: '#495057', body: '#6c757d', pants: '#495057', accent: '#00f5d4' } },
      { id: 'gold', name: 'Oro', variant: 'antenna', colors: { skin: '#ffd166', hair: '#c9a227', body: '#e0a800', pants: '#b08900', accent: '#ef476f' } },
      { id: 'glitch', name: 'Glitch', variant: 'glitch', colors: { skin: '#3a0ca3', hair: '#7209b7', body: '#240046', pants: '#10002b', accent: '#f72585' } }
    ],
    custom: [recolor('body', 'Corpo'), recolor('accent', 'Luci')]
  },
  {
    id: 'pirate',
    name: 'Barba Libro',
    tagline: 'Il tesoro? La conoscenza. E l\'oro.',
    skins: [
      { id: 'captain', name: 'Capitano', variant: 'tricorn', colors: { skin: '#e3a977', hair: '#3d2817', body: '#8d0801', pants: '#1b263b', accent: '#f4d35e' } },
      { id: 'ghost', name: 'Fantasma', variant: 'tricorn', colors: { skin: '#bde0fe', hair: '#a2d2ff', body: '#cdb4db', pants: '#8e9aaf', accent: '#ffffff' } },
      { id: 'tropical', name: 'Tropicale', variant: 'bandana', colors: { skin: '#d4915d', hair: '#2b1d0e', body: '#06d6a0', pants: '#f4a261', accent: '#ef476f' } }
    ],
    custom: [recolor('hair', 'Barba', HAIR, HAIR_NAMES), recolor('body', 'Giubba')]
  },
  {
    id: 'sandro',
    name: 'Sandro',
    tagline: 'Oggi è la volta buona. Come ieri.',
    skins: [
      {
        id: 'gratta',
        name: 'Gratta e Vinci',
        variant: 'gratta',
        colors: { skin: '#f0bf98', hair: '#3b2a20', body: '#4c7a3d', pants: '#3d5a80', accent: '#e63946' },
        traits: { glasses: 'yes', beard: 'short', hands: 'tickets', pocket: 'chips', mood: 'happy' }
      },
      {
        id: 'schedina',
        name: 'Schedina',
        variant: 'schedina',
        colors: { skin: '#f0bf98', hair: '#3b2a20', body: '#9a3b3b', pants: '#34495e', accent: '#ffd60a' },
        traits: { glasses: 'no', beard: 'short', hands: 'slip', pocket: 'cards', mood: 'worried' }
      }
    ],
    custom: [
      { id: 'glasses', label: 'Occhiali', options: [{ id: 'yes', label: '👓 Sì' }, { id: 'no', label: 'No' }] },
      { id: 'beard', label: 'Barba', options: [{ id: 'short', label: '🧔 Corta' }, { id: 'none', label: 'No' }] },
      {
        id: 'hands',
        label: 'In mano',
        options: [
          { id: 'tickets', label: '🎟️ Gratta e vinci' },
          { id: 'slip', label: '🧾 Schedina e carte' },
          { id: 'none', label: 'Niente' }
        ]
      },
      { id: 'pocket', label: 'In tasca', options: [{ id: 'chips', label: '🪙 Fiches' }, { id: 'cards', label: '🃏 Carte' }, { id: 'none', label: 'Niente' }] },
      { id: 'mood', label: 'Espressione', options: [{ id: 'happy', label: '😁 Fiducioso' }, { id: 'worried', label: '😰 Preoccupato' }] },
      recolor('body', 'Maglia'),
      recolor('pants', 'Jeans', ['#3d5a80', '#1d3557', '#5c677d', '#2b2b2b', '#8d6e63', '#6c757d'], ['Jeans', 'Blu scuro', 'Grigio', 'Nero', 'Marrone', 'Grigio chiaro']),
      recolor('hair', 'Capelli', HAIR, HAIR_NAMES)
    ]
  },
  {
    id: 'basso',
    name: 'Basso',
    tagline: 'Un metro e mezzo di pura passione anime.',
    skins: [
      {
        id: 'manga',
        name: 'Manga',
        variant: 'manga',
        colors: { skin: '#f6d2b0', hair: '#f4d35e', body: '#ff9f1c', pants: '#2b2d42', accent: '#4361ee' },
        traits: { hair: 'short', beard: 'light', hands: 'manga', bag: 'yes', print: 'robot', pose: 'calm' }
      },
      {
        id: 'figure',
        name: 'Action figure',
        variant: 'figure',
        colors: { skin: '#f6d2b0', hair: '#f4d35e', body: '#7b2cbf', pants: '#1d3557', accent: '#ff4fb8' },
        traits: { hair: 'tail', beard: 'none', hands: 'figure', bag: 'no', print: 'star', pose: 'dynamic' }
      }
    ],
    custom: [
      { id: 'hair', label: 'Capelli', options: [{ id: 'short', label: 'Corti' }, { id: 'tail', label: 'Codino' }] },
      { id: 'beard', label: 'Barba', options: [{ id: 'light', label: '🧔 Barbetta' }, { id: 'none', label: 'No' }] },
      {
        id: 'hands',
        label: 'In mano',
        options: [
          { id: 'manga', label: '📖 Manga' },
          { id: 'figure', label: '🤖 Action figure' },
          { id: 'none', label: 'Niente' }
        ]
      },
      { id: 'bag', label: 'Borsa a tracolla', options: [{ id: 'yes', label: '👜 Con spille' }, { id: 'no', label: 'No' }] },
      { id: 'print', label: 'Stampa della felpa', options: [{ id: 'robot', label: '🤖 Robot' }, { id: 'star', label: '⭐ Stella' }, { id: 'none', label: 'Nessuna' }] },
      { id: 'pose', label: 'Posa', options: [{ id: 'calm', label: 'Tranquilla' }, { id: 'dynamic', label: '💥 Dinamica' }] },
      recolor('body', 'Felpa'),
      recolor('hair', 'Colore capelli', HAIR, HAIR_NAMES)
    ]
  }
];

export function getCharacter(id: string | null | undefined): CharacterDef | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

export function getSkin(characterId: string | null | undefined, skinId: string | null | undefined): SkinDef | undefined {
  return getCharacter(characterId)?.skins.find((s) => s.id === skinId);
}

/** Tiene solo le scelte valide per quel personaggio (dati in arrivo dai telefoni). */
export function sanitizeCustom(characterId: string | null | undefined, custom: unknown): CustomChoice {
  const out: CustomChoice = {};
  const defs = getCharacter(characterId)?.custom ?? [];
  if (!custom || typeof custom !== 'object') return out;
  for (const def of defs) {
    const v = (custom as Record<string, unknown>)[def.id];
    if (typeof v === 'string' && def.options.some((o) => o.id === v)) out[def.id] = v;
  }
  return out;
}

/** Valore effettivo di un tratto: scelta del giocatore, poi preset della skin, poi prima opzione. */
export function traitValue(def: CustomDef, skin: SkinDef, custom: CustomChoice): string {
  return custom[def.id] ?? skin.traits?.[def.id] ?? def.options[0].id;
}

export interface ResolvedLook {
  skin: SkinDef;
  /** Colori dopo le ricolorazioni. */
  colors: SkinColors;
  /** Tratti di accessorio (non le ricolorazioni), con i valori effettivi. */
  traits: Record<string, string>;
}

export function resolveLook(characterId: string, skinId: string, custom: CustomChoice = {}): ResolvedLook | null {
  const def = getCharacter(characterId);
  const skin = getSkin(characterId, skinId);
  if (!def || !skin) return null;
  const colors = { ...skin.colors };
  const traits: Record<string, string> = {};
  for (const t of def.custom ?? []) {
    const value = traitValue(t, skin, custom);
    if (t.recolor) {
      const color = t.options.find((o) => o.id === value)?.color;
      if (color) colors[t.recolor] = color;
    } else {
      traits[t.id] = value;
    }
  }
  return { skin, colors, traits };
}

/** Chiave stabile di un aspetto, per capire se il modello va ricostruito. */
export function lookKey(characterId: string | null, skinId: string | null, custom: CustomChoice = {}) {
  return `${characterId}/${skinId}/${Object.keys(custom).sort().map((k) => `${k}=${custom[k]}`).join(',')}`;
}
