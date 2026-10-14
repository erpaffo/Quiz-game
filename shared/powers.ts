import type { PowerType } from './types';

export interface PowerDef {
  label: string;
  icon: string;
  color: string;
  description: string;
  /** Ordine degli strati sul controller: il valore più alto sta sopra (va superato per primo). */
  layer: number;
}

export const POWER_TYPES: PowerType[] = ['ICE', 'GOO', 'BOMB', 'LOCK'];

export const POWERS: Record<PowerType, PowerDef> = {
  ICE: {
    label: 'Ghiaccio',
    icon: '🧊',
    color: '#7dd3fc',
    description: 'Congela lo schermo: dovrà toccarlo più volte per rompere il ghiaccio.',
    layer: 4
  },
  GOO: {
    label: 'Melma',
    icon: '🟢',
    color: '#65d43b',
    description: 'Ricopre le risposte di melma verde da pulire col dito.',
    layer: 3
  },
  LOCK: {
    label: 'Lucchetto',
    icon: '🔒',
    color: '#f5b82e',
    description: 'Blocca alcune risposte: va tenuto premuto per sbloccarle.',
    layer: 2
  },
  BOMB: {
    label: 'Bombette',
    icon: '💣',
    color: '#ff5d5d',
    description: 'Fanno esplodere le lettere delle risposte.',
    layer: 1
  }
};

export interface PowerParams {
  ICE: { taps: number };
  GOO: { layers: number; clearThreshold: number };
  BOMB: { hiddenRatio: number };
  LOCK: { lockedOptions: number; holdMs: number };
}

/** Parametri di difficoltà di un potere in base a quanti avversari l'hanno lanciato (stack). */
export function powerParams<T extends PowerType>(type: T, stack: number): PowerParams[T] {
  const extra = Math.max(0, stack - 1);
  const all: PowerParams = {
    ICE: { taps: 8 + extra * 6 },
    // Ogni strato di melma richiede una pulita in più.
    GOO: { layers: Math.min(3, stack), clearThreshold: 0.78 },
    BOMB: { hiddenRatio: Math.min(0.8, 0.4 + extra * 0.2) },
    LOCK: { lockedOptions: Math.min(3, stack), holdMs: 1100 + extra * 400 }
  };
  return all[type];
}
