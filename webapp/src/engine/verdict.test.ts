import { describe, expect, it } from 'vitest';
import { SERVE_COST, SERVE_RECEIVE_MODIFIER } from './actions';
import { resolveDuel, type Duel } from './resolution';
import { duelVerdict, hitChance } from './verdict';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** A wide serve (player 1) against the player's (0) read, with fixed dice. */
const wideServe = (read: 'wide' | 'neutral' | 'tLine', energy: [number, number], dice: [number, number]): Duel => {
  const rolls = [...dice];
  // rollRandomFactor maps rng() in [0, 1) to [-0.3, 0.3).
  const rng = () => ((rolls.shift() ?? 0) + 0.3) / 0.6;
  return resolveDuel('serve', 1, 0.3, 'wide', SERVE_COST.wide, 0.3, read, SERVE_RECEIVE_MODIFIER.wide[read], rng, 0, energy);
};

describe('verdict', () => {
  it('works out the odds before the dice', () => {
    // A right read is never beaten: 0.6 ahead, and the dice can swing at most 0.6.
    expect(hitChance(wideServe('wide', [1, 1], [0, 0]))).toBe(0);
    // Neutral vs Wide when fresh: the scramble wins back 0.2 of the 0.4, so the read is 0.1 ahead.
    expect(hitChance(wideServe('neutral', [1, 1], [0, 0]))).toBeCloseTo(0.347, 3);
    // Completely wrong (T vs Wide) but fresh: a coin flip.
    expect(hitChance(wideServe('tLine', [1, 1], [0, 0]))).toBeCloseTo(0.5, 6);
    // The odds don't depend on how the dice actually fell.
    expect(hitChance(wideServe('neutral', [1, 1], [0.25, -0.2]))).toBeCloseTo(0.347, 3);
  });

  it('matches the odds seen over many random duels', () => {
    const rng = seeded(3);
    let won = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const d = resolveDuel('serve', 1, 0.3, 'wide', SERVE_COST.wide, 0.3, 'neutral', SERVE_RECEIVE_MODIFIER.wide.neutral, rng, 0, [0.5, 0.7]);
      if (d.hitterWins) won++;
    }
    const d = resolveDuel('serve', 1, 0.3, 'wide', SERVE_COST.wide, 0.3, 'neutral', SERVE_RECEIVE_MODIFIER.wide.neutral, rng, 0, [0.5, 0.7]);
    expect(won / n).toBeCloseTo(hitChance(d), 1);
  });

  it('separates a good read from good luck, from the player’s side', () => {
    // Neutral vs Wide, fresh: the serve rolls high, the read low, so the serve gets through.
    const unlucky = duelVerdict(wideServe('neutral', [1, 1], [0.25, -0.2]), 0);
    expect(unlucky).toMatchObject({ title: 'Good read, unlucky', won: false, chanceLabel: 'to hold' });
    expect(unlucky.chance).toBeCloseTo(0.653, 3);
    expect(unlucky.reasons).toEqual(['−0.40 misread', '+0.20 fresh legs']);

    expect(duelVerdict(wideServe('neutral', [1, 1], [0, 0]), 0).title).toBe('Saved it');
    expect(duelVerdict(wideServe('wide', [1, 1], [0, 0]), 0).title).toBe('Right read');

    // T vs Wide when tired: a wrong read that usually loses.
    const tired = wideServe('tLine', [0.3, 0.3], [0.1, -0.1]);
    const wrong = duelVerdict(tired, 0);
    expect(wrong.title).toBe('Wrong read');
    expect(wrong.chance).toBeLessThan(0.3);
    expect(wrong.reasons[0]).toBe('−0.60 misread');
    expect(wrong.reasons).toContain('+0.09 fresh legs');
    expect(wrong.reasons.some((r) => r.endsWith('tired'))).toBe(true);
    expect(duelVerdict(wideServe('tLine', [0.3, 0.3], [-0.3, 0.29]), 0).title).toBe('Lucky save');
  });

  it('explains the player’s own shots too', () => {
    const d = wideServe('tLine', [1, 1], [0.2, -0.2]);
    // The CPU served (player 1) and beat the player's wrong read.
    const v = duelVerdict(d, 1);
    expect(v).toMatchObject({ won: true, chanceLabel: 'to get it past' });
    expect(v.reasons[0]).toBe('−0.60 their misread');
    expect(v.reasons).toContain('+0.30 their fresh legs');
  });
});
