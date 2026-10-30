import type { AttackAction, DefendAction, ServeAction, ServeReceiveAction } from '../engine/actions';
import type { PlayerIndex } from '../engine/resolution';

// Court geometry in metres. x runs across the court, z along it; player 0 is on
// the near (+z) half facing -z, player 1 on the far (-z) half facing +z.
export const COURT = {
  halfLength: 11.885,
  singlesHalfWidth: 4.115,
  doublesHalfWidth: 5.485,
  serviceLine: 6.4,
  netHeightCenter: 0.914,
  netHeightPost: 1.07,
} as const;

export type ServeSide = 'deuce' | 'ad';

export interface Spot {
  x: number;
  z: number;
}

/** +1 for the near player, -1 for the far player. */
export const sideSign = (p: PlayerIndex): 1 | -1 => (p === 0 ? 1 : -1);

/**
 * Converts a player's local frame to world space. `lateral` is measured toward
 * the player's right; `depth` is distance from the net on the player's own half
 * (positive) or the opponent's half (negative).
 */
export const fromLocal = (p: PlayerIndex, lateral: number, depth: number): Spot => {
  const s = sideSign(p);
  return { x: s * lateral, z: s * depth };
};

/** Lateral position of a world spot in player p's frame (positive = their right). */
export const lateralOf = (p: PlayerIndex, spot: Spot): number => sideSign(p) * spot.x;

const deuceSign = (side: ServeSide): 1 | -1 => (side === 'deuce' ? 1 : -1);

export const serverStart = (server: PlayerIndex, side: ServeSide): Spot =>
  fromLocal(server, deuceSign(side) * 0.8, COURT.halfLength + 0.3);

export const receiverStart = (receiver: PlayerIndex, side: ServeSide): Spot =>
  fromLocal(receiver, deuceSign(side) * 2.4, COURT.halfLength + 0.2);

const SERVE_LATERAL: Record<ServeAction, number> = { wide: 3.55, body: 2.05, tLine: 0.35 };

/** Where the serve bounces, in world space. */
export const serveLanding = (server: PlayerIndex, side: ServeSide, serve: ServeAction): Spot =>
  fromLocal(server, -deuceSign(side) * SERVE_LATERAL[serve], -(COURT.serviceLine - 0.9));

/** Where the receiver meets the serve. */
export const serveContact = (server: PlayerIndex, side: ServeSide, serve: ServeAction): Spot => {
  const spread = serve === 'wide' ? 1.25 : serve === 'body' ? 1.0 : 0.6;
  return fromLocal(server, -deuceSign(side) * SERVE_LATERAL[serve] * spread, -(COURT.halfLength + 0.4));
};

const READ_LATERAL: Record<ServeReceiveAction, number> = { wide: 3.6, neutral: 2.0, tLine: 0.6 };

/** Where the receiver positions for a given serve read. */
export const serveReadSpot = (receiver: PlayerIndex, side: ServeSide, read: ServeReceiveAction): Spot =>
  fromLocal(receiver, deuceSign(side) * READ_LATERAL[read], COURT.halfLength + 0.3);

/** World-x sign of the half of the court the hitter is on; near the centre it is their forehand side. */
const courtSide = (hitter: PlayerIndex, from: Spot): 1 | -1 => {
  if (Math.abs(from.x) >= 0.05) return from.x > 0 ? 1 : -1;
  return sideSign(hitter);
};

/** Where an attack bounces on the opponent's half. */
export const attackLanding = (hitter: PlayerIndex, from: Spot, attack: AttackAction): Spot => {
  const s = courtSide(hitter, from);
  const deep = (depth: number) => -sideSign(hitter) * depth;
  switch (attack) {
    case 'crossCourt':
      return { x: -s * 2.9, z: deep(9.2) };
    case 'downTheLine':
      // Stays on the hitter's side so the ball travels roughly parallel to the sideline.
      return { x: s * Math.min(Math.max(Math.abs(from.x), 2.2), 3.3), z: deep(9.6) };
    case 'centerDeep':
      return { x: 0.15 * s, z: deep(10.2) };
    case 'dropShot':
      return { x: -s * 1.3, z: deep(1.7) };
  }
};

/** Where the defender has to be to play an attack (or where a read sends them). */
export const attackContact = (hitter: PlayerIndex, from: Spot, attack: AttackAction | DefendAction): Spot => {
  const land = attackLanding(hitter, from, attack);
  const s = sideSign(hitter);
  if (attack === 'dropShot') return { x: land.x * 1.15, z: land.z - s * 1.4 };
  return { x: land.x * 1.12, z: land.z - s * 3.2 };
};

/** A spot well past the defender, for balls that are not reached. */
export const pastSpot = (from: Spot, to: Spot, extra: number): Spot => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: to.x + (dx / len) * extra, z: to.z + (dz / len) * extra };
};

/** Where a player drifts back to between exchanges. */
export const recoverySpot = (p: PlayerIndex, current: Spot): Spot =>
  fromLocal(p, lateralOf(p, current) * 0.35, Math.max(COURT.halfLength - 0.3, Math.abs(current.z)));
