import { other, type PlayerIndex } from './resolution';

export interface ScoringConfig {
  /** Sets needed to win the match (1 = single set, 2 = best of three). */
  setsToWin: number;
  /** Games needed to win a set; a tiebreak is played at gamesPerSet-all. */
  gamesPerSet: number;
}

export type PointEvent = 'point' | 'game' | 'set' | 'match';

const TIEBREAK_POINTS = 7;
const POINT_NAMES = ['0', '15', '30', '40'];

/** Standard tennis scoring: points -> games -> sets, with deuce and tiebreaks. */
export class Score {
  readonly config: ScoringConfig;
  /** Final game counts of completed sets. */
  readonly completedSets: [number, number][] = [];
  games: [number, number] = [0, 0];
  points: [number, number] = [0, 0];
  setsWon: [number, number] = [0, 0];
  tiebreak = false;
  winner: PlayerIndex | null = null;
  /** Server of the current (non-tiebreak) game, or the first server of a tiebreak. */
  private gameServer: PlayerIndex;

  constructor(config: ScoringConfig, firstServer: PlayerIndex = 0) {
    this.config = config;
    this.gameServer = firstServer;
  }

  get server(): PlayerIndex {
    if (!this.tiebreak) return this.gameServer;
    // Tiebreak: first server serves one point, then players alternate every two.
    const n = this.points[0] + this.points[1];
    return Math.floor((n + 1) / 2) % 2 === 0 ? this.gameServer : other(this.gameServer);
  }

  /** Deuce court on even point counts, ad court on odd. */
  get serveSide(): 'deuce' | 'ad' {
    return (this.points[0] + this.points[1]) % 2 === 0 ? 'deuce' : 'ad';
  }

  pointWon(p: PlayerIndex): PointEvent {
    if (this.winner !== null) throw new Error('Match is already over');
    this.points[p]++;
    const o = other(p);
    const target = this.tiebreak ? TIEBREAK_POINTS : 4;
    if (this.points[p] < target || this.points[p] - this.points[o] < 2) return 'point';
    return this.gameWon(p);
  }

  private gameWon(p: PlayerIndex): PointEvent {
    const wasTiebreak = this.tiebreak;
    this.games[p]++;
    this.points = [0, 0];
    this.tiebreak = false;
    // After a tiebreak the player who received first in it serves the next game,
    // which is the same as alternating from the tiebreak's first server.
    this.gameServer = other(this.gameServer);

    const o = other(p);
    const g = this.config.gamesPerSet;
    const setOver = wasTiebreak || (this.games[p] >= g && this.games[p] - this.games[o] >= 2);
    if (!setOver) {
      if (this.games[0] === g && this.games[1] === g) this.tiebreak = true;
      return 'game';
    }

    this.completedSets.push([...this.games] as [number, number]);
    this.setsWon[p]++;
    this.games = [0, 0];
    if (this.setsWon[p] >= this.config.setsToWin) {
      this.winner = p;
      return 'match';
    }
    return 'set';
  }

  /** Human-readable point score for a player, e.g. "40", "AD", or a tiebreak count. */
  pointLabel(p: PlayerIndex): string {
    if (this.tiebreak) return String(this.points[p]);
    const mine = this.points[p];
    const theirs = this.points[other(p)];
    if (mine >= 3 && theirs >= 3) {
      if (mine === theirs) return '40';
      return mine > theirs ? 'AD' : '40';
    }
    return POINT_NAMES[mine];
  }

  /** Short call for the current game state, e.g. "Deuce", "Break point". */
  situation(): string | null {
    if (this.tiebreak) return 'Tiebreak';
    const [a, b] = this.points;
    if (a >= 3 && b >= 3 && a === b) return 'Deuce';
    const s = this.server;
    const r = other(s);
    const receiverGamePoint = this.points[r] >= 3 && this.points[r] > this.points[s];
    if (receiverGamePoint) return 'Break point';
    if (this.points[s] >= 3 && this.points[s] > this.points[r]) return 'Game point';
    return null;
  }
}
