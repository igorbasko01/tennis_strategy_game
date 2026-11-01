import { describe, expect, it } from 'vitest';
import { AiOpponent } from './ai';
import { Match } from './match';
import { emptyProfile, rankings } from './profile';
import { MATCH_SCORING } from './scoring';
import { STYLES, STYLE_IDS, assignStyles } from './styles';
import { CPU_NAMES, createTournament } from './tournament';

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
    const styles = assignStyles(CPU_NAMES, seeded(1));
    expect(Object.keys(styles).sort()).toEqual([...CPU_NAMES].sort());
    const counts = STYLE_IDS.map((id) => Object.values(styles).filter((s) => s === id).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('reshuffle styles for a fresh profile', () => {
    const a = emptyProfile(seeded(2)).styles!;
    const b = emptyProfile(seeded(3)).styles!;
    expect(Object.keys(a)).toHaveLength(CPU_NAMES.length);
    expect(a).not.toEqual(b);
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

  it('carry each CPU’s style into tournaments and the rankings', () => {
    const p = emptyProfile(seeded(5));
    const t = createTournament(seeded(6), 0.3, 1, {}, p.styles);
    for (const e of [...t.entrants.slice(1), ...t.background!]) expect(e.style).toBe(p.styles![e.name]);
    expect(t.entrants[0].style).toBeUndefined();
    for (const r of rankings(p, 0.3)) expect(r.style).toBe(r.isPlayer ? undefined : p.styles![r.name]);
  });
});
