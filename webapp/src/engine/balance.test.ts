import { describe, expect, it } from 'vitest';
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
  type ServeAction,
  type ServeReceiveAction,
} from './actions';
import { RANDOM_RANGE } from './resolution';

/**
 * Exact probability that a shot beats a read at equal skill when the shot's
 * deterministic part leads by `margin`. Each side rolls uniform luck in
 * [-R, R], so the luck difference is triangular on [-2R, 2R].
 */
const winProbability = (margin: number): number => {
  const w = 2 * RANDOM_RANGE;
  const t = -margin; // the shot wins when luckShot - luckRead > t
  if (t >= w) return 0;
  if (t <= -w) return 1;
  return t >= 0 ? (w - t) ** 2 / (2 * w * w) : 1 - (w + t) ** 2 / (2 * w * w);
};

const margin = (a: AttackAction, d: AttackAction) => ATTACK_COST[a] - DEFEND_MODIFIER[a][d];

describe('rally balance', () => {
  it('keeps every attack between 45% and 65% against random reads', () => {
    for (const a of ATTACK_ACTIONS) {
      const p = DEFEND_ACTIONS.reduce((sum, d) => sum + winProbability(margin(a, d)), 0) / DEFEND_ACTIONS.length;
      expect(p, a).toBeGreaterThan(0.45);
      expect(p, a).toBeLessThan(0.65);
    }
  });

  it('has no attack that is at least as good as another against every read', () => {
    for (const a of ATTACK_ACTIONS) {
      for (const b of ATTACK_ACTIONS) {
        if (a === b) continue;
        const dominates = DEFEND_ACTIONS.every((d) => margin(a, d) >= margin(b, d));
        expect(dominates, `${a} dominates ${b}`).toBe(false);
      }
    }
  });

  it('lets every attack beat some wrong read without luck', () => {
    for (const a of ATTACK_ACTIONS) {
      expect(Math.max(...DEFEND_ACTIONS.map((d) => margin(a, d))), a).toBeGreaterThan(0);
    }
  });
});

const serveMargin = (s: ServeAction, r: ServeReceiveAction) => SERVE_COST[s] - SERVE_RECEIVE_MODIFIER[s][r];

describe('serve balance', () => {
  it('keeps every serve between 45% and 60% against random reads', () => {
    for (const sv of SERVE_ACTIONS) {
      const p = SERVE_RECEIVE_ACTIONS.reduce((sum, r) => sum + winProbability(serveMargin(sv, r)), 0) / SERVE_RECEIVE_ACTIONS.length;
      expect(p, sv).toBeGreaterThan(0.45);
      expect(p, sv).toBeLessThan(0.6);
    }
  });

  it('has no serve that is at least as good as another against every read', () => {
    for (const a of SERVE_ACTIONS) {
      for (const b of SERVE_ACTIONS) {
        if (a === b) continue;
        const dominates = SERVE_RECEIVE_ACTIONS.every((r) => serveMargin(a, r) >= serveMargin(b, r));
        expect(dominates, `${a} dominates ${b}`).toBe(false);
      }
    }
  });

  it('lets every serve beat every wrong read without luck', () => {
    for (const sv of SERVE_ACTIONS) {
      for (const r of SERVE_RECEIVE_ACTIONS) {
        if (SERVE_RECEIVE_MODIFIER[sv][r] < 0) expect(serveMargin(sv, r), `${sv} vs ${r}`).toBeGreaterThan(0);
      }
    }
  });
});
