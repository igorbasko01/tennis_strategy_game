import type { Rng } from './resolution';
import { assignStyles, type StyleId } from './styles';
import { FULL_ENERGY, restBySkipping } from './energy';
import {
  CPU_NAMES,
  HUMAN,
  ROUND_NAMES,
  TOURNAMENT_START_SKILL,
  updateEnergies,
  updateRoster,
  type Energies,
  type Entrant,
  type Roster,
  type Tournament,
} from './tournament';

export type TournamentOutcome = 'playing' | 'won' | 'lost' | 'skipped';

/** One of the player's matches in a tournament, from the player's side. */
export interface TournamentMatchRecord {
  round: string;
  opponent: string;
  /** The opponent's skill when the match was played. */
  opponentSkill: number;
  won: boolean;
  /** Set scores with the player's games first, e.g. "2–4". */
  score: string;
}

export interface TournamentRecord {
  number: number;
  status: TournamentOutcome;
  startSkill: number;
  endSkill: number;
  matches: TournamentMatchRecord[];
}

/** The player's saved history. Plain JSON. */
export interface Profile {
  version: 1;
  nextTournament: number;
  /** Oldest first. */
  tournaments: TournamentRecord[];
  /** CPU players' skills, carried from one tournament to the next. */
  roster?: Roster;
  /** Everyone's energy carried into the next tournament, by name ('You' for the player). */
  energy?: Energies;
  /** Each CPU player's playing style, dealt out when the profile is created. */
  styles?: Record<string, StyleId>;
}

export const emptyProfile = (rng: Rng = Math.random): Profile => ({
  version: 1,
  nextTournament: 1,
  tournaments: [],
  roster: {},
  styles: assignStyles(CPU_NAMES, rng),
});

/** "4–2 6–3" from the winner's side becomes "2–4 3–6". */
const flipScore = (score: string) =>
  score
    .split(' ')
    .map((set) => set.split('–').reverse().join('–'))
    .join(' ');

export const summarizeTournament = (t: Tournament): TournamentRecord => {
  const matches: TournamentMatchRecord[] = [];
  t.results.forEach((round, r) => {
    const mine = round.find((m) => m.players.includes(HUMAN));
    if (!mine) return;
    const oppSide = mine.players[0] === HUMAN ? 1 : 0;
    const won = mine.winner === HUMAN;
    matches.push({
      round: ROUND_NAMES[r],
      opponent: t.entrants[mine.players[oppSide]].name,
      opponentSkill: mine.skills[oppSide],
      won,
      score: won ? mine.score : flipScore(mine.score),
    });
  });
  return { number: t.number, status: t.status, startSkill: t.startSkill, endSkill: t.entrants[HUMAN].skill, matches };
};

/** Adds or replaces the record for a tournament, keyed by its number. */
export const saveTournamentRecord = (p: Profile, t: Tournament): Profile => {
  const record = summarizeTournament(t);
  const others = p.tournaments.filter((x) => x.number !== record.number);
  return {
    ...p,
    roster: updateRoster(p.roster ?? {}, t),
    energy: updateEnergies(p.energy ?? {}, t),
    nextTournament: Math.max(p.nextTournament, record.number + 1),
    tournaments: [...others, record].sort((a, b) => a.number - b.number),
  };
};

/**
 * Records a tournament the player sat out: it gets its number and a "skipped"
 * entry, the CPUs keep what they gained, and the player rests.
 */
export const recordSkippedTournament = (p: Profile, cpus: Entrant[], playerSkill: number): Profile => {
  const number = p.nextTournament;
  const roster = { ...(p.roster ?? {}) };
  const energy = { ...(p.energy ?? {}) };
  for (const c of cpus) {
    roster[c.name] = c.skill;
    energy[c.name] = c.energy ?? FULL_ENERGY;
  }
  energy.You = restBySkipping(energy.You ?? FULL_ENERGY);
  const record: TournamentRecord = { number, status: 'skipped', startSkill: playerSkill, endSkill: playerSkill, matches: [] };
  return { ...p, roster, energy, nextTournament: number + 1, tournaments: [...p.tournaments, record] };
};

export const profileStats = (p: Profile) => {
  const matches = p.tournaments.flatMap((t) => t.matches);
  return {
    tournaments: p.tournaments.filter((t) => t.status !== 'skipped').length,
    titles: p.tournaments.filter((t) => t.status === 'won').length,
    matchesWon: matches.filter((m) => m.won).length,
    matchesLost: matches.filter((m) => !m.won).length,
  };
};

/** Short description of how a tournament went, e.g. "Knocked out in the semifinal". */
export const outcomeLabel = (r: TournamentRecord): string => {
  const reached = r.matches.length ? r.matches[r.matches.length - 1].round : ROUND_NAMES[0];
  switch (r.status) {
    case 'won':
      return 'Champion';
    case 'lost':
      return `Knocked out in the ${reached.toLowerCase()}`;
    case 'playing':
      return `In progress · ${ROUND_NAMES[r.matches.length]}`;
    case 'skipped':
      return 'Skipped to rest';
  }
};

export interface RankingRow {
  rank: number;
  name: string;
  skill: number;
  isPlayer: boolean;
  /** CPU playing style; absent for the player. */
  style?: StyleId;
  /** Energy going into the next tournament (0-1). */
  energy: number;
}

/**
 * Every CPU player and the player, highest skill first. Equal skills share a
 * rank; the player is listed first among equals, then CPUs by name.
 */
export const rankings = (p: Profile, playerSkill: number): RankingRow[] => {
  const rows = [
    { name: 'You', skill: playerSkill, isPlayer: true, energy: p.energy?.You ?? FULL_ENERGY },
    ...CPU_NAMES.map((name) => ({
      name,
      skill: p.roster?.[name] ?? TOURNAMENT_START_SKILL,
      isPlayer: false,
      style: p.styles?.[name] ?? ('balanced' as StyleId),
      energy: p.energy?.[name] ?? FULL_ENERGY,
    })),
  ].sort((a, b) => b.skill - a.skill || Number(b.isPlayer) - Number(a.isPlayer) || a.name.localeCompare(b.name));
  return rows.map((row) => ({ ...row, rank: 1 + rows.filter((other) => other.skill > row.skill).length }));
};

export const parseProfile = (raw: unknown): Profile | null => {
  const p = raw as Profile;
  if (!p || p.version !== 1 || typeof p.nextTournament !== 'number' || !Array.isArray(p.tournaments)) return null;
  return p;
};
