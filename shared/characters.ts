// Personaggi originali in stile cartoon. Il campo `kind` sceglie il costruttore 3D procedurale
// (client/common/characters3d.ts); `variant` sceglie gli accessori alternativi della skin.
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
}

export type CharacterKind = 'rocker' | 'astronaut' | 'chef' | 'granny' | 'robot' | 'pirate';

export interface CharacterDef {
  id: CharacterKind;
  name: string;
  tagline: string;
  skins: SkinDef[];
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
    ]
  },
  {
    id: 'astronaut',
    name: 'Cap. Orbita',
    tagline: 'Ha la testa tra le stelle.',
    skins: [
      { id: 'white', name: 'Bianca', variant: 'classic', colors: { skin: '#f0c49b', hair: '#6b4226', body: '#f1f3f5', pants: '#dee2e6', accent: '#ff6b35' } },
      { id: 'retro', name: 'Retrò', variant: 'retro', colors: { skin: '#e8b58a', hair: '#2b2b2b', body: '#c0c4c8', pants: '#8d99ae', accent: '#d62828' } },
      { id: 'martian', name: 'Marziana', variant: 'martian', colors: { skin: '#8ee06b', hair: '#3a7d2c', body: '#5a189a', pants: '#3c096c', accent: '#80ffdb' } }
    ]
  },
  {
    id: 'chef',
    name: 'Chef Baffo',
    tagline: 'Sa tutto, soprattutto di sughi.',
    skins: [
      { id: 'pizza', name: 'Pizza', variant: 'toque', colors: { skin: '#f1c093', hair: '#3b2a1e', body: '#ffffff', pants: '#2b2d42', accent: '#d62828' } },
      { id: 'sushi', name: 'Sushi', variant: 'bandana', colors: { skin: '#f3cfa6', hair: '#111111', body: '#1d3557', pants: '#111111', accent: '#e63946' } },
      { id: 'pastry', name: 'Pasticcere', variant: 'toque', colors: { skin: '#f6d5b5', hair: '#a0522d', body: '#ffd6e8', pants: '#ffffff', accent: '#ff85a1' } }
    ]
  },
  {
    id: 'granny',
    name: 'Nonna Sprint',
    tagline: '92 anni, riflessi da ninja.',
    skins: [
      { id: 'sweater', name: 'Maglioncino', variant: 'bun', colors: { skin: '#f0c8a8', hair: '#e9ecef', body: '#9d4edd', pants: '#495057', accent: '#ffb703' } },
      { id: 'ninja', name: 'Ninja', variant: 'ninja', colors: { skin: '#f0c8a8', hair: '#e9ecef', body: '#212529', pants: '#212529', accent: '#e63946' } },
      { id: 'disco', name: 'Disco', variant: 'afro', colors: { skin: '#c68b59', hair: '#d0d0d0', body: '#ff006e', pants: '#3a86ff', accent: '#ffbe0b' } }
    ]
  },
  {
    id: 'robot',
    name: 'Quizbot 3000',
    tagline: 'Database pieno, batteria scarica.',
    skins: [
      { id: 'tin', name: 'Latta', variant: 'antenna', colors: { skin: '#adb5bd', hair: '#495057', body: '#6c757d', pants: '#495057', accent: '#00f5d4' } },
      { id: 'gold', name: 'Oro', variant: 'antenna', colors: { skin: '#ffd166', hair: '#c9a227', body: '#e0a800', pants: '#b08900', accent: '#ef476f' } },
      { id: 'glitch', name: 'Glitch', variant: 'glitch', colors: { skin: '#3a0ca3', hair: '#7209b7', body: '#240046', pants: '#10002b', accent: '#f72585' } }
    ]
  },
  {
    id: 'pirate',
    name: 'Barba Libro',
    tagline: 'Il tesoro? La conoscenza. E l\'oro.',
    skins: [
      { id: 'captain', name: 'Capitano', variant: 'tricorn', colors: { skin: '#e3a977', hair: '#3d2817', body: '#8d0801', pants: '#1b263b', accent: '#f4d35e' } },
      { id: 'ghost', name: 'Fantasma', variant: 'tricorn', colors: { skin: '#bde0fe', hair: '#a2d2ff', body: '#cdb4db', pants: '#8e9aaf', accent: '#ffffff' } },
      { id: 'tropical', name: 'Tropicale', variant: 'bandana', colors: { skin: '#d4915d', hair: '#2b1d0e', body: '#06d6a0', pants: '#f4a261', accent: '#ef476f' } }
    ]
  }
];

export function getCharacter(id: string | null | undefined): CharacterDef | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

export function getSkin(characterId: string | null | undefined, skinId: string | null | undefined): SkinDef | undefined {
  return getCharacter(characterId)?.skins.find((s) => s.id === skinId);
}
