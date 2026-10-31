import { describe, expect, it } from 'vitest';
import {
  HUMAN,
  MAX_SKILL,
  TOURNAMENT_START_SKILL,
  createTournament,
  currentOpponent,
  currentRound,
  pairings,
  parseTournament,
  recordHumanMatch,
  rollGain,
  simulateMatch,
} from './tournament';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('tournament', () => {
  it('starts eight entrants at the lowest skill with the human in the draw', () => {
    const t = createTournament(seeded(1));
    expect(t.entrants).toHaveLength(8);
    expect(t.entrants.every((e) => e.skill === TOURNAMENT_START_SKILL)).toBe(true);
    expect(t.entrants[HUMAN].name).toBe('You');
    expect(new Set(t.entrants.map((e) => e.name)).size).toBe(8);
    expect([...t.draws[0]].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(currentRound(t)).toBe(0);
    expect(currentOpponent(t)).not.toBe(HUMAN);
  });

  it('starts the human from their carried-over skill while CPUs start fresh', () => {
    const t = createTournament(seeded(1), 0.47);
    expect(t.entrants[HUMAN].skill).toBe(0.47);
    expect(t.entrants.slice(1).every((e) => e.skill === TOURNAMENT_START_SKILL)).toBe(true);
  });

  it('never raises skill above the maximum', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rng = seeded(seed);
      const t = recordHumanMatch(createTournament(rng, MAX_SKILL), true, [[4, 0]], rng);
      expect(t.entrants[HUMAN].skill).toBe(MAX_SKILL);
    }
  });

  it('rolls gains between 0.00 and 0.05 in 0.01 steps', () => {
    expect(rollGain(() => 0)).toBe(0);
    expect(rollGain(() => 0.999999)).toBe(0.05);
    const rng = seeded(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rollGain(rng));
    expect([...seen].sort()).toEqual([0, 0.01, 0.02, 0.03, 0.04, 0.05]);
  });

  it('advances winners with a random gain and the human to the next round', () => {
    const rng = seeded(3);
    const t0 = createTournament(rng);
    const t1 = recordHumanMatch(t0, true, [[4, 2]], rng);
    expect(t1.status).toBe('playing');
    expect(currentRound(t1)).toBe(1);
    expect(t1.draws[1]).toHaveLength(4);
    expect(t1.draws[1]).toContain(HUMAN);
    for (const r of t1.results[0]) {
      const gain = t1.entrants[r.winner].skill - TOURNAMENT_START_SKILL;
      expect(gain).toBeGreaterThanOrEqual(0);
      expect(gain).toBeLessThanOrEqual(0.05 + 1e-9);
      const loser = r.players[0] === r.winner ? r.players[1] : r.players[0];
      expect(t1.entrants[loser].skill).toBe(TOURNAMENT_START_SKILL);
    }
    const mine = t1.results[0].find((r) => r.players.includes(HUMAN))!;
    expect(mine.score).toBe('4–2');
    // The input state is not mutated.
    expect(t0.results).toHaveLength(0);
  });

  it('ends the run when the human loses, reporting the score from the winner’s side', () => {
    const rng = seeded(5);
    const t = recordHumanMatch(createTournament(rng), false, [[2, 4]], rng);
    expect(t.status).toBe('lost');
    expect(currentOpponent(t)).toBeNull();
    expect(t.results[0].find((r) => r.players.includes(HUMAN))!.score).toBe('4–2');
    expect(() => recordHumanMatch(t, true, [[4, 0]], rng)).toThrow();
  });

  it('crowns the human after winning three rounds', () => {
    const rng = seeded(9);
    let t = createTournament(rng);
    for (let round = 0; round < 3; round++) {
      expect(pairings(t, round)).toHaveLength(4 >> round);
      t = recordHumanMatch(t, true, [[4, 1]], rng);
    }
    expect(t.status).toBe('won');
    expect(t.results).toHaveLength(3);
    expect(t.entrants[HUMAN].skill).toBeGreaterThanOrEqual(TOURNAMENT_START_SKILL);
    expect(t.entrants[HUMAN].skill).toBeLessThanOrEqual(TOURNAMENT_START_SKILL + 0.15 + 1e-9);
  });

  it('simulates complete CPU matches', () => {
    const { winner, sets } = simulateMatch([0.3, 0.3], seeded(11));
    expect([0, 1]).toContain(winner);
    expect(sets).toHaveLength(1);
    expect(Math.max(...sets[0])).toBeGreaterThanOrEqual(4);
  });

  it('survives a JSON round trip and rejects junk', () => {
    const t = createTournament(seeded(2));
    expect(parseTournament(JSON.parse(JSON.stringify(t)))).toEqual(t);
    expect(parseTournament(null)).toBeNull();
    expect(parseTournament({ version: 2 })).toBeNull();
  });
});
