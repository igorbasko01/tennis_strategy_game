import { AiOpponent } from './ai';
import { Match } from './match';
import type { Rng } from './resolution';
import { CPU_RANDOM_REST, CPU_REST_THRESHOLD, FULL_ENERGY, restBetweenMatches, restBySkipping } from './energy';
import { MATCH_SCORING, type ScoringConfig } from './scoring';
import { STYLES, type StyleId } from './styles';

/** Starting skill for CPU entrants, and for a human with no saved skill yet. */
export const TOURNAMENT_START_SKILL = 0.3;
export const MAX_SKILL = 1;
/** Each round a player wins adds a random gain of 0.01-0.05, in 0.01 steps. */
export const TOURNAMENT_MIN_GAIN = 0.01;
export const TOURNAMENT_MAX_GAIN = 0.05;
export const ROUND_NAMES = ['Quarterfinal', 'Semifinal', 'Final'] as const;
export const HUMAN = 0;

export const CPU_NAMES = ['Ana', 'Bruno', 'Chen', 'Dara', 'Elio', 'Freya', 'Goran', 'Hana', 'Ivo', 'Jules', 'Kai', 'Lena', 'Milo', 'Nia', 'Oscar'];
/** Players per draw. With 15 CPUs plus the human there are two draws; empty slots are byes. */
const DRAW_SIZE = 8;

/** Each player's energy carried between tournaments, by name ('You' for the player). */
export type Energies = Record<string, number>;

