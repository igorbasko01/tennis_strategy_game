import type { AttackAction, DefendAction, ServeAction, ServeReceiveAction } from './actions';
import type { Rng } from './resolution';

export type StyleId = 'grinder' | 'aggressor' | 'touch' | 'balanced';

/** A playing style: fixed percentages for every decision. No memory of the opponent. */
export interface Style {
  id: StyleId;
  label: string;
  icon: string;
  description: string;
  serve: Record<ServeAction, number>;
  serveRead: Record<ServeReceiveAction, number>;
  /** Used for returns, attacks and counters. */
  attack: Record<AttackAction, number>;
  cover: Record<DefendAction, number>;
}

export const STYLES: Record<StyleId, Style> = {
  grinder: {
    id: 'grinder',
    label: 'Grinder',
    icon: '🧱',
    description: 'Body serves and Center Deep, chases everything down',
    serve: { wide: 25, body: 50, tLine: 25 },
    serveRead: { wide: 25, neutral: 50, tLine: 25 },
    attack: { crossCourt: 30, downTheLine: 15, centerDeep: 45, dropShot: 10 },
    cover: { crossCourt: 35, downTheLine: 25, centerDeep: 30, dropShot: 10 },
  },
  aggressor: {
    id: 'aggressor',
    label: 'Aggressor',
    icon: '⚡',
    description: 'Wide and T serves, Down the Line, covers the line',
    serve: { wide: 45, body: 10, tLine: 45 },
    serveRead: { wide: 35, neutral: 30, tLine: 35 },
    attack: { crossCourt: 25, downTheLine: 60, centerDeep: 10, dropShot: 5 },
    cover: { crossCourt: 30, downTheLine: 55, centerDeep: 10, dropShot: 5 },
  },
  touch: {
    id: 'touch',
    label: 'Touch player',
    icon: '🪶',
    description: 'Drop shots, covers the short ball',
    serve: { wide: 35, body: 30, tLine: 35 },
    serveRead: { wide: 25, neutral: 50, tLine: 25 },
    attack: { crossCourt: 25, downTheLine: 20, centerDeep: 10, dropShot: 45 },
    cover: { crossCourt: 20, downTheLine: 15, centerDeep: 25, dropShot: 40 },
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    icon: '⚖️',
    description: 'Mixes everything; the hardest to read',
    // The game-theory mix for the shot and read tables.
    serve: { wide: 40, body: 20, tLine: 40 },
    serveRead: { wide: 25, neutral: 50, tLine: 25 },
    attack: { crossCourt: 30, downTheLine: 35, centerDeep: 8, dropShot: 27 },
    cover: { crossCourt: 28, downTheLine: 19, centerDeep: 44, dropShot: 9 },
  },
};

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];

/** Deals the styles out evenly at random, one per name. */
export const assignStyles = (names: readonly string[], rng: Rng): Record<string, StyleId> => {
  const order = [...names];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return Object.fromEntries(order.map((name, i) => [name, STYLE_IDS[i % STYLE_IDS.length]]));
};
