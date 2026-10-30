import {
  ATTACK_ACTIONS,
  ATTACK_COST,
  DEFEND_ACTIONS,
  DEFEND_MODIFIER,
  SERVE_ACTIONS,
  SERVE_COST,
  SERVE_RECEIVE_ACTIONS,
  SERVE_RECEIVE_MODIFIER,
  type AttackAction,
  type DefendAction,
  type ServeAction,
  type ServeReceiveAction,
} from './actions';
import type { Match } from './match';
import type { Choice, Exchange, PlayerIndex, Rng } from './resolution';

export type AiLevel = 'rookie' | 'pro' | 'champion';

/** Softmax temperature per level; null means uniformly random. */
const TEMPERATURE: Record<AiLevel, number | null> = {
  rookie: null,
  pro: 0.35,
  champion: 0.12,
};

type Counts<K extends string> = Record<K, number>;

const ones = <K extends string>(keys: readonly K[]): Counts<K> =>
  Object.fromEntries(keys.map((k) => [k, 1])) as Counts<K>;

const normalize = <K extends string>(counts: Counts<K>): Counts<K> => {
  const keys = Object.keys(counts) as K[];
  const sum = keys.reduce((a, k) => a + counts[k], 0);
  return Object.fromEntries(keys.map((k) => [k, counts[k] / sum])) as Counts<K>;
};

const pick = <K extends string>(keys: readonly K[], scores: (k: K) => number, temperature: number | null, rng: Rng): K => {
  if (temperature === null) return keys[Math.floor(rng() * keys.length)];
  const raw = keys.map((k) => scores(k) / temperature);
  const max = Math.max(...raw);
  const weights = raw.map((v) => Math.exp(v - max));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < keys.length; i++) {
    r -= weights[i];
    if (r <= 0) return keys[i];
  }
  return keys[keys.length - 1];
};

/**
 * A CPU opponent that learns the opponent's tendencies from revealed choices.
 * It predicts where they will hit (to read it) and where they tend to cover
 * (to hit away from it), and samples from a softmax so it stays unpredictable.
 */
export class AiOpponent {
  private readonly temperature: number | null;
  private serveTargets = ones(SERVE_ACTIONS);
  private returnTargets = ones(ATTACK_ACTIONS);
  private rallyAttacks = ones(ATTACK_ACTIONS);
  private serveReads = ones(SERVE_RECEIVE_ACTIONS);
  private defendReads = ones(DEFEND_ACTIONS);

  constructor(
    readonly level: AiLevel,
    private readonly rng: Rng = Math.random,
  ) {
    this.temperature = TEMPERATURE[level];
  }

  choose(match: Match, me: PlayerIndex): Choice {
    const kind = match.expectedChoice(me);
    if (kind === 'server') {
      return { kind, serveTarget: this.chooseServe(), anticipation: this.chooseRead(this.returnTargets) };
    }
    if (kind === 'receiver') {
      return { kind, anticipation: this.chooseServeRead(), returnTarget: this.chooseAttack() };
    }
    return { kind, attack: this.chooseAttack(), anticipation: this.chooseRead(this.rallyAttacks) };
  }

  /** Learn from the opponent's revealed choice for an exchange. */
  observe(opponentChoice: Choice, exchange: Exchange): void {
    // Only learn what was actually revealed by play: reads are always visible,
    // but a return/counter target only shows if that shot was hit.
    const hitKinds = new Set(exchange.duels.map((d) => d.kind));
    switch (opponentChoice.kind) {
      case 'server':
        this.serveTargets[opponentChoice.serveTarget]++;
        if (hitKinds.has('return')) this.defendReads[opponentChoice.anticipation]++;
        break;
      case 'receiver':
        this.serveReads[opponentChoice.anticipation]++;
        if (hitKinds.has('return')) this.returnTargets[opponentChoice.returnTarget]++;
        break;
      case 'rally':
        this.defendReads[opponentChoice.anticipation]++;
        this.rallyAttacks[opponentChoice.attack]++;
        break;
    }
  }

  private chooseServe(): ServeAction {
    const reads = normalize(this.serveReads);
    const value = (s: ServeAction) =>
      SERVE_COST[s] - SERVE_RECEIVE_ACTIONS.reduce((a, r) => a + reads[r] * SERVE_RECEIVE_MODIFIER[s][r], 0);
    return pick(SERVE_ACTIONS, value, this.temperature, this.rng);
  }

  private chooseServeRead(): ServeReceiveAction {
    const serves = normalize(this.serveTargets);
    const value = (r: ServeReceiveAction) =>
      SERVE_ACTIONS.reduce((a, s) => a + serves[s] * SERVE_RECEIVE_MODIFIER[s][r], 0);
    return pick(SERVE_RECEIVE_ACTIONS, value, this.temperature, this.rng);
  }

  private chooseAttack(): AttackAction {
    const reads = normalize(this.defendReads);
    const value = (a: AttackAction) =>
      ATTACK_COST[a] - DEFEND_ACTIONS.reduce((acc, d) => acc + reads[d] * DEFEND_MODIFIER[a][d], 0);
    return pick(ATTACK_ACTIONS, value, this.temperature, this.rng);
  }

  private chooseRead(attackCounts: Counts<AttackAction>): DefendAction {
    const attacks = normalize(attackCounts);
    const value = (d: DefendAction) => ATTACK_ACTIONS.reduce((acc, a) => acc + attacks[a] * DEFEND_MODIFIER[a][d], 0);
    return pick(DEFEND_ACTIONS, value, this.temperature, this.rng);
  }
}