export interface Entrant {
  name: string;
  skill: number;
  /** CPU playing style; absent for the human. */
  style?: StyleId;
  /** Energy going into this player's next match of the tournament (0-1); full when absent. */
  energy?: number;
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
   * Every CPU not in the player's draw, with its skill and energy afterwards:
   * those in the simultaneous background draw, and those sitting this one out.
   * Not shown to the player.
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

/** A random skill gain of 0.01-0.05 in 0.01 steps, each equally likely. */
export const rollGain = (rng: Rng): number => {
  const steps = Math.round((TOURNAMENT_MAX_GAIN - TOURNAMENT_MIN_GAIN) * 100) + 1;
  return Math.round(TOURNAMENT_MIN_GAIN * 100 + Math.floor(rng() * steps)) / 100;
};

/** CPU players' skills carried over from earlier tournaments, by name. */
export type Roster = Record<string, number>;

/**
 * Splits the CPUs into those who enter and those who sit out to rest: tired
 * CPUs rest, and any CPU may rest at random. At least `minPlaying` enter; the
 * freshest resters are called back if needed.
 */
const chooseEntrants = (cpus: Entrant[], rng: Rng, minPlaying: number) => {
  const playing: Entrant[] = [];
  const resting: Entrant[] = [];
  for (const c of cpus) {
    const tired = (c.energy ?? FULL_ENERGY) < CPU_REST_THRESHOLD;
    (tired || rng() < CPU_RANDOM_REST ? resting : playing).push(c);
  }
  resting.sort((a, b) => (b.energy ?? FULL_ENERGY) - (a.energy ?? FULL_ENERGY));
  while (playing.length < minPlaying && resting.length) playing.push(resting.shift()!);
  return { playing, resting: resting.map((c) => ({ ...c, energy: restBySkipping(c.energy ?? FULL_ENERGY) })) };
};

const loadCpus = (rng: Rng, roster: Roster, styles: Record<string, StyleId>, energies: Energies): Entrant[] =>
  shuffled(CPU_NAMES, rng).map(
    (name): Entrant => ({
      name,
      skill: roster[name] ?? TOURNAMENT_START_SKILL,
      style: styles[name] ?? 'balanced',
      energy: energies[name] ?? FULL_ENERGY,
    }),
  );

/**
 * Starts the player's next tournament. `humanSkill` and `energies` carry over
 * from earlier tournaments. Seven CPUs join the player's draw; the others play a
 * simultaneous background draw or sit it out to rest.
 */
export const createTournament = (
  rng: Rng = Math.random,
  humanSkill = TOURNAMENT_START_SKILL,
  number = 1,
  roster: Roster = {},
  styles: Record<string, StyleId> = {},
  energies: Energies = {},
): Tournament => {
  const { playing, resting } = chooseEntrants(loadCpus(rng, roster, styles, energies), rng, DRAW_SIZE - 1);
  const entrants: Entrant[] = [{ name: 'You', skill: humanSkill, energy: energies.You ?? FULL_ENERGY }, ...playing.slice(0, DRAW_SIZE - 1)];
  const background = [...playKnockout(playing.slice(DRAW_SIZE - 1), rng), ...resting];
  // The human's slot in the draw is random; the bracket pairs neighbours.
  const draw = shuffled(
    entrants.map((_, i) => i),
    rng,
  );
  return { version: 2, number, startSkill: humanSkill, entrants, draws: [draw], results: [], status: 'playing', background };
};

/**
 * Plays a whole CPU knockout of up to DRAW_SIZE players and returns them with
 * their skill and energy afterwards. Empty slots are byes: the player drawn
 * against one goes through without playing, gaining nothing and spending nothing.
 */
const playKnockout = (players: Entrant[], rng: Rng): Entrant[] => {
  const out = players.map((p) => ({ ...p }));
  if (out.length === 0) return out;
  let alive: (number | null)[] = shuffled(
    [...out.map((_, i) => i), ...Array<null>(DRAW_SIZE - out.length).fill(null)],
    rng,
  );
  while (alive.length > 1) {
    const winners: (number | null)[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const [x, y] = [alive[i], alive[i + 1]];
      if (x === null || y === null) {
        winners.push(x ?? y);
        continue;
      }
      const pair = [x, y];
      const sim = simulateMatch([out[pair[0]].skill, out[pair[1]].skill], rng, [out[pair[0]].style, out[pair[1]].style], [
        out[pair[0]].energy ?? FULL_ENERGY,
        out[pair[1]].energy ?? FULL_ENERGY,
      ]);
      out[pair[0]].energy = restBetweenMatches(sim.energy[0]);
      out[pair[1]].energy = restBetweenMatches(sim.energy[1]);
      const w = out[pair[sim.winner]];
      w.skill = Math.min(MAX_SKILL, round2(w.skill + rollGain(rng)));
      winners.push(pair[sim.winner]);
    }
    alive = winners;
  }
  return out;
};

/**
 * Plays a whole tournament without the player, who sits it out to rest. Every
 * CPU who enters plays in one of two draws (with byes for any empty slots).
 * Returns every CPU with its skill and energy afterwards.
 */
export const playTournamentWithoutPlayer = (
  rng: Rng = Math.random,
  roster: Roster = {},
  styles: Record<string, StyleId> = {},
  energies: Energies = {},
): Entrant[] => {
  const { playing, resting } = chooseEntrants(loadCpus(rng, roster, styles, energies), rng, 0);
  return [...playKnockout(playing.slice(0, DRAW_SIZE), rng), ...playKnockout(playing.slice(DRAW_SIZE), rng), ...resting];
};

/** Everyone's energy after this tournament, merged into the carried energies. */
export const updateEnergies = (energies: Energies, t: Tournament): Energies => {
  const next = { ...energies };
  for (const e of [...t.entrants, ...(t.background ?? [])]) next[e.name] = e.energy ?? FULL_ENERGY;
  return next;
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
export const simulateMatch = (
  skills: readonly [number, number],
  rng: Rng,
  styles: readonly [StyleId | undefined, StyleId | undefined] = [undefined, undefined],
  energy: readonly [number, number] = [FULL_ENERGY, FULL_ENERGY],
  scoring: ScoringConfig = MATCH_SCORING,
) => {
  const m = new Match(
    [
      { name: 'A', skill: skills[0] },
      { name: 'B', skill: skills[1] },
    ],
    scoring,
    rng() < 0.5 ? 0 : 1,
    energy,
  );
  const ai = styles.map((s) => new AiOpponent(rng, s && STYLES[s]));
  while (!m.isOver) {
    m.submit(0, ai[0].choose(m, 0));
    m.submit(1, ai[1].choose(m, 1));
    m.resolve(rng);
  }
  const winner = m.score.winner!;
  return { winner, sets: m.score.completedSets, energy: m.energy };
};

const scoreLabel = (sets: [number, number][], winnerSide: 0 | 1) =>
  sets.map((s) => `${s[winnerSide]}–${s[1 - winnerSide]}`).join(' ');

/**
 * Records the human's match in the current round, simulates the other matches,
 * gives every winner a random skill gain, and advances the draw.
 * `sets` are the completed set scores with the human's games first; `energy` is
 * [human, opponent] energy at the end of the match.
 */
export const recordHumanMatch = (
  t: Tournament,
  humanWon: boolean,
  sets: [number, number][],
  rng: Rng = Math.random,
  energy: readonly [number, number] = [FULL_ENERGY, FULL_ENERGY],
): Tournament => {
  if (t.status !== 'playing') throw new Error('Tournament is over');
  const next: Tournament = structuredClone(t);
  playRound(next, rng, { won: humanWon, sets, energy });
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
const playRound = (
  t: Tournament,
  rng: Rng,
  human?: { won: boolean; sets: [number, number][]; energy: readonly [number, number] },
): void => {
  const round = currentRound(t);
  const results: MatchResult[] = [];
  for (const pair of pairings(t, round)) {
    const skills: [number, number] = [t.entrants[pair[0]].skill, t.entrants[pair[1]].skill];
    if (human && pair.includes(HUMAN)) {
      const opponent = pair[0] === HUMAN ? pair[1] : pair[0];
      const winner = human.won ? HUMAN : opponent;
      results.push({ players: pair, winner, score: scoreLabel(human.sets, human.won ? 0 : 1), skills });
      t.entrants[HUMAN].energy = restBetweenMatches(human.energy[0]);
      t.entrants[opponent].energy = restBetweenMatches(human.energy[1]);
    } else {
      const [a, b] = [t.entrants[pair[0]], t.entrants[pair[1]]];
      const sim = simulateMatch(skills, rng, [a.style, b.style], [a.energy ?? FULL_ENERGY, b.energy ?? FULL_ENERGY]);
      a.energy = restBetweenMatches(sim.energy[0]);
      b.energy = restBetweenMatches(sim.energy[1]);
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
