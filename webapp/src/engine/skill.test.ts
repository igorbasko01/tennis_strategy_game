import { describe, expect, it } from 'vitest';
import { Match } from './match';
import { SKILL_TIERS, skillTier } from './skill';

describe('skill tiers', () => {
  it('offers five ascending tiers within the valid skill range', () => {
    expect(SKILL_TIERS).toHaveLength(5);
    for (let i = 1; i < SKILL_TIERS.length; i++) {
      expect(SKILL_TIERS[i].skill).toBeGreaterThan(SKILL_TIERS[i - 1].skill);
    }
    for (const t of SKILL_TIERS) {
      expect(() => new Match([{ name: 'a', skill: t.skill }, { name: 'b', skill: t.skill }], { setsToWin: 1, gamesPerSet: 4 })).not.toThrow();
    }
  });

  it('looks tiers up by id', () => {
    expect(skillTier('legend')?.skill).toBe(0.7);
    expect(skillTier('rookie')).toBeUndefined();
  });
});
