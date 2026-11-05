import { describe, expect, it } from 'vitest';
import { AiOpponent } from './ai';
import type { Choice, PlayerIndex } from './resolution';
import {
  firstServerOf,
  isValidChoice,
  newOnlineMatch,
  orientExchange,
  playExchange,
  ratingChange,
  replay,
  replayRng,
  seededRng,
} from './online';

/** Plays a whole match between two random choosers, recording the moves as the server would. */
const playRandomMatch = (seed: number) => {
  const pick = seededRng(seed + 1);
  const ai = [new AiOpponent(pick), new AiOpponent(pick)];
  const moves: [Choice, Choice][] = [];
  for (;;) {
    const { match } = replay(seed, moves);
    if (match.isOver) return { match, moves };
    moves.push([ai[0].choose(match, 0), ai[1].choose(match, 1)]);
  }
};

describe('online matches', () => {
  it('replays the same match from the seed and the moves', () => {
    const { match, moves } = playRandomMatch(42);
    const again = replay(42, moves).match;
    expect(again.score.completedSets).toEqual(match.score.completedSets);
    expect(again.score.winner).toBe(match.score.winner);
    expect(again.energy).toEqual(match.energy);
  });

  it('stops at an exchange that is still missing a choice', () => {
    const { moves } = playRandomMatch(7);
    const partial: [Choice | null, Choice | null][] = [...moves.slice(0, 3), [moves[3][0], null]];
    expect(replay(7, partial).resolved).toHaveLength(3);
  });

  it('lets each browser mirror the match from its own side', () => {
    const seed = 99;
    const { match, moves } = playRandomMatch(seed);
    const { resolved } = replay(seed, moves);
    for (const seat of [0, 1] as PlayerIndex[]) {
      const first = firstServerOf(seed);
      const local = newOnlineMatch(['Me', 'Them'], (seat === 0 ? first : 1 - first) as PlayerIndex);
      for (const x of resolved) {
        const o = orientExchange(x, seat);
        playExchange(local, o.choices, replayRng(o.rolls));
      }
      const mine = seat === 0 ? match.score.completedSets : match.score.completedSets.map(([a, b]) => [b, a]);
      expect(local.score.completedSets).toEqual(mine);
      expect(local.score.winner).toBe(seat === 0 ? match.score.winner : 1 - match.score.winner!);
    }
  });

  it('checks that a choice is well formed and of the expected kind', () => {
    expect(isValidChoice({ kind: 'server', serveTarget: 'wide', anticipation: 'crossCourt' }, 'server')).toBe(true);
    expect(isValidChoice({ kind: 'server', serveTarget: 'wide', anticipation: 'crossCourt' }, 'rally')).toBe(false);
    expect(isValidChoice({ kind: 'receiver', anticipation: 'neutral', returnTarget: 'dropShot' }, 'receiver')).toBe(true);
    expect(isValidChoice({ kind: 'rally', attack: 'lob', anticipation: 'crossCourt' }, 'rally')).toBe(false);
    expect(isValidChoice(null, 'rally')).toBe(false);
  });

  it('rates like chess: an upset is worth more than an expected win', () => {
    expect(ratingChange(1000, 1000)).toBe(16);
    expect(ratingChange(1200, 1000)).toBeLessThan(16);
    expect(ratingChange(1000, 1200)).toBeGreaterThan(16);
  });
});
