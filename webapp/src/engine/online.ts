import { ATTACK_ACTIONS, DEFEND_ACTIONS, SERVE_ACTIONS, SERVE_RECEIVE_ACTIONS } from './actions';
import { FULL_ENERGY } from './energy';
import { Match } from './match';
import type { Choice, PlayerIndex, Rng } from './resolution';
import { MATCH_SCORING } from './scoring';

/**
 * Online matches: shared by the server, which runs them, and the browser,
 * which mirrors them. A match's state is fully determined by its seed and the
 * players' choices, so the server never stores the engine's state: it replays.
 */

/** Everyone plays online at the same skill, so only decisions (and the dice) separate players. */
export const ONLINE_SKILL = 0.5;

/** A small, fast seeded generator (mulberry32). */
export const seededRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** One resolved exchange: both seats' choices and the dice it used, so a browser can replay it exactly. */
export interface ResolvedExchange {
  choices: [Choice, Choice];
  rolls: number[];
}

export const newOnlineMatch = (names: [string, string], firstServer: PlayerIndex): Match =>
  new Match(
    [
      { name: names[0], skill: ONLINE_SKILL },
      { name: names[1], skill: ONLINE_SKILL },
    ],
    MATCH_SCORING,
    firstServer,
    [FULL_ENERGY, FULL_ENERGY],
  );

/** Who serves first, from the seed (seat 0 or 1). */
export const firstServerOf = (seed: number): PlayerIndex => (seededRng(seed ^ 0x5eed)() < 0.5 ? 0 : 1);

/** Resolves one exchange on `match` with both choices, drawing dice from `rng`; returns the dice used. */
export const playExchange = (match: Match, choices: readonly [Choice, Choice], rng: Rng) => {
  const rolls: number[] = [];
  match.submit(0, choices[0]);
  match.submit(1, choices[1]);
  const outcome = match.resolve(() => {
    const r = rng();
    rolls.push(r);
    return r;
  });
  return { outcome, rolls };
};

/** A generator that hands back recorded dice in order, to replay an exchange exactly. */
export const replayRng = (rolls: readonly number[]): Rng => {
  let i = 0;
  return () => {
    if (i >= rolls.length) throw new Error('Replay ran out of dice');
    return rolls[i++];
  };
};

/**
 * Replays a match from its seed and the moves so far (by exchange, one choice per seat).
 * Stops at the first exchange that doesn't have both choices yet, or when the match is over.
 */
export const replay = (seed: number, moves: ReadonlyArray<[Choice | null, Choice | null]>) => {
  const match = newOnlineMatch(['Seat 0', 'Seat 1'], firstServerOf(seed));
  const rng = seededRng(seed);
  const resolved: ResolvedExchange[] = [];
  for (const pair of moves) {
    if (match.isOver || !pair[0] || !pair[1]) break;
    const choices: [Choice, Choice] = [pair[0], pair[1]];
    resolved.push({ choices, rolls: playExchange(match, choices, rng).rolls });
  }
  return { match, resolved };
};

/** True when `c` is a well-formed choice of the kind expected. */
export const isValidChoice = (c: unknown, kind: Choice['kind']): c is Choice => {
  if (!c || typeof c !== 'object') return false;
  const x = c as Record<string, unknown>;
  if (x.kind !== kind) return false;
  const has = (key: string, options: readonly string[]) => typeof x[key] === 'string' && options.includes(x[key] as string);
  if (kind === 'server') return has('serveTarget', SERVE_ACTIONS) && has('anticipation', DEFEND_ACTIONS);
  if (kind === 'receiver') return has('anticipation', SERVE_RECEIVE_ACTIONS) && has('returnTarget', ATTACK_ACTIONS);
  return has('attack', ATTACK_ACTIONS) && has('anticipation', DEFEND_ACTIONS);
};

/** Swaps seats so that `seat` becomes player 0: each browser plays as player 0 locally. */
export const orientExchange = (x: ResolvedExchange, seat: PlayerIndex): ResolvedExchange =>
  seat === 0 ? x : { choices: [x.choices[1], x.choices[0]], rolls: x.rolls };

/** Elo-style rating change for the winner (the loser loses the same). */
export const ratingChange = (winnerRating: number, loserRating: number, k = 32): number =>
  Math.round(k * (1 - 1 / (1 + 10 ** ((loserRating - winnerRating) / 400))));
