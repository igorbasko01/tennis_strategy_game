import { describe, expect, it } from 'vitest';
import { attackLanding } from './layout';

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
