import { AiOpponent } from './ai';
import { Match } from './match';
import type { Rng } from './resolution';
import { MATCH_SCORING, type ScoringConfig } from './scoring';

/** Starting skill for CPU entrants, and for a human with no saved skill yet. */
export const TOURNAMENT_START_SKILL = 0.3;
export const MAX_SKILL = 1;
/** Each round a player wins adds a random gain of 0.00-0.05, in 0.01 steps. */
export const TOURNAMENT_MAX_GAIN = 0.05;
export const ROUND_NAMES = ['Quarterfinal', 'Semifinal', 'Final'] as const;
export const HUMAN = 0;

export const CPU_NAMES = ['Ana', 'Bruno', 'Chen', 'Dara', 'Elio', 'Freya', 'Goran', 'Hana', 'Ivo', 'Jules', 'Kai', 'Lena', 'Milo', 'Nia', 'Oscar'];
/** Players per draw. With 15 CPUs plus the human there are always two full draws. */
const DRAW_SIZE = 8;

export interface Entrant {
  name: string;
  skill: number;
}

export interface MatchResult {
  /** Entrant indices, in bracket order. */
  players: [number, number];
  winner: number;
  /** Final set score from the winner's side, e.g. "4–2". */
  score: string;
  /** Both players' skills when the match was played. */
  skills: [number, number];
}

/** Plain, JSON-serialisable tournament state. Entrant 0 is the human. */
export interface Tournament {
  version: 2;
  /** Sequential tournament number for the player: 1, 2, 3, ... */
  number: number;
  /** The human's skill when the tournament began. */
  startSkill: number;
  entrants: Entrant[];
  /** Entrant indices still in the draw at the start of each round played so far, in bracket order. */
  draws: number[][];
  /** Completed results per round. */
  results: MatchResult[][];
  status: 'playing' | 'won' | 'lost';
  /**
   * The CPUs in the simultaneous draw the player is not in, with their skills
   * after it was played out. Not shown to the player.
   */
  background?: Entrant[];
}

const shuffled = <T>(items: readonly T[], rng: Rng): T[] => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A random skill gain of 0.00-0.05 in 0.01 steps, each equally likely. */
export const rollGain = (rng: Rng): number => Math.floor(rng() * (TOURNAMENT_MAX_GAIN * 100 + 1)) / 100;

/** `humanSkill` is the skill the player has carried over from earlier tournaments. */
/** CPU players' skills carried over from earlier tournaments, by name. */
export type Roster = Record<string, number>;

export const createTournament = (
  rng: Rng = Math.random,
  humanSkill = TOURNAMENT_START_SKILL,
  number = 1,
  roster: Roster = {},
): Tournament => {
  // Every CPU plays: 7 join the player's draw and the rest play the other draw at the same time.
  const cpus = shuffled(CPU_NAMES, rng).map((name) => ({ name, skill: roster[name] ?? TOURNAMENT_START_SKILL }));
  const entrants: Entrant[] = [{ name: 'You', skill: humanSkill }, ...cpus.slice(0, DRAW_SIZE - 1)];
  const background = playKnockout(cpus.slice(DRAW_SIZE - 1), rng);
  // The human's slot in the draw is random; the bracket pairs neighbours.
  const draw = shuffled(
    entrants.map((_, i) => i),
    rng,
  );
  return { version: 2, number, startSkill: humanSkill, entrants, draws: [draw], results: [], status: 'playing', background };
};

/** Plays a whole CPU knockout and returns the players with their skills afterwards. */
const playKnockout = (players: Entrant[], rng: Rng): Entrant[] => {
  const out = players.map((p) => ({ ...p }));
  let alive = shuffled(
    out.map((_, i) => i),
    rng,
  );
  while (alive.length > 1) {
    const winners: number[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const pair = [alive[i], alive[i + 1]];
      const sim = simulateMatch([out[pair[0]].skill, out[pair[1]].skill], rng);
      const w = out[pair[sim.winner]];
      w.skill = Math.min(MAX_SKILL, round2(w.skill + rollGain(rng)));
      winners.push(pair[sim.winner]);
    }
    alive = winners;
  }
  return out;
};

/** Index of the round being played (0 = quarterfinal). */
export const currentRound = (t: Tournament): number => t.draws.length - 1;

/** Pairs of entrant indices for a round, in bracket order. */
export const pairings = (t: Tournament, round: number): [number, number][] => {
  const draw = t.draws[round];
  const pairs: [number, number][] = [];
  for (let i = 0; i < draw.length; i += 2) pairs.push([draw[i], draw[i + 1]]);
  return pairs;
};

