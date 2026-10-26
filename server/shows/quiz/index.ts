// Modulo autonomo per lo Show "Quiz del Pozzo" (Modalità Quiz con Carte e Piramide).
// Raggruppa ed esporta i componenti del quiz e il plugin QuizShowPlugin per l'architettura Hub Multi-Gioco
// mantenendo la piena retrocompatibilità con i percorsi esistenti in `server/games/*` e `server/logic/*`.

export { createGame, gameAvailable } from '../../games';
export { PyramidGame } from '../../games/pyramid';
export type { GameContext, GameMode } from '../../games/types';
export { dealHand, resolveCards } from '../../logic/cards';
export { pyramidMoves, startingSteps } from '../../logic/pyramid';
export { answerPoints, computeRanks } from '../../logic/scoring';
export { resolveVote, type Vote, type VoteOutcome } from '../../logic/votes';
export { QuestionPool, type DrawOptions, type McDef, type NumDef } from '../../QuestionPool';
export { SHOWS } from '../../../shared/shows';
export { QuizShowPlugin, type QuizPluginBridge } from './QuizShowPlugin';

