import { ATTACK_ACTIONS, DEFEND_ACTIONS, SERVE_ACTIONS, SERVE_RECEIVE_ACTIONS } from './actions';
import type { Match } from './match';
import type { Choice, PlayerIndex, Rng } from './resolution';

const pick = <T>(options: readonly T[], rng: Rng): T => options[Math.floor(rng() * options.length)];

/** A CPU opponent that picks every decision uniformly at random. */
export class AiOpponent {
  constructor(private readonly rng: Rng = Math.random) {}

  choose(match: Match, me: PlayerIndex): Choice {
    const kind = match.expectedChoice(me);
    if (kind === 'server') {
      return { kind, serveTarget: pick(SERVE_ACTIONS, this.rng), anticipation: pick(DEFEND_ACTIONS, this.rng) };
    }
    if (kind === 'receiver') {
      return { kind, anticipation: pick(SERVE_RECEIVE_ACTIONS, this.rng), returnTarget: pick(ATTACK_ACTIONS, this.rng) };
    }
    return { kind, attack: pick(ATTACK_ACTIONS, this.rng), anticipation: pick(DEFEND_ACTIONS, this.rng) };
  }
}
