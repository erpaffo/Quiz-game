import { CONFIG } from '../../../shared/config';
import { getShowMeta } from '../../../shared/shows';
import type { GameAction, LobbySettings, PhaseData, PrivateState } from '../../../shared/types';
import type { ActionResult, RoomSessionContext, ShowPlugin } from '../../core/ShowPlugin';
import type { Player } from '../../players';

export interface QuizPluginBridge {
  getPhaseData(): PhaseData;
  getPrivateFor(player: Player): Partial<PrivateState>;
  hasPlayerActed(player: Player): boolean;
  onGameAction(player: Player, action: GameAction): ActionResult;
  onBotTurn(player: Player): void;
}

/**
 * Adapter oficiale `ShowPlugin` per lo Show principale "Sapere è Potere" (`id: 'quiz'`).
 * Incapsula il ciclo di vita del Quiz con Carte e Piramide Finale all'interno del registro dell'Hub Multi-Gioco.
 */
export class QuizShowPlugin implements ShowPlugin<PhaseData, Partial<PrivateState>, GameAction, LobbySettings> {
  readonly id = 'quiz' as const;
  readonly meta = getShowMeta('quiz');

  constructor(
    private readonly ctx: RoomSessionContext,
    private readonly bridge: QuizPluginBridge
  ) {}

  canStart(players: Player[], _settings: LobbySettings): string | null {
    const connected = players.filter((p) => p.connected);
    if (connected.length < CONFIG.MIN_PLAYERS) {
      return `Servono almeno ${CONFIG.MIN_PLAYERS} giocatori pronti`;
    }
    if (!connected.every((p) => p.ready && p.characterId)) {
      return 'Tutti i giocatori connessi devono scegliere il personaggio ed essere pronti';
    }
    return null;
  }

  start(_settings: LobbySettings): ActionResult {
    return null;
  }

  handleAction(player: Player, action: GameAction): ActionResult {
    return this.bridge.onGameAction(player, action);
  }

  hasActed(player: Player): boolean {
    return this.bridge.hasPlayerActed(player);
  }

  bot(player: Player): void {
    this.bridge.onBotTurn(player);
  }

  publicState(): PhaseData {
    return this.bridge.getPhaseData();
  }

  privateState(player: Player): Partial<PrivateState> {
    return this.bridge.getPrivateFor(player);
  }

  onPlayerDisconnect(_player: Player): void {
    // La stanza verifica automaticamente checkAllActed() alla disconnessione.
  }

  destroy(): void {
    this.ctx.clearTimers();
  }
}

