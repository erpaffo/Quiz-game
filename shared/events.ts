// Contratto WebSocket tipizzato, usato sia da socket.io (server) sia da socket.io-client.
//
// Ogni cambio di stato produce un unico evento ROOM_STATE con uno snapshot *personalizzato*
// per destinatario: l'host vede tutto tranne i segreti, ogni giocatore riceve in `me` i
// propri dati privati (carte in mano, effetti subiti, domanda della Raffica…).

import type { MenuView, ShowId } from './shows';
import type { CardType, GameAction, LobbySettings, PhoneQuestion, PowerType, RoomSnapshot } from './types';

export type AckResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T extends object = object> = (res: AckResult<T>) => void;

export interface ClientToServerEvents {
  // --- Schermo principale ---
  CREATE_ROOM: (p: Record<string, never>, ack: Ack<{ code: string; hostKey: string }>) => void;
  HOST_REJOIN: (p: { code: string; hostKey: string }, ack: Ack) => void;
  ADD_BOT: (p: Record<string, never>, ack: Ack) => void;
  KICK_PLAYER: (p: { playerId: string }) => void;
  SET_SETTINGS: (p: Partial<LobbySettings>, ack: Ack) => void;

  // --- Host o giocatore VIP ---
  START_GAME: (p: Record<string, never>, ack: Ack) => void;
  RESTART_GAME: (p: Record<string, never>, ack: Ack) => void;
  /** Salta la spiegazione (GAME_INTRO / PYRAMID_INTRO). */
  SKIP_INTRO: (p: Record<string, never>, ack: Ack) => void;
  /** Solo schermo principale: mette in pausa o riprende la partita (tasto Esc). */
  PAUSE_GAME: (p: { paused: boolean }, ack: Ack) => void;
  /** Navigazione nel menù del Pack: cambia schermata e/o cartuccia evidenziata (solo in lobby). */
  MENU_NAV: (p: { view?: MenuView; focus?: ShowId }, ack: Ack) => void;

  // --- Controller ---
  JOIN_ROOM: (p: { code: string; name: string; playerId?: string }, ack: Ack<{ playerId: string; reconnected: boolean }>) => void;
  SELECT_CHARACTER: (p: { characterId: string; skinId: string; custom?: Record<string, string> }, ack: Ack) => void;
  UPLOAD_SELFIE: (p: { dataUrl: string | null }, ack: Ack) => void;
  PLAYER_READY: (p: { ready: boolean }) => void;
  ADD_QUESTION: (p: PhoneQuestion, ack: Ack<{ total: number }>) => void;
  PLAY_CARD: (p: { card: CardType | null; targetId: string | null }, ack: Ack) => void;
  GAME_ACTION: (p: GameAction, ack: Ack) => void;
  /** Azione generica indirizzata al plugin dello Show attivo nell'Hub Multi-Gioco. */
  SHOW_ACTION: (p: { payload: unknown }, ack: Ack) => void;
  CLEAR_EFFECT: (p: { type: PowerType }) => void;
}

export interface ServerToClientEvents {
  ROOM_STATE: (s: RoomSnapshot) => void;
  SELFIE_UPDATE: (p: { playerId: string; dataUrl: string | null }) => void;
  ROOM_CLOSED: (p: { reason: string }) => void;
  KICKED: () => void;
}
