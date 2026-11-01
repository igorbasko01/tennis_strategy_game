import { ATTACK_ACTIONS, DEFEND_ACTIONS, SERVE_ACTIONS, SERVE_RECEIVE_ACTIONS } from './actions';
import type { Match } from './match';
import type { Choice, PlayerIndex, Rng } from './resolution';
import type { Style } from './styles';

const pick = <K extends string>(options: readonly K[], weights: Record<K, number> | undefined, rng: Rng): K => {
  if (!weights) return options[Math.floor(rng() * options.length)];
  const total = options.reduce((sum, k) => sum + weights[k], 0);
  let r = rng() * total;
  for (const k of options) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return options[options.length - 1];
};

/**
 * A CPU opponent with no memory: it picks every decision from its style's fixed
 * percentages, or uniformly at random without a style.
 */
export class AiOpponent {
  constructor(
    private readonly rng: Rng = Math.random,
    private readonly style?: Style,
  ) {}

  choose(match: Match, me: PlayerIndex): Choice {
    const s = this.style;
    const kind = match.expectedChoice(me);
    if (kind === 'server') {
      return { kind, serveTarget: pick(SERVE_ACTIONS, s?.serve, this.rng), anticipation: pick(DEFEND_ACTIONS, s?.cover, this.rng) };
    }
    if (kind === 'receiver') {
      return {
        kind,
        anticipation: pick(SERVE_RECEIVE_ACTIONS, s?.serveRead, this.rng),
        returnTarget: pick(ATTACK_ACTIONS, s?.attack, this.rng),
      };
    }
    return { kind, attack: pick(ATTACK_ACTIONS, s?.attack, this.rng), anticipation: pick(DEFEND_ACTIONS, s?.cover, this.rng) };
  }
}
