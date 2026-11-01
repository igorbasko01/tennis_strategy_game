import { describe, expect, it } from 'vitest';
import { emptyProfile, outcomeLabel, parseProfile, profileStats, rankings, recordSkippedTournament, saveTournamentRecord, summarizeTournament } from './profile';
import { CPU_NAMES, createTournament, playTournamentWithoutPlayer, recordHumanMatch } from './tournament';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('profile', () => {
  it('records a new tournament as in progress under its number', () => {
    const t = createTournament(seeded(1), 0.42, 3);
    const r = summarizeTournament(t);
    expect(r).toMatchObject({ number: 3, status: 'playing', startSkill: 0.42, endSkill: 0.42, matches: [] });
    expect(outcomeLabel(r)).toBe('In progress · Quarterfinal');
  });

  it('lists the player’s matches from their side, with the opponent’s skill at the time', () => {
    const rng = seeded(2);
    let t = createTournament(rng, 0.3, 1);
    t = recordHumanMatch(t, true, [[4, 2]], rng);
    t = recordHumanMatch(t, false, [[3, 5]], rng);
    const r = summarizeTournament(t);
    expect(r.status).toBe('lost');
    expect(r.matches.map((m) => [m.round, m.won, m.score])).toEqual([
      ['Quarterfinal', true, '4–2'],
      ['Semifinal', false, '3–5'],
    ]);
    expect(r.matches[0].opponentSkill).toBe(0.3);
    expect(r.endSkill).toBe(t.entrants[0].skill);
    expect(outcomeLabel(r)).toBe('Knocked out in the semifinal');
  });

  it('labels a won tournament as Champion', () => {
    const rng = seeded(4);
    let t = createTournament(rng, 0.3, 1);
    for (let i = 0; i < 3; i++) t = recordHumanMatch(t, true, [[4, 1]], rng);
    expect(outcomeLabel(summarizeTournament(t))).toBe('Champion');
  });

  it('updates a tournament’s entry in place and advances the numbering', () => {
    const rng = seeded(5);
    let p = emptyProfile();
    let t = createTournament(rng, 0.3, p.nextTournament);
    p = saveTournamentRecord(p, t);
    expect(p.nextTournament).toBe(2);
    t = recordHumanMatch(t, true, [[4, 0]], rng);
    p = saveTournamentRecord(p, t);
    expect(p.tournaments).toHaveLength(1);
    expect(p.tournaments[0].matches).toHaveLength(1);

    const t2 = recordHumanMatch(createTournament(rng, t.entrants[0].skill, p.nextTournament), false, [[0, 4]], rng);
    p = saveTournamentRecord(p, t2);
    expect(p.tournaments.map((x) => x.number)).toEqual([1, 2]);
    expect(profileStats(p)).toEqual({ tournaments: 2, titles: 0, matchesWon: 1, matchesLost: 1 });
  });

  it('saves CPU skills into the roster and still labels an early exit by the human’s last round', () => {
    const rng = seeded(7);
    const t = recordHumanMatch(createTournament(rng), false, [[1, 2]], rng);
    const p = saveTournamentRecord(emptyProfile(), t);
    for (const e of t.entrants.slice(1)) expect(p.roster![e.name]).toBe(e.skill);
    expect(outcomeLabel(p.tournaments[0])).toBe('Knocked out in the quarterfinal');
  });

  it('ranks the player and every CPU by skill, sharing ranks on ties', () => {
    const p = { ...emptyProfile(), roster: { Milo: 0.41, Ana: 0.35 } };
    const rows = rankings(p, 0.35);
    expect(rows).toHaveLength(CPU_NAMES.length + 1);
    expect(rows.slice(0, 3).map((r) => [r.rank, r.name, r.skill])).toEqual([
      [1, 'Milo', 0.41],
      [2, 'You', 0.35],
      [2, 'Ana', 0.35],
    ]);
    // Everyone not in the roster yet is at the starting skill, tied for 4th.
    expect(rows.slice(3).every((r) => r.skill === 0.3 && r.rank === 4)).toBe(true);
    expect(rows.filter((r) => r.isPlayer)).toHaveLength(1);
  });

  it('records a skipped tournament: the player rests and the CPUs move on', () => {
    const rng = seeded(8);
    const p0 = { ...emptyProfile(rng), nextTournament: 4, energy: { You: 0.5 } };
    const cpus = playTournamentWithoutPlayer(rng);
    const p1 = recordSkippedTournament(p0, cpus, 0.42);
    expect(p1.nextTournament).toBe(5);
    expect(p1.energy!.You).toBeCloseTo(0.8);
    const r = p1.tournaments[p1.tournaments.length - 1];
    expect(r).toMatchObject({ number: 4, status: 'skipped', startSkill: 0.42, endSkill: 0.42, matches: [] });
    expect(outcomeLabel(r)).toBe('Skipped to rest');
    for (const c of cpus) expect(p1.roster![c.name]).toBe(c.skill);
    expect(profileStats(p1).tournaments).toBe(0);
    expect(rankings(p1, 0.42).find((x) => x.isPlayer)!.energy).toBeCloseTo(0.8);
  });

  it('survives a JSON round trip and rejects junk', () => {
    const p = saveTournamentRecord(emptyProfile(), createTournament(seeded(6)));
    expect(parseProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(parseProfile({ version: 9 })).toBeNull();
  });
});
