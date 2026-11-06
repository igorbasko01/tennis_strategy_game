import type { ResolvedExchange } from '../engine/online';
import type { Choice, PlayerIndex } from '../engine/resolution';
import type { StyleId } from '../engine/styles';

/**
 * The online server: the same site the game is served from (tennisim.baskorp.com/api).
 * Override at build time with VITE_API_URL, e.g. a local `wrangler dev` while running `vite`.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export interface OnlinePlayer {
  id: string;
  nickname: string;
  tag: string;
  /** Null for a bot. */
  rating: number | null;
  /** Set when this opponent is a server-side bot. */
  bot?: { style: StyleId };
}

/** Matchmaking: still looking, or the match that was found. */
export type MatchmakingResult = { waiting: true; secondsLeft: number } | MatchView;

/** This device's online identity: kept in the browser, separate from the single-player career. */
export interface Identity {
  player: OnlinePlayer & { rating: number };
  token: string;
  recoveryCode: string;
}

/** A match as this player sees it: they are always player 0. */
export interface MatchView {
  id: string;
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  you: OnlinePlayer;
  opponent: OnlinePlayer | null;
  /** False for bot matches, which don't change ratings. */
  rated: boolean;
  /** Each player's energy going in (you first): full, except in a cup. */
  energy: [number, number];
  /** Set when this match is a round of your Online Cup. */
  cup: { id: string; round: number; roundName: string } | null;
  firstServer: PlayerIndex;
  /** Resolved exchanges from the `since` asked for. */
  exchanges: ResolvedExchange[];
  exchangeCount: number;
  current: { exchange: number; youLocked: boolean; opponentLocked: boolean };
  winner: PlayerIndex | null;
  /** The player who resigned, if the match ended that way. */
  resigned: PlayerIndex | null;
  ratingChange: number | null;
}

export interface HistoryEntry {
  id: string;
  finishedAt: number;
  opponent: OnlinePlayer | null;
  won: boolean;
  /** The cup round, when the match was part of an Online Cup. */
  cupRound: string | null;
  resigned: 'you' | 'opponent' | null;
  sets: [number, number][];
  ratingChange: number | null;
}

/** One round of an Online Cup run, from the player's side. */
export interface CupRound {
  round: number;
  roundName: string;
  matchId: string;
  opponent: OnlinePlayer | null;
  status: 'playing' | 'finished';
  won: boolean | null;
  resigned: 'you' | 'opponent' | null;
  sets: [number, number][];
  ratingChange: number | null;
  /** Your energy going into that round. */
  energy: number;
}

/** An Online Cup run: quarterfinal, semifinal and final, each against a player at the same round or a bot. */
export interface Cup {
  id: string;
  number: number;
  status: 'playing' | 'won' | 'lost' | 'abandoned';
  /** The round being played or next; the round reached once the cup is over. */
  round: number;
  roundName: string;
  /** Energy going into the next round. */
  energy: number;
  ratingStart: number;
  ratingEnd: number | null;
  startedAt: number;
  finishedAt: number | null;
  rounds: CupRound[];
}

export const CUP_ROUND_NAMES = ['Quarterfinal', 'Semifinal', 'Final'];

const IDENTITY_KEY = 'tennis-strategy-online';

export const loadIdentity = (): Identity | null => {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    const id = raw ? (JSON.parse(raw) as Identity) : null;
    return id?.token && id.player?.id ? id : null;
  } catch {
    return null;
  }
};

export const saveIdentity = (id: Identity | null) => {
  try {
    if (id) localStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
    else localStorage.removeItem(IDENTITY_KEY);
  } catch {
    // Storage can be unavailable (private mode); the identity then lasts this visit only.
  }
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const call = async <T>(path: string, token?: string, data?: unknown): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the game server. Check your connection.');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Server error (${res.status})`);
  return body as T;
};

export const api = {
  register: (nickname: string) => call<Identity>('/api/players', undefined, { nickname }),
  recover: (code: string) => call<Identity>('/api/players/recover', undefined, { code }),
  me: (token: string) => call<{ player: OnlinePlayer & { rating: number } }>('/api/me', token),
  startCup: (token: string) => call<{ cup: Cup }>('/api/cups', token, {}),
  currentCup: (token: string) => call<{ cup: Cup | null }>('/api/cups/current', token),
  cup: (token: string, id: string) => call<{ cup: Cup }>(`/api/cups/${id}`, token),
  cupNext: (token: string, id: string) => call<MatchmakingResult>(`/api/cups/${id}/next`, token, {}),
  abandonCup: (token: string, id: string) => call<{ cup: Cup }>(`/api/cups/${id}/abandon`, token, {}),
  cupHistory: (token: string) => call<{ cups: Cup[] }>('/api/cups', token),
  matchmaking: (token: string) => call<MatchmakingResult>('/api/matchmaking', token, {}),
  cancelMatchmaking: (token: string) => call<{ ok: true }>('/api/matchmaking/cancel', token, {}),
  active: (token: string) => call<{ match: MatchView | null }>('/api/me/active', token),
  resign: (token: string, id: string) => call<MatchView>(`/api/matches/${id}/resign`, token, {}),
  history: (token: string) => call<{ matches: HistoryEntry[] }>('/api/me/matches', token),
  create: (token: string) => call<MatchView>('/api/matches', token, {}),
  join: (token: string, code: string) => call<MatchView>('/api/matches/join', token, { code }),
  get: (token: string, id: string, since: number) => call<MatchView>(`/api/matches/${id}?since=${since}`, token),
  move: (token: string, id: string, exchange: number, choice: Choice, since: number) =>
    call<MatchView>(`/api/matches/${id}/moves`, token, { exchange, choice, since }),
};

export const displayName = (p: OnlinePlayer) => (p.bot ? `🤖 ${p.nickname}` : `${p.nickname}#${p.tag}`);

/** The link that opens the game straight into joining a match. */
export const inviteLink = (code: string) => {
  const url = new URL(window.location.href);
  url.search = `?join=${code}`;
  url.hash = '';
  return url.toString();
};
