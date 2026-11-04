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
    const unlucky = duelVerdict(wideServe('neutral', [1, 1], [0.25, -0.2]), 0, 'Freya');
    // A wrong read that was still favoured (fresh legs): unlucky, but not a good read.
    expect(unlucky).toMatchObject({ title: 'Unlucky', won: false, chanceLabel: 'to hold' });
    expect(unlucky.chance).toBeCloseTo(0.653, 3);
    expect(duelVerdict(wideServe('neutral', [1, 1], [0, 0]), 0).title).toBe('Saved it');
    expect(duelVerdict(wideServe('wide', [1, 1], [0, 0]), 0).title).toBe('Right read');
    // T vs Wide when tired: a wrong read that usually loses.
    const wrong = duelVerdict(wideServe('tLine', [0.3, 0.3], [0.1, -0.1]), 0);
    expect(wrong.title).toBe('Wrong read');
    expect(wrong.chance).toBeLessThan(0.3);
    expect(duelVerdict(wideServe('tLine', [0.3, 0.3], [-0.3, 0.29]), 0).title).toBe('Lucky save');
  });

  it('ranks what decided the shot, biggest first, adding up to the gap', () => {
    // Like Freya (0.40, tired) serving wide to a fresher, stronger player (0.52) who read Neutral.
    const rolls = [0.08, 0.22];
    const rng = () => (rolls.shift()! + 0.3) / 0.6;
    const d = resolveDuel('serve', 1, 0.4, 'wide', SERVE_COST.wide, 0.52, 'neutral', SERVE_RECEIVE_MODIFIER.wide.neutral, rng, 0, [0.7, 0.53]);
    const v = duelVerdict(d, 0, 'Freya');
    expect(v.title).toBe('Saved it');
    expect(v.factors.map((f) => f.id)).toEqual(['energy', 'luck', 'skill', 'choices']);
    expect(v.factors.find((f) => f.id === 'skill')!.value).toBeCloseTo(0.12);
    expect(v.factors.find((f) => f.id === 'choices')!.value).toBeCloseTo(-0.1);
    const gap = d.readCalc.total - d.shotCalc.total;
    expect(v.factors.reduce((sum, f) => sum + f.value, 0)).toBeCloseTo(gap, 1);
  });

  it('names the opponent and explains the player’s own shots too', () => {
    // The player (0) serves wide into a right read: the opponent read it.
    const rolls = [0, 0];
    const rng = () => (rolls.shift()! + 0.3) / 0.6;
    const d = resolveDuel('serve', 0, 0.3, 'wide', SERVE_COST.wide, 0.3, 'wide', SERVE_RECEIVE_MODIFIER.wide.wide, rng, 0, [1, 1]);
    const v = duelVerdict(d, 0, 'Freya');
    expect(v).toMatchObject({ title: 'Freya read it', won: false, chanceLabel: 'to get it past' });
    expect(v.factors[0]).toEqual({ id: 'choices', value: -0.6 });
  });
});
