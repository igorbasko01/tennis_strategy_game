import { describe, expect, it } from 'vitest';
import { MATCH_SCORING, Score } from './scoring';
import type { PlayerIndex } from './resolution';

const win = (s: Score, p: PlayerIndex, n: number) => {
  let last = s.pointWon(p);
  for (let i = 1; i < n; i++) last = s.pointWon(p);
  return last;
};

describe('Score', () => {
  it('counts 0/15/30/40 and wins a game', () => {
    const s = new Score({ setsToWin: 1, gamesPerSet: 6 });
    s.pointWon(0);
    expect(s.pointLabel(0)).toBe('15');
    s.pointWon(0);
    expect(s.pointLabel(0)).toBe('30');
    s.pointWon(0);
    expect(s.pointLabel(0)).toBe('40');
    expect(s.pointWon(0)).toBe('game');
    expect(s.games).toEqual([1, 0]);
  });

  it('handles deuce and advantage', () => {
    const s = new Score({ setsToWin: 1, gamesPerSet: 6 });
    win(s, 0, 3);
    win(s, 1, 3);
    expect(s.situation()).toBe('Deuce');
    s.pointWon(1);
    expect(s.pointLabel(1)).toBe('AD');
    s.pointWon(0);
    expect(s.situation()).toBe('Deuce');
    s.pointWon(0);
    expect(s.pointWon(0)).toBe('game');
  });

  it('alternates the server every game', () => {
    const s = new Score({ setsToWin: 1, gamesPerSet: 6 }, 1);
    expect(s.server).toBe(1);
    win(s, 0, 4);
    expect(s.server).toBe(0);
  });

  it('alternates serve side within a game', () => {
    const s = new Score({ setsToWin: 1, gamesPerSet: 6 });
    expect(s.serveSide).toBe('deuce');
    s.pointWon(0);
    expect(s.serveSide).toBe('ad');
  });

  it('flags break point for the receiver', () => {
    const s = new Score({ setsToWin: 1, gamesPerSet: 6 }, 0);
    win(s, 1, 3);
    expect(s.situation()).toBe('Break point');
  });

  it('needs a two game lead, then plays a tiebreak', () => {
    const s = new Score({ setsToWin: 1, gamesPerSet: 6 });
    for (let g = 0; g < 5; g++) {
      win(s, 0, 4);
      win(s, 1, 4);
    }
    expect(s.games).toEqual([5, 5]);
    win(s, 0, 4);
    expect(s.games).toEqual([6, 5]);
    win(s, 1, 4);
    expect(s.tiebreak).toBe(true);
    const first = s.server;
    s.pointWon(0);
    expect(s.server).not.toBe(first);
    s.pointWon(0);
    expect(s.server).not.toBe(first);
    s.pointWon(0);
    expect(s.server).toBe(first);
    expect(win(s, 0, 4)).toBe('match');
    expect(s.winner).toBe(0);
    expect(s.completedSets).toEqual([[7, 6]]);
  });

  it('plays best of three sets', () => {
    const s = new Score({ setsToWin: 2, gamesPerSet: 4 });
    expect(win(s, 0, 16)).toBe('set');
    expect(s.setsWon).toEqual([1, 0]);
    win(s, 1, 16);
    expect(s.winner).toBeNull();
    expect(win(s, 1, 16)).toBe('match');
    expect(s.winner).toBe(1);
  });

  it('plays matches as the best of three games', () => {
    const straight = new Score(MATCH_SCORING);
    win(straight, 0, 4);
    expect(straight.winner).toBeNull();
    expect(win(straight, 0, 4)).toBe('match');
    expect(straight.completedSets).toEqual([[2, 0]]);

    const decider = new Score(MATCH_SCORING);
    win(decider, 0, 4);
    win(decider, 1, 4);
    expect(decider.games).toEqual([1, 1]);
    expect(decider.tiebreak).toBe(false);
    expect(win(decider, 1, 4)).toBe('match');
    expect(decider.winner).toBe(1);
    expect(decider.completedSets).toEqual([[1, 2]]);
  });

  it('rejects points after the match ends', () => {
    const s = new Score({ setsToWin: 1, gamesPerSet: 2 });
    win(s, 0, 8);
    expect(() => s.pointWon(0)).toThrow();
  });
});
