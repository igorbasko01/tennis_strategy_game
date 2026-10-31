import { describe, expect, it } from 'vitest';
import {
  RANDOM_RANGE,
  calculate,
  positionFromRead,
  resolveRallyExchange,
  resolveServeExchange,
  rollRandomFactor,
  type ReceiverChoice,
  type ServerChoice,
} from './resolution';

/** rng() = 0.5 gives a random factor of exactly 0, matching the design doc examples. */
const neutral = () => 0.5;
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const skills = [0.5, 0.5] as const;

const server = (serveTarget: ServerChoice['serveTarget'], anticipation: ServerChoice['anticipation'] = 'crossCourt'): ServerChoice => ({
  kind: 'server',
  serveTarget,
  anticipation,
});
const receiver = (anticipation: ReceiverChoice['anticipation'], returnTarget: ReceiverChoice['returnTarget'] = 'crossCourt'): ReceiverChoice => ({
  kind: 'receiver',
  anticipation,
  returnTarget,
});

describe('random factor', () => {
  it('spans the configured range', () => {
    expect(rollRandomFactor(() => 0)).toBeCloseTo(-RANDOM_RANGE);
    expect(rollRandomFactor(() => 0.5)).toBeCloseTo(0);
    expect(rollRandomFactor(() => 0.999999)).toBeCloseTo(RANDOM_RANGE);
  });

  it('calculation total is skill + modifier + random', () => {
    expect(calculate(0.5, -0.3, 0.1).total).toBeCloseTo(0.3);
  });
});

describe('design doc examples', () => {
  it('serve wide, receive wide: receive succeeds (0.2 vs 0.8)', () => {
    const ex = resolveServeExchange(0, skills, server('wide'), receiver('wide'), neutral);
    expect(ex.duels[0].shotCalc.total).toBeCloseTo(0.2);
    expect(ex.duels[0].readCalc.total).toBeCloseTo(0.8);
    expect(ex.duels[0].hitterWins).toBe(false);
  });

  it('serve wide, receive neutral: serve wins (0.2 vs 0.1)', () => {
    const ex = resolveServeExchange(0, skills, server('wide'), receiver('neutral'), neutral);
    expect(ex.duels[0].readCalc.total).toBeCloseTo(0.1);
    expect(ex.duels[0].hitterWins).toBe(true);
  });

  it('serve wide, receive T-line: serve wins the point (0.2 vs -0.1)', () => {
    const ex = resolveServeExchange(0, skills, server('wide'), receiver('tLine'), neutral);
    expect(ex.duels[0].readCalc.total).toBeCloseTo(-0.1);
    expect(ex.duels).toHaveLength(1);
    expect(ex.pointWinner).toBe(0);
  });
});

describe('serve exchange', () => {
  it('receiver wins when the return beats the server recovery', () => {
    // serve 0.2 vs read 0.8 -> returned; return down the line 0.2 vs server read cross -0.1
    const ex = resolveServeExchange(0, skills, server('wide', 'crossCourt'), receiver('wide', 'downTheLine'), neutral);
    expect(ex.duels.map((d) => d.kind)).toEqual(['serve', 'return']);
    expect(ex.duels[1].hitter).toBe(1);
    expect(ex.pointWinner).toBe(1);
  });

  it('rally continues when the server covers the return', () => {
    const ex = resolveServeExchange(1, skills, server('body', 'centerDeep'), receiver('neutral', 'centerDeep'), neutral);
    expect(ex.duels).toHaveLength(2);
    expect(ex.pointWinner).toBeNull();
  });

  it('applies skill and random factors per roll', () => {
    const ex = resolveServeExchange(0, [0.9, 0.1], server('body'), receiver('wide'), seq(1 - 1e-9, 0));
    expect(ex.duels[0].shotCalc.total).toBeCloseTo(0.9 - 0.1 + 0.3);
    expect(ex.duels[0].readCalc.total).toBeCloseTo(0.1 - 0.3 - 0.3);
    expect(ex.pointWinner).toBe(0);
  });
});

describe('rally exchange', () => {
  it('a correctly read drop shot is covered with the bigger bonus', () => {
    const ex = resolveRallyExchange(
      0,
      skills,
      { kind: 'rally', attack: 'dropShot', anticipation: 'centerDeep' },
      { kind: 'rally', attack: 'centerDeep', anticipation: 'dropShot' },
      neutral,
    );
    expect(ex.duels[0].readCalc.modifier).toBeCloseTo(0.6);
    expect(ex.duels[0].hitterWins).toBe(false);
    expect(ex.duels[1].kind).toBe('counter');
    expect(ex.pointWinner).toBeNull();
  });

  it('striker wins with an unread attack', () => {
    const ex = resolveRallyExchange(
      1,
      skills,
      { kind: 'rally', attack: 'downTheLine', anticipation: 'crossCourt' },
      { kind: 'rally', attack: 'crossCourt', anticipation: 'crossCourt' },
      neutral,
    );
    expect(ex.pointWinner).toBe(1);
    expect(ex.duels).toHaveLength(1);
  });
});

describe('position carry-over', () => {
  it('turns a third of the read modifier into the next shot’s position', () => {
    expect(positionFromRead(0.3)).toBeCloseTo(0.1);
    expect(positionFromRead(0.6)).toBeCloseTo(0.2);
    expect(positionFromRead(-0.1)).toBeCloseTo(-0.03);
    expect(positionFromRead(-0.6)).toBeCloseTo(-0.2);
  });

  it('serves have no position; a correct serve read helps the return', () => {
    const ex = resolveServeExchange(0, skills, server('wide', 'centerDeep'), receiver('wide', 'centerDeep'), neutral);
    expect(ex.duels[0].shotCalc.position).toBe(0);
    expect(ex.duels[1].shotCalc.position).toBeCloseTo(0.1);
    expect(ex.duels[1].shotCalc.total).toBeCloseTo(0.5 - 0.1 + 0.1);
  });

  it('a lucky cover after a wrong read leaves the returner stretched', () => {
    // Serve 0.5 - 0.3 - 0.3 = -0.1 vs read 0.5 - 0.6 + 0 = -0.1: tie, so returned.
    const ex = resolveServeExchange(0, skills, server('wide'), receiver('tLine'), seq(0, 0.5));
    expect(ex.duels[0].hitterWins).toBe(false);
    expect(ex.duels[1].shotCalc.position).toBeCloseTo(-0.2);
  });

  it('a correct read in a rally helps the counter, and the striker carries theirs in', () => {
    const ex = resolveRallyExchange(
      0,
      skills,
      { kind: 'rally', attack: 'dropShot', anticipation: 'centerDeep' },
      { kind: 'rally', attack: 'centerDeep', anticipation: 'dropShot' },
      neutral,
      0.1,
    );
    expect(ex.duels[0].shotCalc.position).toBeCloseTo(0.1);
    expect(ex.duels[1].shotCalc.position).toBeCloseTo(0.2);
  });

  it('reads never carry a position term', () => {
    const ex = resolveServeExchange(0, skills, server('body'), receiver('neutral'), neutral);
    for (const d of ex.duels) expect(d.readCalc.position).toBe(0);
  });
});
