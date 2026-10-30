import { describe, expect, it } from 'vitest';
import { Match } from './match';
import { AiOpponent } from './ai';

const neutral = () => 0.5;
const players = [
  { name: 'Roger', skill: 0.5 },
  { name: 'Rafa', skill: 0.5 },
] as const;

describe('Match', () => {
  it('rejects skill outside 0..1', () => {
    expect(() => new Match([{ name: 'a', skill: 1.2 }, players[1]], { setsToWin: 1, gamesPerSet: 6 })).toThrow();
  });

  it('expects serve choices at the start of a point', () => {
    const m = new Match(players, { setsToWin: 1, gamesPerSet: 6 });
    expect(m.expectedChoice(0)).toBe('server');
    expect(m.expectedChoice(1)).toBe('receiver');
    expect(() => m.submit(0, { kind: 'rally', attack: 'crossCourt', anticipation: 'crossCourt' })).toThrow();
  });

  it('requires both choices before resolving', () => {
    const m = new Match(players, { setsToWin: 1, gamesPerSet: 6 });
    m.submit(0, { kind: 'server', serveTarget: 'wide', anticipation: 'crossCourt' });
    expect(m.bothReady).toBe(false);
    expect(() => m.resolve(neutral)).toThrow();
  });

  it('moves to the rally phase when both shots are handled, then scores', () => {
    const m = new Match(players, { setsToWin: 1, gamesPerSet: 6 });
    m.submit(0, { kind: 'server', serveTarget: 'body', anticipation: 'centerDeep' });
    m.submit(1, { kind: 'receiver', anticipation: 'neutral', returnTarget: 'centerDeep' });
    const first = m.resolve(neutral);
    expect(first.event).toBeNull();
    expect(m.phase).toBe('rally');
    expect(m.expectedChoice(1)).toBe('rally');

    m.submit(0, { kind: 'rally', attack: 'downTheLine', anticipation: 'crossCourt' });
    m.submit(1, { kind: 'rally', attack: 'crossCourt', anticipation: 'crossCourt' });
    const second = m.resolve(neutral);
    expect(second.exchange.pointWinner).toBe(0);
    expect(second.event).toBe('point');
    expect(m.phase).toBe('serve');
    expect(m.score.points).toEqual([1, 0]);
    expect(m.stats[0].winners).toBe(1);
    expect(m.stats[0].longestRally).toBe(3);
  });

  it('counts aces and reads', () => {
    const m = new Match(players, { setsToWin: 1, gamesPerSet: 6 });
    m.submit(0, { kind: 'server', serveTarget: 'wide', anticipation: 'crossCourt' });
    m.submit(1, { kind: 'receiver', anticipation: 'tLine', returnTarget: 'crossCourt' });
    m.resolve(neutral);
    expect(m.stats[0].aces).toBe(1);
    expect(m.stats[1].readsMade).toBe(1);
    expect(m.stats[1].readsCorrect).toBe(0);
    expect(m.stats[0].servicePointsWon).toBe(1);
  });

  it('plays a full CPU vs CPU match to completion', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const m = new Match(players, { setsToWin: 2, gamesPerSet: 6 });
    const ai = [new AiOpponent('champion', rng), new AiOpponent('rookie', rng)];
    let guard = 0;
    while (!m.isOver && guard++ < 100000) {
      const c0 = ai[0].choose(m, 0);
      const c1 = ai[1].choose(m, 1);
      m.submit(0, c0);
      m.submit(1, c1);
      const { exchange } = m.resolve(rng);
      ai[0].observe(c1, exchange);
      ai[1].observe(c0, exchange);
    }
    expect(m.isOver).toBe(true);
    expect(m.score.setsWon[m.score.winner!]).toBe(2);
  });
});
