import { ATTACK_ACTIONS, SERVE_ACTIONS, type AttackAction, type ServeAction } from './actions';
import type { Duel, PlayerIndex } from './resolution';

/** What a coach points out after a match: the opponent's habits and how well `me` read them. */
export interface MatchReview {
  /** Where the opponent served, by target. */
  serves: Record<ServeAction, number>;
  /** Where the opponent hit returns, attacks and counters, by target. */
  shots: Record<AttackAction, number>;
  readsRight: number;
  reads: number;
  /** Total read penalty `me` took from misreads (≤ 0), before any scramble. */
  misreadCost: number;
}

export const matchReview = (duels: readonly Duel[], me: PlayerIndex): MatchReview => {
  const serves = Object.fromEntries(SERVE_ACTIONS.map((a) => [a, 0])) as Record<ServeAction, number>;
  const shots = Object.fromEntries(ATTACK_ACTIONS.map((a) => [a, 0])) as Record<AttackAction, number>;
  let readsRight = 0;
  let reads = 0;
  let misreadCost = 0;
  for (const d of duels) {
    if (d.hitter === me) continue;
    if (d.kind === 'serve') serves[d.shot as ServeAction]++;
    else shots[d.shot as AttackAction]++;
    reads++;
    if (d.readCalc.modifier > 0) readsRight++;
    else misreadCost += d.readCalc.modifier;
  }
  return { serves, shots, readsRight, reads, misreadCost: Math.round(misreadCost * 100) / 100 };
};
