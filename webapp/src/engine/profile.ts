import { HUMAN, ROUND_NAMES, type Tournament } from './tournament';

export type TournamentOutcome = 'playing' | 'won' | 'lost';

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
}

export const emptyProfile = (): Profile => ({ version: 1, nextTournament: 1, tournaments: [] });

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
    nextTournament: Math.max(p.nextTournament, record.number + 1),
    tournaments: [...others, record].sort((a, b) => a.number - b.number),
  };
};

export const profileStats = (p: Profile) => {
  const matches = p.tournaments.flatMap((t) => t.matches);
  return {
    tournaments: p.tournaments.length,
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
  }
};

export const parseProfile = (raw: unknown): Profile | null => {
  const p = raw as Profile;
  if (!p || p.version !== 1 || typeof p.nextTournament !== 'number' || !Array.isArray(p.tournaments)) return null;
  return p;
};
