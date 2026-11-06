import { describe, expect, it } from 'vitest';
import { AiOpponent } from './ai';
import { Match } from './match';
import { MATCH_SCORING } from './scoring';
import { STYLES, STYLE_IDS, assignStyles } from './styles';

const NAMES = ['Ana', 'Bruno', 'Chen', 'Dara', 'Elio', 'Freya', 'Goran', 'Hana', 'Ivo', 'Jules', 'Kai', 'Lena', 'Milo', 'Nia', 'Oscar'];

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('CPU styles', () => {
  it('give every option some chance, so no style is a fixed pattern', () => {
    for (const id of STYLE_IDS) {
      const s = STYLES[id];
      for (const table of [s.serve, s.serveRead, s.attack, s.cover]) {
        const values = Object.values(table);
        expect(values.every((v) => v > 0)).toBe(true);
        expect(values.reduce((a, b) => a + b, 0)).toBe(100);
      }
    }
  });

  it('deal styles out evenly across the CPU players', () => {
    const styles = assignStyles(NAMES, seeded(1));
    expect(Object.keys(styles).sort()).toEqual([...NAMES].sort());
    const counts = STYLE_IDS.map((id) => Object.values(styles).filter((s) => s === id).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('make a CPU lean on its style’s favourites', () => {
    const m = new Match(
      [
        { name: 'A', skill: 0.3 },
        { name: 'B', skill: 0.3 },
      ],
      MATCH_SCORING,
    );
    m.submit(0, { kind: 'server', serveTarget: 'body', anticipation: 'centerDeep' });
    m.submit(1, { kind: 'receiver', anticipation: 'neutral', returnTarget: 'centerDeep' });
    m.resolve(() => 0.5); // both covered: now a rally
    const ai = new AiOpponent(seeded(4), STYLES.touch);
    let drops = 0;
    for (let i = 0; i < 2000; i++) {
      const c = ai.choose(m, 1);
      if (c.kind === 'rally' && c.attack === 'dropShot') drops++;
    }
    expect(drops / 2000).toBeGreaterThan(0.4);
    expect(drops / 2000).toBeLessThan(0.5);
  });
});
