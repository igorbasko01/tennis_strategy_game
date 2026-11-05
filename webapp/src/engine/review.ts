import { ATTACK_ACTIONS, SERVE_ACTIONS, type AttackAction, type ServeAction, type ServeReceiveAction } from './actions';
import type { Duel, PlayerIndex } from './resolution';

/** The read that is right against each serve. */
const SERVE_READ: Record<ServeAction, ServeReceiveAction> = { wide: 'wide', body: 'neutral', tLine: 'tLine' };

/** The read (or reads, when tied) that would have been right most often, and how often. */
export interface BestRead<K extends string> {
  reads: K[];
  right: number;
  of: number;
}

/** What a coach points out after a match: the opponent's habits and how well `me` read them. */
export interface MatchReview {
  /** Where the opponent served, by target. */
  serves: Record<ServeAction, number>;
  /** Where the opponent hit returns, attacks and counters, by target. */
  shots: Record<AttackAction, number>;
  readsRight: number;
  reads: number;
  /** Misreads after which the opponent's shot won the point outright. */
  misreadsLost: number;
  /** The best single read against the opponent's serve, and cover against their shots. */
  bestServeRead: BestRead<ServeReceiveAction>;
  bestCover: BestRead<AttackAction>;
}

const best = <K extends string>(counts: Record<K, number>): BestRead<K> => {
  const keys = Object.keys(counts) as K[];
  const of = keys.reduce((sum, k) => sum + counts[k], 0);
  const right = Math.max(0, ...keys.map((k) => counts[k]));
  return { reads: right > 0 ? keys.filter((k) => counts[k] === right) : [], right, of };
};

export const matchReview = (duels: readonly Duel[], me: PlayerIndex): MatchReview => {
  const serves = Object.fromEntries(SERVE_ACTIONS.map((a) => [a, 0])) as Record<ServeAction, number>;
  const shots = Object.fromEntries(ATTACK_ACTIONS.map((a) => [a, 0])) as Record<AttackAction, number>;
  let readsRight = 0;
  let reads = 0;
  let misreadsLost = 0;
  for (const d of duels) {
    if (d.hitter === me) continue;
    if (d.kind === 'serve') serves[d.shot as ServeAction]++;
    else shots[d.shot as AttackAction]++;
    reads++;
    if (d.readCalc.modifier > 0) readsRight++;
    // A shot that beats the read always ends the point.
    else if (d.hitterWins) misreadsLost++;
  }
  const serveReads = { wide: 0, neutral: 0, tLine: 0 } as Record<ServeReceiveAction, number>;
  for (const s of SERVE_ACTIONS) serveReads[SERVE_READ[s]] += serves[s];
  return { serves, shots, readsRight, reads, misreadsLost, bestServeRead: best(serveReads), bestCover: best(shots) };
};
