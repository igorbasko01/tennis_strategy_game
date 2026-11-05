import { describe, expect, it } from 'vitest';
import { balance, emptyProfile, saveTournamentRecord } from './profile';
import { matchReview } from './review';
import { buyCoaching, canBuyCoaching, coachingPrice, COACHING_GAIN, createTournament, HUMAN, recordHumanMatch } from './tournament';
import { Match } from './match';
import { MATCH_SCORING } from './scoring';
import { AiOpponent } from './ai';
import type { Duel } from './resolution';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('coaching', () => {
  it('costs more the better the player is', () => {
    expect(coachingPrice(0.2)).toBe(100);
    expect(coachingPrice(0.3)).toBe(100);
    expect(coachingPrice(0.55)).toBe(150);
    expect(coachingPrice(0.8)).toBe(200);
  });

  it('is offered once, after a loss, and adds a little skill', () => {
    const rng = seeded(4);
    const playing = createTournament(rng, 0.4, 1);
    expect(canBuyCoaching(playing)).toBe(false);
    const lost = recordHumanMatch(playing, false, [[1, 4]], rng);
    expect(canBuyCoaching(lost)).toBe(true);
    const coached = buyCoaching(lost);
    // Priced at the skill left after the loss.
    const after = lost.entrants[HUMAN].skill;
    expect(coached.coaching).toBe(coachingPrice(after));
    expect(coached.entrants[HUMAN].skill).toBeCloseTo(after + COACHING_GAIN);
    expect(canBuyCoaching(coached)).toBe(false);
    expect(() => buyCoaching(coached)).toThrow();
    // Less than a single match against an equal can move skill.
    expect(COACHING_GAIN).toBeLessThan(0.04);
  });

  it('comes out of the player’s money', () => {
    const rng = seeded(5);
    let p = emptyProfile(rng);
    const lost = recordHumanMatch(createTournament(rng, 0.3, 1), false, [[1, 4]], rng);
    p = saveTournamentRecord(p, lost);
    const earned = balance(p);
    p = saveTournamentRecord(p, buyCoaching(lost));
    expect(p.tournaments[0].coaching).toBe(100);
    expect(balance(p)).toBe(earned - 100);
  });

  it('reviews what the opponent kept doing and how well the player read it', () => {
    const rng = seeded(6);
    const m = new Match([{ name: 'You', skill: 0.3 }, { name: 'CPU', skill: 0.3 }], MATCH_SCORING, 0);
    const ai = [new AiOpponent(rng), new AiOpponent(rng)];
    const log: Duel[] = [];
    while (!m.isOver) {
      m.submit(0, ai[0].choose(m, 0));
      m.submit(1, ai[1].choose(m, 1));
      log.push(...m.resolve(rng).exchange.duels);
    }
    const r = matchReview(log, 0);
    const theirs = log.filter((d) => d.hitter === 1);
    expect(r.reads).toBe(theirs.length);
    expect(Object.values(r.serves).reduce((a, b) => a + b, 0)).toBe(theirs.filter((d) => d.kind === 'serve').length);
    expect(Object.values(r.shots).reduce((a, b) => a + b, 0)).toBe(theirs.filter((d) => d.kind !== 'serve').length);
    expect(r.readsRight).toBe(theirs.filter((d) => d.readCalc.modifier > 0).length);
    expect(r.misreadCost).toBeLessThanOrEqual(0);
    expect(m.stats[0].readsCorrect).toBe(r.readsRight);
  });
});
