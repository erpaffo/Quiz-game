// 🎨 Scarabocchi Animati (ispirato a Drawful Animate): contratto server ↔ client.
// Telefono → SHOW_ACTION { payload: CreativeAction } · TV ← show.state: CreativePublic · telefono ← me.show: CreativePrivate
//
// Disegno = 2 fotogrammi; ogni fotogramma è una lista di tratti. Coordinate intere 0..CANVAS su una tela quadrata.
// La TV anima il disegno alternando i fotogrammi (≈ 2 al secondo). I bot non disegnano.

import type { BluffOptionPublic, BluffOptionReveal } from './bluff';
import type { ShowFinal } from './shows';

export const CREATIVE = {
  DRAW_MS: 80_000,
  TITLE_MS: 35_000,
  CHOOSE_MS: 25_000,
  REVEAL_MS: 10_000,
  TITLE_MAX: 40,
  CANVAS: 1000,
  FRAMES: 2,
  COLORS: ['#1d1d1f', '#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#ffffff'],
  /** Spessori in unità della tela. */
  WIDTHS: [6, 14, 30],
  MAX_STROKES: 200,
  /** Punti (coppie x,y) totali nei 2 fotogrammi. */
  MAX_POINTS: 6000,
  MIN_OPTIONS: 4,
  TRUTH_POINTS: 1000,
  FOOL_POINTS: 500,
  /** All'artista, per ogni giocatore che trova il titolo vero. */
  ARTIST_POINTS: 500
} as const;

export interface Stroke {
  /** Indice in CREATIVE.COLORS. */
  c: number;
  /** Indice in CREATIVE.WIDTHS. */
  w: number;
  /** Coordinate piatte [x0, y0, x1, y1, …], interi tra 0 e CANVAS. */
  p: number[];
}

/** CREATIVE.FRAMES fotogrammi. */
export type Drawing = Stroke[][];

export type CreativeAction =
  | { type: 'draw'; frames: Drawing }
  | { type: 'title'; text: string }
  | { type: 'choose'; optionId: string };

interface CreativeTurn {
  /** Disegno n. index su count. */
  index: number;
  count: number;
  artistId: string;
  drawing: Drawing;
}

export type CreativePublic =
  /** round/total: giro di disegni attuale e giri scelti nel menù (ogni giro = un nuovo disegno a testa). */
  | { step: 'draw'; submitted: string[]; round: number; total: number }
  | ({ step: 'title'; submitted: string[] } & CreativeTurn)
  | ({ step: 'choose'; options: BluffOptionPublic[]; chosen: string[] } & CreativeTurn)
  | ({ step: 'reveal'; options: BluffOptionReveal[]; points: Record<string, number> } & CreativeTurn)
  | ShowFinal;

export interface CreativePrivate {
  /** Il tema segreto da disegnare (solo nel passo draw). */
  prompt: string | null;
  drawn: boolean;
  /** Il disegno in gioco è il mio: non scrivo titoli e non voto. */
  isArtist: boolean;
  myTitle: string | null;
  myOptionId: string | null;
  myChoice: string | null;
}

/** Validazione di un disegno ricevuto dal telefono: null se valido, altrimenti il motivo. */
export function drawingError(frames: unknown): string | null {
  if (!Array.isArray(frames) || frames.length !== CREATIVE.FRAMES) return `Servono ${CREATIVE.FRAMES} fotogrammi`;
  let strokes = 0;
  let points = 0;
  for (const frame of frames) {
    if (!Array.isArray(frame)) return 'Fotogramma non valido';
    for (const s of frame as unknown[]) {
      const st = s as Partial<Stroke> | null;
      if (!st || typeof st !== 'object') return 'Tratto non valido';
      if (!Number.isInteger(st.c) || st.c! < 0 || st.c! >= CREATIVE.COLORS.length) return 'Colore non valido';
      if (!Number.isInteger(st.w) || st.w! < 0 || st.w! >= CREATIVE.WIDTHS.length) return 'Spessore non valido';
      if (!Array.isArray(st.p) || st.p.length < 2 || st.p.length % 2 !== 0) return 'Tratto non valido';
      if (!st.p.every((v) => Number.isInteger(v) && v >= 0 && v <= CREATIVE.CANVAS)) return 'Coordinate fuori dalla tela';
      strokes++;
      points += st.p.length / 2;
    }
  }
  if (strokes === 0) return 'Il disegno è vuoto';
  if (strokes > CREATIVE.MAX_STROKES || points > CREATIVE.MAX_POINTS) return 'Disegno troppo complesso';
  return null;
}
