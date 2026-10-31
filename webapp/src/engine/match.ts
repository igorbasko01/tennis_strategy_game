import {
  other,
  positionFromRead,
  resolveRallyExchange,
  resolveServeExchange,
  type Choice,
  type Exchange,
  type PlayerIndex,
  type RallyChoice,
  type ReceiverChoice,
  type Rng,
  type ServerChoice,
} from './resolution';
import { Score, type PointEvent, type ScoringConfig } from './scoring';

export interface PlayerConfig {
  name: string;
  /** 0.0 - 1.0 */
  skill: number;
}

export interface PlayerStats {
  pointsWon: number;
  aces: number;
  winners: number;
  servicePointsPlayed: number;
  servicePointsWon: number;
  readsMade: number;
  readsCorrect: number;
  longestRally: number;
}

export type ChoiceKind = Choice['kind'];

export interface ExchangeOutcome {
  exchange: Exchange;
  /** Set when the exchange ended the point. */
  event: PointEvent | null;
  /** Number of exchanges played in the point so far, including this one. */
  exchangeNumber: number;
}

const emptyStats = (): PlayerStats => ({
  pointsWon: 0,
  aces: 0,
  winners: 0,
  servicePointsPlayed: 0,
  servicePointsWon: 0,
  readsMade: 0,
  readsCorrect: 0,
  longestRally: 0,
});

/**
 * Coordinates a match between two players: tracks whose decision is needed,
 * collects simultaneous choices, resolves exchanges and updates the score.
 */
export class Match {
  readonly players: readonly [PlayerConfig, PlayerConfig];
  readonly score: Score;
  readonly stats: [PlayerStats, PlayerStats] = [emptyStats(), emptyStats()];
  /** 'serve' at the start of each point, 'rally' after an exchange where both shots were handled. */
  phase: 'serve' | 'rally' = 'serve';
  /** Exchanges completed in the current point. */
  exchangeCount = 0;
  /** Position carry-over for the server's first shot of the next rally exchange. */
  private strikerPosition = 0;
  private choices: [Choice | null, Choice | null] = [null, null];

  constructor(players: readonly [PlayerConfig, PlayerConfig], scoring: ScoringConfig, firstServer: PlayerIndex = 0) {
    for (const p of players) {
      if (p.skill < 0 || p.skill > 1) throw new Error('Skill must be between 0.0 and 1.0');
    }
    this.players = players;
    this.score = new Score(scoring, firstServer);
  }

  get server(): PlayerIndex {
    return this.score.server;
  }

  get receiver(): PlayerIndex {
    return other(this.score.server);
  }

  get isOver(): boolean {
    return this.score.winner !== null;
  }

  /** The kind of choice player p must submit for the current exchange. */
  expectedChoice(p: PlayerIndex): ChoiceKind {
    if (this.phase === 'rally') return 'rally';
    return p === this.server ? 'server' : 'receiver';
  }

  submit(p: PlayerIndex, choice: Choice): void {
    if (this.isOver) throw new Error('Match is over');
    const expected = this.expectedChoice(p);
    if (choice.kind !== expected) throw new Error(`Player ${p} must submit a ${expected} choice, got ${choice.kind}`);
    this.choices[p] = choice;
  }

  hasSubmitted(p: PlayerIndex): boolean {
    return this.choices[p] !== null;
  }

  get bothReady(): boolean {
    return this.choices[0] !== null && this.choices[1] !== null;
  }

  /** The choices locked in for the exchange about to be resolved. */
  get lockedChoices(): readonly [Choice | null, Choice | null] {
    return this.choices;
  }

  resolve(rng: Rng): ExchangeOutcome {
    if (!this.bothReady) throw new Error('Both players must submit before resolving');
    const s = this.server;
    const r = this.receiver;
    const skills = [this.players[0].skill, this.players[1].skill] as const;
    const exchange =
      this.phase === 'serve'
        ? resolveServeExchange(s, skills, this.choices[s] as ServerChoice, this.choices[r] as ReceiverChoice, rng)
        : resolveRallyExchange(s, skills, this.choices[s] as RallyChoice, this.choices[r] as RallyChoice, rng, this.strikerPosition);

    this.choices = [null, null];
    this.exchangeCount++;
    const exchangeNumber = this.exchangeCount;
    this.recordDuelStats(exchange);

    if (exchange.pointWinner === null) {
      // The server covered the last shot, so their read sets up their next attack.
      const last = exchange.duels[exchange.duels.length - 1];
      this.strikerPosition = positionFromRead(last.readCalc.modifier);
      this.phase = 'rally';
      return { exchange, event: null, exchangeNumber };
    }

    const winner = exchange.pointWinner;
    this.recordPointStats(exchange, winner, s);
    const event = this.score.pointWon(winner);
    this.phase = 'serve';
    this.exchangeCount = 0;
    this.strikerPosition = 0;
    return { exchange, event, exchangeNumber };
  }

  private recordDuelStats(exchange: Exchange): void {
    for (const duel of exchange.duels) {
      const d = this.stats[duel.defender];
      d.readsMade++;
      if (duel.readCalc.modifier > 0) d.readsCorrect++;
    }
  }

  private recordPointStats(exchange: Exchange, winner: PlayerIndex, server: PlayerIndex): void {
    const shotsInPoint = (this.exchangeCount - 1) * 2 + exchange.duels.length;
    const w = this.stats[winner];
    w.pointsWon++;
    const last = exchange.duels[exchange.duels.length - 1];
    if (last.kind === 'serve') w.aces++;
    else w.winners++;
    this.stats[server].servicePointsPlayed++;
    if (winner === server) this.stats[server].servicePointsWon++;
    for (const st of this.stats) st.longestRally = Math.max(st.longestRally, shotsInPoint);
  }
}
