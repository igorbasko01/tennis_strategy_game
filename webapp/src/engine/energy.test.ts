import { describe, expect, it } from 'vitest';
import { AiOpponent } from './ai';
import { CHANGEOVER_RECOVERY, MAX_FATIGUE, POINT_RECOVERY, duelCost, fatiguePenalty, recoveryBonus } from './energy';
import { Match } from './match';
import { resolveServeExchange, type Duel } from './resolution';

const neutral = () => 0.5;
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const players = [
  { name: 'A', skill: 0.3 },
  { name: 'B', skill: 0.3 },
] as const;

describe('energy effects', () => {
  it('costs nothing when fresh and up to MAX_FATIGUE when exhausted', () => {
    expect(fatiguePenalty(1)).toBeCloseTo(0);
    expect(fatiguePenalty(0.5)).toBeCloseTo(-MAX_FATIGUE / 2);
    expect(fatiguePenalty(0)).toBeCloseTo(-MAX_FATIGUE);
  });

  it('lets a fresh player recover half of a wrong read, less as they tire, and nothing for a right read', () => {
    expect(recoveryBonus(-0.6, 1)).toBeCloseTo(0.3);
    expect(recoveryBonus(-0.6, 0.5)).toBeCloseTo(0.15);
    expect(recoveryBonus(-0.6, 0)).toBe(0);
    expect(recoveryBonus(0.3, 1)).toBe(0);
  });

  it('applies fatigue to shots and reads, and recovery to reads only', () => {
    // Wide serve vs a wrong-side T-Line read.
    const server = { kind: 'server', serveTarget: 'wide', anticipation: 'crossCourt' } as const;
    const receiver = { kind: 'receiver', anticipation: 'tLine', returnTarget: 'crossCourt' } as const;
    const fresh = resolveServeExchange(0, [0.5, 0.5], server, receiver, neutral, [1, 1]).duels[0];
    expect(fresh.shotCalc.energy).toBeCloseTo(0);
    expect(fresh.readCalc.energy).toBeCloseTo(0.3);
    expect(fresh.hitterWins).toBe(false); // 0.2 vs 0.2: the fresh receiver scrambles it back

    const tired = resolveServeExchange(0, [0.5, 0.5], server, receiver, neutral, [0, 0]).duels[0];
    expect(tired.shotCalc.energy).toBeCloseTo(-MAX_FATIGUE);
    expect(tired.readCalc.energy).toBeCloseTo(-MAX_FATIGUE);
    expect(tired.hitterWins).toBe(true);
  });

  it('resolves without energy effects when no energy is given', () => {
    const ex = resolveServeExchange(
      0,
      [0.5, 0.5],
      { kind: 'server', serveTarget: 'wide', anticipation: 'crossCourt' },
      { kind: 'receiver', anticipation: 'tLine', returnTarget: 'crossCourt' },
      neutral,
    );
    expect(ex.duels[0].readCalc.energy).toBe(0);
  });

  it('makes defenders pay more for drop shots and for misreads', () => {
    const duel = (shot: Duel['shot'], modifier: number): Duel =>
      ({ kind: 'attack', hitter: 0, defender: 1, shot, read: 'centerDeep', readCalc: { modifier } }) as Duel;
    expect(duelCost(duel('dropShot', 0.6))[1]).toBeGreaterThan(duelCost(duel('centerDeep', 0.3))[1]);
    expect(duelCost(duel('crossCourt', -0.6))[1]).toBeGreaterThan(duelCost(duel('crossCourt', 0.3))[1]);
    expect(duelCost(duel('crossCourt', 0.3))[0]).toBeGreaterThan(0);
  });
});

describe('energy in a match', () => {
  it('starts full, drains with play and recovers a little after each point', () => {
    const m = new Match(players, { setsToWin: 1, gamesPerSet: 4 });
    expect(m.energy).toEqual([1, 1]);
    m.submit(0, { kind: 'server', serveTarget: 'body', anticipation: 'centerDeep' });
    m.submit(1, { kind: 'receiver', anticipation: 'neutral', returnTarget: 'centerDeep' });
    m.resolve(neutral); // both shots covered: the rally continues
    const afterExchange = [...m.energy];
    expect(afterExchange[0]).toBeLessThan(1);
    expect(afterExchange[1]).toBeLessThan(1);
    m.submit(0, { kind: 'rally', attack: 'downTheLine', anticipation: 'crossCourt' });
    m.submit(1, { kind: 'rally', attack: 'crossCourt', anticipation: 'crossCourt' });
    const point = m.resolve(neutral);
    expect(point.event).toBe('point');
    // The point's recovery is applied after its costs.
    const cost = duelCost(point.exchange.duels[0]);
    expect(m.energy[1]).toBeCloseTo(Math.min(1, afterExchange[1] - cost[1] + POINT_RECOVERY));
  });

  it('gives extra recovery at changeovers', () => {
    const m = new Match(players, { setsToWin: 1, gamesPerSet: 4 });
    m.energy = [0.5, 0.5];
    const ai = new AiOpponent(seeded(3));
    while (m.score.games[0] + m.score.games[1] === 0) {
      m.submit(0, ai.choose(m, 0));
      m.submit(1, ai.choose(m, 1));
      const before = [...m.energy];
      const o = m.resolve(seeded(m.exchangeCount + 7));
      if (o.event === 'game') {
        const cost = o.exchange.duels.map(duelCost).reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
        expect(m.energy[0]).toBeCloseTo(before[0] - cost[0] + POINT_RECOVERY + CHANGEOVER_RECOVERY, 2);
      }
    }
  });

  it('leaves average players at roughly half energy after a one-set match', () => {
    const rng = seeded(42);
    let total = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const m = new Match(players, { setsToWin: 1, gamesPerSet: 4 });
      const ai = new AiOpponent(rng);
      while (!m.isOver) {
        m.submit(0, ai.choose(m, 0));
        m.submit(1, ai.choose(m, 1));
        m.resolve(rng);
      }
      total += (m.energy[0] + m.energy[1]) / 2;
    }
    const avg = total / N;
    expect(avg).toBeGreaterThan(0.35);
    expect(avg).toBeLessThan(0.75);
  });
});
