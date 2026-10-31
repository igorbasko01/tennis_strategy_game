import {
  ATTACK_COST,
  DEFEND_MODIFIER,
  SERVE_COST,
  SERVE_RECEIVE_MODIFIER,
  type AttackAction,
  type DefendAction,
  type ServeAction,
  type ServeReceiveAction,
} from './actions';

export type PlayerIndex = 0 | 1;
export const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

/** Returns a float in [0, 1). */
export type Rng = () => number;

/** Random factor is uniform in [-RANDOM_RANGE, +RANDOM_RANGE]. */
export const RANDOM_RANGE = 0.3;

export const rollRandomFactor = (rng: Rng): number => (rng() * 2 - 1) * RANDOM_RANGE;

/**
 * Share of a player's read modifier that carries into the next shot they hit:
 * a good read puts them in position, a bad one leaves them stretched.
 */
export const POSITION_FACTOR = 1 / 3;

/** Position bonus/penalty for the shot that follows a read with this modifier. */
export const positionFromRead = (readModifier: number): number =>
  Math.round(readModifier * POSITION_FACTOR * 100) / 100;

/** skill + modifier + position + random, kept separate so the UI can show the breakdown. */
export interface Calculation {
  skill: number;
  modifier: number;
  /** Carry-over from the hitter's previous read; always 0 for reads. */
  position: number;
  random: number;
  total: number;
}

export const calculate = (skill: number, modifier: number, random: number, position = 0): Calculation => ({
  skill,
  modifier,
  position,
  random,
  total: skill + modifier + position + random,
});

/** The server's bundled decision: serve target + where to recover for the return. */
export interface ServerChoice {
  kind: 'server';
  serveTarget: ServeAction;
  anticipation: DefendAction;
}

/** The receiver's bundled decision: where to read the serve + where to return it. */
export interface ReceiverChoice {
  kind: 'receiver';
  anticipation: ServeReceiveAction;
  returnTarget: AttackAction;
}

/** A rally decision: where to attack + where to cover the opponent's reply. */
export interface RallyChoice {
  kind: 'rally';
  attack: AttackAction;
  anticipation: DefendAction;
}

export type Choice = ServerChoice | ReceiverChoice | RallyChoice;

export type DuelKind = 'serve' | 'return' | 'attack' | 'counter';

/** One shot against one read. */
export interface Duel {
  kind: DuelKind;
  hitter: PlayerIndex;
  defender: PlayerIndex;
  /** ServeAction for serves, AttackAction otherwise. */
  shot: ServeAction | AttackAction;
  /** ServeReceiveAction for serves, DefendAction otherwise. */
  read: ServeReceiveAction | DefendAction;
  shotCalc: Calculation;
  readCalc: Calculation;
  /** True when the shot beat the read (shot total strictly greater). */
  hitterWins: boolean;
}

/** Up to two duels: the first hitter's shot, then (if it was handled) the reply. */
export interface Exchange {
  phase: 'serve' | 'rally';
  duels: Duel[];
  pointWinner: PlayerIndex | null;
}

export const resolveDuel = (
  kind: DuelKind,
  hitter: PlayerIndex,
  hitterSkill: number,
  shot: ServeAction | AttackAction,
  shotCost: number,
  defenderSkill: number,
  read: ServeReceiveAction | DefendAction,
  readModifier: number,
  rng: Rng,
  hitterPosition = 0,
): Duel => {
  const shotCalc = calculate(hitterSkill, shotCost, rollRandomFactor(rng), hitterPosition);
  const readCalc = calculate(defenderSkill, readModifier, rollRandomFactor(rng));
  return {
    kind,
    hitter,
    defender: other(hitter),
    shot,
    read,
    shotCalc,
    readCalc,
    hitterWins: shotCalc.total > readCalc.total,
  };
};

/** Phase A + B of the design: serve vs read, then return vs the server's recovery. */
export const resolveServeExchange = (
  server: PlayerIndex,
  skills: readonly [number, number],
  serverChoice: ServerChoice,
  receiverChoice: ReceiverChoice,
  rng: Rng,
): Exchange => {
  const receiver = other(server);
  const serve = resolveDuel(
    'serve',
    server,
    skills[server],
    serverChoice.serveTarget,
    SERVE_COST[serverChoice.serveTarget],
    skills[receiver],
    receiverChoice.anticipation,
    SERVE_RECEIVE_MODIFIER[serverChoice.serveTarget][receiverChoice.anticipation],
    rng,
  );
  if (serve.hitterWins) return { phase: 'serve', duels: [serve], pointWinner: server };

  const ret = resolveDuel(
    'return',
    receiver,
    skills[receiver],
    receiverChoice.returnTarget,
    ATTACK_COST[receiverChoice.returnTarget],
    skills[server],
    serverChoice.anticipation,
    DEFEND_MODIFIER[receiverChoice.returnTarget][serverChoice.anticipation],
    rng,
    positionFromRead(serve.readCalc.modifier),
  );
  return { phase: 'serve', duels: [serve, ret], pointWinner: ret.hitterWins ? receiver : null };
};

/**
 * A rally exchange: the striker attacks, and if covered the defender counters.
 * `strikerPosition` carries over from the striker's read in the previous exchange.
 */
export const resolveRallyExchange = (
  striker: PlayerIndex,
  skills: readonly [number, number],
  strikerChoice: RallyChoice,
  defenderChoice: RallyChoice,
  rng: Rng,
  strikerPosition = 0,
): Exchange => {
  const defender = other(striker);
  const attack = resolveDuel(
    'attack',
    striker,
    skills[striker],
    strikerChoice.attack,
    ATTACK_COST[strikerChoice.attack],
    skills[defender],
    defenderChoice.anticipation,
    DEFEND_MODIFIER[strikerChoice.attack][defenderChoice.anticipation],
    rng,
    strikerPosition,
  );
  if (attack.hitterWins) return { phase: 'rally', duels: [attack], pointWinner: striker };

  const counter = resolveDuel(
    'counter',
    defender,
    skills[defender],
    defenderChoice.attack,
    ATTACK_COST[defenderChoice.attack],
    skills[striker],
    strikerChoice.anticipation,
    DEFEND_MODIFIER[defenderChoice.attack][strikerChoice.anticipation],
    rng,
    positionFromRead(attack.readCalc.modifier),
  );
  return { phase: 'rally', duels: [attack, counter], pointWinner: counter.hitterWins ? defender : null };
};
