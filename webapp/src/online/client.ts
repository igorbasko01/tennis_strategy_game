import type { ResolvedExchange } from '../engine/online';
import type { Choice, PlayerIndex } from '../engine/resolution';

/** The online server. Override at build time with VITE_API_URL (e.g. a local `wrangler dev`). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://tennis-strategy.igorbasko.workers.dev';

export interface OnlinePlayer {
  id: string;
  nickname: string;
  tag: string;
  rating: number;
}

/** This device's online identity: kept in the browser, separate from the single-player career. */
export interface Identity {
  player: OnlinePlayer;
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
  resigned: 'you' | 'opponent' | null;
  sets: [number, number][];
  ratingChange: number | null;
}

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
  me: (token: string) => call<{ player: OnlinePlayer }>('/api/me', token),
  active: (token: string) => call<{ match: MatchView | null }>('/api/me/active', token),
  resign: (token: string, id: string) => call<MatchView>(`/api/matches/${id}/resign`, token, {}),
  history: (token: string) => call<{ matches: HistoryEntry[] }>('/api/me/matches', token),
  create: (token: string) => call<MatchView>('/api/matches', token, {}),
  join: (token: string, code: string) => call<MatchView>('/api/matches/join', token, { code }),
  get: (token: string, id: string, since: number) => call<MatchView>(`/api/matches/${id}?since=${since}`, token),
  move: (token: string, id: string, exchange: number, choice: Choice, since: number) =>
    call<MatchView>(`/api/matches/${id}/moves`, token, { exchange, choice, since }),
};

export const displayName = (p: OnlinePlayer) => `${p.nickname}#${p.tag}`;

/** The link that opens the game straight into joining a match. */
export const inviteLink = (code: string) => {
  const url = new URL(window.location.href);
  url.search = `?join=${code}`;
  url.hash = '';
  return url.toString();
};
