import type { GameId } from '../../shared/types';
import type { QuestionPool } from '../QuestionPool';
import { BlitzGame } from './blitz';
import { BombGame } from './bomb';
import { ClassicGame } from './classic';
import { CluesGame } from './clues';
import { EstimateGame } from './estimate';
import { FastestGame } from './fastest';
import { MusicGame } from './music';
import { StealGame } from './steal';
import type { GameContext, GameMode } from './types';
import { WagerGame } from './wager';

export function createGame(id: GameId, ctx: GameContext): GameMode {
  switch (id) {
    case 'classic':
      return new ClassicGame(ctx);
    case 'fastest':
      return new FastestGame(ctx);
    case 'bomb':
      return new BombGame(ctx);
    case 'steal':
      return new StealGame(ctx);
    case 'wager':
      return new WagerGame(ctx);
    case 'blitz':
      return new BlitzGame(ctx);
    case 'estimate':
      return new EstimateGame(ctx);
    case 'clues':
      return new CluesGame(ctx);
    case 'music':
      return new MusicGame(ctx);
  }
}

/** Un gioco entra nella ruota solo se i pacchetti scelti hanno abbastanza domande del tipo giusto. */
export function gameAvailable(id: GameId, pool: QuestionPool): boolean {
  switch (id) {
    case 'estimate':
      return pool.numericCount >= 2;
    case 'music':
      return pool.audioCount >= 3;
    case 'classic':
      return pool.categoriesWithMc(2).length >= 1;
    default:
      return pool.mcCount >= 4;
  }
}
