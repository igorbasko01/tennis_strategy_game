import { describe, expect, it } from 'vitest';
import { attackContact, attackLanding, decisionSpots, serveContact } from './layout';

describe('attackLanding', () => {
  it('sends down the line along the hitter’s own sideline', () => {
    const from = { x: -3.4, z: 12.3 };
    const land = attackLanding(0, from, 'downTheLine');
    expect(land.z).toBeLessThan(0);
    expect(Math.abs(land.x - from.x)).toBeLessThan(0.5);
  });

  it('keeps down the line on the hitter’s side when hitting from the centre', () => {
    // A far-side returner meeting a T serve just right of the centre mark (world x > 0).
    const from = { x: 0.21, z: -12.3 };
    const land = attackLanding(1, from, 'downTheLine');
    expect(land.z).toBeGreaterThan(0);
    expect(land.x).toBeGreaterThan(0);
    expect(Math.abs(land.x - from.x)).toBeLessThanOrEqual(2.2);
  });

  it('sends cross-court to the opposite side', () => {
    for (const from of [
      { x: 3, z: 12 },
      { x: -2, z: -12 },
    ]) {
      const p = from.z > 0 ? 0 : 1;
      const land = attackLanding(p, from, 'crossCourt');
      expect(Math.sign(land.x)).toBe(-Math.sign(from.x));
    }
  });
});

describe('decisionSpots', () => {
  const none = { target: null, read: null };

  it('draws a defender’s counter from where their read takes them (screenshot case)', () => {
    // You near the centre mark; the CPU on the ball at its far-left corner.
    const me = { x: -0.05, z: 12.3 };
    const cpu = { x: -2.2, z: -12.4 };
    const before = decisionSpots(0, 'defender', 'deuce', me, cpu, none);
    const after = decisionSpots(0, 'defender', 'deuce', me, cpu, { target: null, read: 'crossCourt' });
    // Covering the CPU's cross-court takes you to the right corner...
    expect(after.reads.crossCourt.x).toBeGreaterThan(2);
    // ...so your cross-court counter must go back to the CPU's left, not straight up your sideline.
    expect(after.targets.crossCourt.x).toBeLessThan(-2);
    expect(after.targets.downTheLine.x).toBeGreaterThan(2);
    expect(before.targets.crossCourt.x).not.toBeCloseTo(after.targets.crossCourt.x);
  });

  it('draws a receiver’s return from where the read serve would be met', () => {
    const me = { x: 2.4, z: -12.1 };
    const server = { x: 0.8, z: 12.2 };
    const spots = decisionSpots(1, 'receiver', 'deuce', me, server, { target: null, read: 'tLine' });
    const from = serveContact(0, 'deuce', 'tLine');
    expect(spots.targets.downTheLine).toEqual(attackLanding(1, from, 'downTheLine'));
  });

  it('draws the server’s cover zones from where their serve sends the receiver', () => {
    const me = { x: 0.8, z: 12.2 };
    const receiver = { x: -2.4, z: -12.1 };
    const spots = decisionSpots(0, 'server', 'deuce', me, receiver, { target: 'wide', read: null });
    const from = serveContact(0, 'deuce', 'wide');
    expect(spots.reads.crossCourt).toEqual(attackContact(1, from, 'crossCourt'));
  });

  it('draws a striker’s cover zones from where their attack sends the opponent', () => {
    const me = { x: 3, z: 12.3 };
    const opp = { x: 0, z: -12.3 };
    const spots = decisionSpots(0, 'striker', 'deuce', me, opp, { target: 'downTheLine', read: null });
    const from = attackContact(0, me, 'downTheLine');
    expect(spots.reads.crossCourt).toEqual(attackContact(1, from, 'crossCourt'));
  });
});