/** The human's opponent in the current round, or null if the tournament is over. */
export const currentOpponent = (t: Tournament): number | null => {
  if (t.status !== 'playing') return null;
  const pair = pairings(t, currentRound(t)).find((p) => p.includes(HUMAN))!;
  return pair[0] === HUMAN ? pair[1] : pair[0];
};

/** Plays a whole CPU-vs-CPU match and returns the winner's side and the set score. */
export const simulateMatch = (skills: readonly [number, number], rng: Rng, scoring: ScoringConfig = MATCH_SCORING) => {
  const m = new Match(
    [
      { name: 'A', skill: skills[0] },
      { name: 'B', skill: skills[1] },
    ],
    scoring,
    rng() < 0.5 ? 0 : 1,
  );
  const ai = new AiOpponent(rng);
  while (!m.isOver) {
    m.submit(0, ai.choose(m, 0));
    m.submit(1, ai.choose(m, 1));
    m.resolve(rng);
  }
  const winner = m.score.winner!;
  return { winner, sets: m.score.completedSets };
};

const scoreLabel = (sets: [number, number][], winnerSide: 0 | 1) =>
  sets.map((s) => `${s[winnerSide]}–${s[1 - winnerSide]}`).join(' ');

/**
 * Records the human's match in the current round, simulates the other matches,
 * gives every winner a random skill gain, and advances the draw.
 * `sets` are the completed set scores with the human's games first.
 */
export const recordHumanMatch = (t: Tournament, humanWon: boolean, sets: [number, number][], rng: Rng = Math.random): Tournament => {
  if (t.status !== 'playing') throw new Error('Tournament is over');
  const next: Tournament = structuredClone(t);
  playRound(next, rng, { won: humanWon, sets });
  if (!humanWon) {
    next.status = 'lost';
    // The CPUs still in the draw play on, so every tournament has a champion.
    while (next.results.length < ROUND_NAMES.length) playRound(next, rng);
  } else if (next.results.length === ROUND_NAMES.length) {
    next.status = 'won';
  }
  return next;
};

/**
 * Plays the current round in place: the human's match uses `human`, every other
 * match is simulated. Winners gain skill and, unless it was the final, advance.
 */
const playRound = (t: Tournament, rng: Rng, human?: { won: boolean; sets: [number, number][] }): void => {
  const round = currentRound(t);
  const results: MatchResult[] = [];
  for (const pair of pairings(t, round)) {
    const skills: [number, number] = [t.entrants[pair[0]].skill, t.entrants[pair[1]].skill];
    if (human && pair.includes(HUMAN)) {
      const opponent = pair[0] === HUMAN ? pair[1] : pair[0];
      const winner = human.won ? HUMAN : opponent;
      results.push({ players: pair, winner, score: scoreLabel(human.sets, human.won ? 0 : 1), skills });
    } else {
      const sim = simulateMatch(skills, rng);
      results.push({ players: pair, winner: pair[sim.winner], score: scoreLabel(sim.sets, sim.winner), skills });
    }
  }
  for (const r of results) {
    const w = t.entrants[r.winner];
    w.skill = Math.min(MAX_SKILL, round2(w.skill + rollGain(rng)));
  }
  t.results.push(results);
  if (round < ROUND_NAMES.length - 1) t.draws.push(results.map((r) => r.winner));
};

/** The champion's entrant index, once the final has been played. */
export const champion = (t: Tournament): number | null =>
  t.results.length === ROUND_NAMES.length ? t.results[ROUND_NAMES.length - 1][0].winner : null;

/** CPU skills after this tournament, merged into the roster. */
export const updateRoster = (roster: Roster, t: Tournament): Roster => {
  const next = { ...roster };
  t.entrants.forEach((e, i) => {
    if (i !== HUMAN) next[e.name] = e.skill;
  });
  for (const e of t.background ?? []) next[e.name] = e.skill;
  return next;
};

/** Validates state loaded from storage; returns null if it is unusable. */
export const parseTournament = (raw: unknown): Tournament | null => {
  const t = raw as Tournament;
  if (!t || t.version !== 2 || typeof t.number !== 'number' || !Array.isArray(t.entrants) || t.entrants.length !== 8) return null;
  if (!Array.isArray(t.draws) || t.draws.length < 1 || t.draws.length > ROUND_NAMES.length) return null;
  if (!Array.isArray(t.results) || !['playing', 'won', 'lost'].includes(t.status)) return null;
  return t;
};
