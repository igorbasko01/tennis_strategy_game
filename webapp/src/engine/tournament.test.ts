import { describe, expect, it } from 'vitest';
import {
  CPU_NAMES,
  HUMAN,
  champion,
  playTournamentWithoutPlayer,
  updateEnergies,
  updateRoster,
  MAX_RESULT_CHANGE,
  MAX_SKILL,
  MIN_SKILL,
  TOURNAMENT_START_SKILL,
  createTournament,
  currentOpponent,
  currentRound,
  pairings,
  parseTournament,
  recordHumanMatch,
  decaySkill,
  expectedWin,
  resultChange,
  rollDecay,
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

  it('keeps its number and the human’s starting skill, and records skills at match time', () => {
    const rng = seeded(8);
    const t0 = createTournament(rng, 0.4, 7);
    expect(t0.number).toBe(7);
    expect(t0.startSkill).toBe(0.4);
    const t1 = recordHumanMatch(t0, true, [[4, 3]], rng);
    for (const r of t1.results[0]) {
      expect(r.skills).toEqual([t0.entrants[r.players[0]].skill, t0.entrants[r.players[1]].skill]);
    }
    expect(t1.startSkill).toBe(0.4);
  });

  it('brings CPU players in at their carried-over skill', () => {
    const roster = Object.fromEntries(CPU_NAMES.map((n, i) => [n, 0.3 + i / 100]));
    const t = createTournament(seeded(3), 0.3, 1, roster);
    for (const e of t.entrants.slice(1)) expect(e.skill).toBe(roster[e.name]);
  });

  it('plays the rest of the draw after the human is knocked out, so there is a champion', () => {
    const rng = seeded(12);
    const t = recordHumanMatch(createTournament(rng), false, [[1, 2]], rng);
    expect(t.status).toBe('lost');
    expect(t.results).toHaveLength(3);
    const winner = champion(t)!;
    expect(winner).not.toBe(HUMAN);
    // Only rounds the human played include them.
    expect(t.results[1].some((r) => r.players.includes(HUMAN))).toBe(false);
  });

  it('keeps CPU skills in the roster after a tournament', () => {
    const rng = seeded(13);
    const t = recordHumanMatch(createTournament(rng), false, [[0, 2]], rng);
    const roster = updateRoster({ Someone: 0.5 }, t);
    expect(roster.Someone).toBe(0.5);
    for (const e of t.entrants.slice(1)) expect(roster[e.name]).toBe(e.skill);
    expect(roster.You).toBeUndefined();
    // The champion won three rounds, so they gained (or at least kept) skill.
    expect(t.entrants[champion(t)!].skill).toBeGreaterThanOrEqual(0.3);
  });

  it('puts every CPU in a draw: seven with the player and the rest in a simultaneous background draw', () => {
    const t = createTournament(seeded(21));
    const names = [...t.entrants.slice(1), ...t.background!].map((e) => e.name).sort();
    expect(names).toEqual([...CPU_NAMES].sort());
    expect(t.entrants).toHaveLength(8);
    expect(t.background).toHaveLength(8);
  });

  it('plays the background draw out straight away, winners taking skill from losers', () => {
    const roster = Object.fromEntries(CPU_NAMES.map((n) => [n, 0.4]));
    const t = createTournament(seeded(22), 0.3, 1, roster);
    const bg = t.background!;
    // Skill changes hands, so it can only leave the field through CPUs resting.
    const total = bg.reduce((sum, e) => sum + e.skill, 0);
    expect(total).toBeLessThanOrEqual(0.4 * bg.length + 1e-9);
    expect(bg.some((e) => e.skill > 0.4)).toBe(true);
    expect(bg.some((e) => e.skill < 0.4)).toBe(true);
    for (const e of bg) expect(Math.abs(e.skill - 0.4)).toBeLessThanOrEqual(3 * MAX_RESULT_CHANGE + 1e-9);
    const roster2 = updateRoster(roster, t);
    for (const e of bg) expect(roster2[e.name]).toBe(e.skill);
  });

  it('starts every tournament at full energy and carries energy plus a 30% rest into the next round', () => {
    const rng = seeded(31);
    const t0 = createTournament(rng);
    expect(t0.entrants.every((e) => (e.energy ?? 1) === 1)).toBe(true);
    const opp = currentOpponent(t0)!;
    const t1 = recordHumanMatch(t0, true, [[2, 1]], rng, [0.42, 0.55]);
    expect(t1.entrants[HUMAN].energy).toBeCloseTo(0.72);
    expect(t1.entrants[opp].energy).toBeCloseTo(0.85);
    // Simulated players also come out of their matches below full energy (before the rest).
    for (const r of t1.results[0]) {
      if (r.players.includes(HUMAN)) continue;
      for (const p of r.players) expect(t1.entrants[p].energy).toBeLessThanOrEqual(1);
    }
    expect(t1.entrants.some((e, i) => i !== HUMAN && (e.energy ?? 1) < 1)).toBe(true);
  });

  it('never rests a player above full energy', () => {
    const t = recordHumanMatch(createTournament(seeded(32)), true, [[2, 0]], seeded(33), [0.9, 0.95]);
    expect(t.entrants[HUMAN].energy).toBe(1);
  });

  it('starts simulated matches from the energy given', () => {
    const tired = simulateMatch([0.3, 0.3], seeded(34), [undefined, undefined], [0.2, 0.2]);
    expect(Math.max(...tired.energy)).toBeLessThan(0.6);
  });

  it('carries everyone’s energy into the next tournament', () => {
    const energies = Object.fromEntries([...CPU_NAMES, 'You'].map((n) => [n, 0.8]));
    const t = createTournament(seeded(41), 0.3, 1, {}, {}, energies);
    expect(t.entrants[HUMAN].energy).toBe(0.8);
    for (const e of t.entrants.slice(1)) expect(e.energy).toBe(0.8);
  });

  it('lets tired CPUs sit out and rest, but always fills the player’s draw', () => {
    const tired = Object.fromEntries(CPU_NAMES.map((n) => [n, 0.2]));
    const t = createTournament(seeded(42), 0.3, 1, {}, {}, tired);
    expect(t.entrants).toHaveLength(8);
    // Everyone else was too tired to enter, so they rested: +0.3 energy, and at the
    // starting skill resting costs nothing.
    expect(t.background).toHaveLength(CPU_NAMES.length - 7);
    for (const b of t.background!) {
      expect(b.energy).toBeCloseTo(0.5);
      expect(b.skill).toBe(0.3);
    }
  });

  it('fills a short background draw with byes', () => {
    // Fresh CPUs: most enter, so the background draw has 8 or fewer real players.
    const t = createTournament(seeded(43));
    const names = [...t.entrants.slice(1), ...t.background!].map((e) => e.name).sort();
    expect(names).toEqual([...CPU_NAMES].sort());
    const updated = updateEnergies({}, t);
    expect(Object.keys(updated).sort()).toEqual([...CPU_NAMES, 'You'].sort());
  });

  it('plays a tournament without the player when they skip it', () => {
    const cpus = playTournamentWithoutPlayer(seeded(44));
    expect(cpus.map((c) => c.name).sort()).toEqual([...CPU_NAMES].sort());
    // Fifteen CPUs at most: two draws with byes still crown winners who gain skill.
    expect(cpus.filter((c) => c.skill > 0.3).length).toBeGreaterThan(0);
  });

  it('lets resting CPUs above the starting skill lose some of it', () => {
    const tired = Object.fromEntries(CPU_NAMES.map((n) => [n, 0.2]));
    const strong = Object.fromEntries(CPU_NAMES.map((n) => [n, 0.6]));
    const t = createTournament(seeded(42), 0.3, 1, strong, {}, tired);
    for (const b of t.background!) {
      expect(b.skill).toBeLessThanOrEqual(0.59 + 1e-9);
      expect(b.skill).toBeGreaterThanOrEqual(0.55 - 1e-9);
    }
  });

  it('rolls skip decay between 0.01 and 0.05 in 0.01 steps', () => {
    expect(rollDecay(() => 0)).toBe(0.01);
    expect(rollDecay(() => 0.999999)).toBe(0.05);
    const rng = seeded(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rollDecay(rng));
    expect([...seen].sort()).toEqual([0.01, 0.02, 0.03, 0.04, 0.05]);
  });

  it('never decays skill below the starting skill', () => {
    expect(decaySkill(0.5, () => 0)).toBe(0.49);
    expect(decaySkill(0.5, () => 0.999999)).toBe(0.45);
    expect(decaySkill(0.32, () => 0.999999)).toBe(TOURNAMENT_START_SKILL);
    expect(decaySkill(0.3, () => 0.999999)).toBe(0.3);
    expect(decaySkill(0.22, () => 0.999999)).toBe(0.22);
  });

  it('moves skill by how surprising the result was', () => {
    expect(expectedWin(0.4, 0.4)).toBeCloseTo(0.5);
    expect(expectedWin(0.5, 0.3)).toBeGreaterThan(0.95);
    // Even players: 0.04 each way.
    expect(resultChange(0.4, 0.4)).toBe(0.04);
    // A strong player beating a much weaker one gains almost nothing...
    expect(resultChange(0.6, 0.3)).toBe(0);
    expect(resultChange(0.5, 0.4)).toBe(0.01);
    // ...but the upset the other way moves a lot, capped.
    expect(resultChange(0.4, 0.5)).toBe(MAX_RESULT_CHANGE);
    expect(resultChange(0.3, 0.6)).toBe(MAX_RESULT_CHANGE);
  });

  it('keeps skill within its limits after a result', () => {
    const rng = seeded(5);
    const roster = Object.fromEntries(CPU_NAMES.map((n, i) => [n, i % 2 ? MIN_SKILL : MAX_SKILL]));
    const t = createTournament(rng, MIN_SKILL, 1, roster);
    for (const e of [...t.entrants, ...t.background!]) {
      expect(e.skill).toBeGreaterThanOrEqual(MIN_SKILL);
      expect(e.skill).toBeLessThanOrEqual(MAX_SKILL);
    }
  });

  it('advances winners, who take skill from the losers, and the human to the next round', () => {
    const rng = seeded(3);
    const t0 = createTournament(rng);
    const t1 = recordHumanMatch(t0, true, [[4, 2]], rng);
    expect(t1.status).toBe('playing');
    expect(currentRound(t1)).toBe(1);
    expect(t1.draws[1]).toHaveLength(4);
    expect(t1.draws[1]).toContain(HUMAN);
    for (const r of t1.results[0]) {
      // Everyone started level, so each result moves 0.04 each way.
      expect(t1.entrants[r.winner].skill).toBeCloseTo(TOURNAMENT_START_SKILL + 0.04);
      const loser = r.players[0] === r.winner ? r.players[1] : r.players[0];
      expect(t1.entrants[loser].skill).toBeCloseTo(TOURNAMENT_START_SKILL - 0.04);
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
    expect(Math.max(...sets[0])).toBe(2);
  });

  it('survives a JSON round trip and rejects junk', () => {
    const t = createTournament(seeded(2));
    expect(parseTournament(JSON.parse(JSON.stringify(t)))).toEqual(t);
    expect(parseTournament(null)).toBeNull();
    expect(parseTournament({ version: 2 })).toBeNull();
  });
});
