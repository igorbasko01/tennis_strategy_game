import {
  firstServerOf,
  isValidChoice,
  orientExchange,
  ratingChange,
  replay,
} from '../../webapp/src/engine/online';
import type { Choice, PlayerIndex } from '../../webapp/src/engine/resolution';

export interface Env {
  DB: D1Database;
}

/** An invite nobody joins expires after this long, and its code can be reused. */
const INVITE_TTL_MS = 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface PlayerRow {
  id: string;
  nickname: string;
  tag: string;
  rating: number;
}

interface MatchRow {
  id: string;
  code: string;
  seat0: string;
  seat1: string | null;
  seed: number;
  status: 'waiting' | 'playing' | 'finished';
  winner: number | null;
  rating_change: number | null;
  created_at: number;
  finished_at: number | null;
}

interface MoveRow {
  exchange: number;
  seat: number;
  choice: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });

const randomString = (alphabet: string, length: number) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
};

const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const body = async (req: Request): Promise<Record<string, unknown>> => {
  try {
    const data = await req.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const publicPlayer = (p: PlayerRow) => ({ id: p.id, nickname: p.nickname, tag: p.tag, rating: p.rating });

const authenticate = async (req: Request, env: Env): Promise<PlayerRow> => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Missing token');
  const p = await env.DB.prepare('SELECT id, nickname, tag, rating FROM players WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<PlayerRow>();
  if (!p) throw new HttpError(401, 'Unknown token');
  return p;
};

// ------------------------------------------------------------------ players

const createPlayer = async (req: Request, env: Env) => {
  const nickname = String((await body(req)).nickname ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 16);
  if (!nickname) throw new HttpError(400, 'Choose a nickname');
  const id = randomHex(8);
  const tag = String(1000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000));
  const token = randomHex(24);
  const recoveryCode = `TENNIS-${randomString(RECOVERY_ALPHABET, 4)}-${randomString(RECOVERY_ALPHABET, 4)}`;
  await env.DB.prepare('INSERT INTO players (id, nickname, tag, token_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, nickname, tag, await sha256(token), await sha256(recoveryCode), Date.now())
    .run();
  return json({ player: { id, nickname, tag, rating: 1000 }, token, recoveryCode }, 201);
};

const recoverPlayer = async (req: Request, env: Env) => {
  const code = String((await body(req)).code ?? '')
    .toUpperCase()
    .replace(/\s+/g, '');
  const p = await env.DB.prepare('SELECT id, nickname, tag, rating FROM players WHERE recovery_hash = ?')
    .bind(await sha256(code))
    .first<PlayerRow>();
  if (!p) throw new HttpError(404, 'That recovery code was not found');
  // A recovery issues a new token; the old device's token stops working.
  const token = randomHex(24);
  await env.DB.prepare('UPDATE players SET token_hash = ? WHERE id = ?').bind(await sha256(token), p.id).run();
  return json({ player: publicPlayer(p), token, recoveryCode: code });
};

// ------------------------------------------------------------------ matches

const loadMatch = async (env: Env, id: string) => {
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();
  if (!m) throw new HttpError(404, 'Match not found');
  return m;
};

const seatOf = (m: MatchRow, playerId: string): PlayerIndex => {
  if (m.seat0 === playerId) return 0;
  if (m.seat1 === playerId) return 1;
  throw new HttpError(403, 'You are not in this match');
};

const loadMoves = async (env: Env, matchId: string) => {
  const { results } = await env.DB.prepare('SELECT exchange, seat, choice FROM moves WHERE match_id = ? ORDER BY exchange')
    .bind(matchId)
    .all<MoveRow>();
  return results;
};

/** Moves grouped by exchange, one choice per seat. */
const pairsOf = (rows: MoveRow[]) => {
  const pairs: [Choice | null, Choice | null][] = [];
  for (const r of rows) {
    while (pairs.length <= r.exchange) pairs.push([null, null]);
    pairs[r.exchange][r.seat] = JSON.parse(r.choice) as Choice;
  }
  return pairs;
};

const insertMove = (env: Env, matchId: string, exchange: number, seat: number, choice: Choice) =>
  env.DB.prepare('INSERT OR IGNORE INTO moves (match_id, exchange, seat, choice, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(matchId, exchange, seat, JSON.stringify(choice), Date.now())
    .run();

/** Ends a match once, and moves both players' ratings. */
const finish = async (env: Env, m: MatchRow, winner: PlayerIndex) => {
  const players = await env.DB.prepare('SELECT id, rating FROM players WHERE id IN (?, ?)').bind(m.seat0, m.seat1).all<{ id: string; rating: number }>();
  const rating = (id: string | null) => players.results.find((p) => p.id === id)?.rating ?? 1000;
  const [w, l] = winner === 0 ? [m.seat0, m.seat1!] : [m.seat1!, m.seat0];
  const change = ratingChange(rating(w), rating(l));
  const now = Date.now();
  const done = await env.DB.prepare(
    "UPDATE matches SET status = 'finished', winner = ?, rating_change = ?, finished_at = ? WHERE id = ? AND status = 'playing'",
  )
    .bind(winner, change, now, m.id)
    .run();
  if (done.meta.changes === 1) {
    await env.DB.batch([
      env.DB.prepare('UPDATE players SET rating = rating + ? WHERE id = ?').bind(change, w),
      env.DB.prepare('UPDATE players SET rating = rating - ? WHERE id = ?').bind(change, l),
    ]);
  }
};

/** Ends the match (once) if its last exchange has been played. */
const advance = async (env: Env, id: string): Promise<MatchRow> => {
  const m = await loadMatch(env, id);
  if (m.status !== 'playing') return m;
  const { match } = replay(m.seed, pairsOf(await loadMoves(env, id)));
  if (!match.isOver) return m;
  await finish(env, m, match.score.winner!);
  return loadMatch(env, id);
};

/** The match as one seat sees it: always as player 0, with every resolved exchange from `since` on. */
const view = async (env: Env, m: MatchRow, seat: PlayerIndex, since = 0) => {
  const ids = [m.seat0, m.seat1].filter(Boolean) as string[];
  const { results } = await env.DB.prepare(`SELECT id, nickname, tag, rating FROM players WHERE id IN (${ids.map(() => '?').join(', ')})`)
    .bind(...ids)
    .all<PlayerRow>();
  const player = (id: string | null) => {
    const p = results.find((r) => r.id === id);
    return p ? publicPlayer(p) : null;
  };
  const rows = m.status === 'waiting' ? [] : await loadMoves(env, m.id);
  const pairs = pairsOf(rows);
  const { resolved } = replay(m.seed, pairs);
  const pending = pairs[resolved.length] ?? [null, null];
  const orient = (s: number | null) => (s === null ? null : seat === 0 ? s : 1 - s);
  const firstServer = firstServerOf(m.seed);
  const won = m.winner === null ? null : m.winner === seat;
  return json({
    id: m.id,
    code: m.code,
    status: m.status,
    you: player(seat === 0 ? m.seat0 : m.seat1),
    opponent: player(seat === 0 ? m.seat1 : m.seat0),
    firstServer: orient(firstServer),
    exchanges: resolved.slice(since).map((x) => orientExchange(x, seat)),
    exchangeCount: resolved.length,
    current: {
      exchange: resolved.length,
      youLocked: pending[seat] !== null,
      opponentLocked: pending[1 - seat] !== null,
    },
    winner: orient(m.winner),
    ratingChange: m.rating_change === null || won === null ? null : won ? m.rating_change : -m.rating_change,
  });
};

const createMatch = async (me: PlayerRow, env: Env) => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomString(CODE_ALPHABET, 4);
    const taken = await env.DB.prepare(
      "SELECT 1 FROM matches WHERE code = ? AND (status = 'playing' OR (status = 'waiting' AND created_at > ?))",
    )
      .bind(code, Date.now() - INVITE_TTL_MS)
      .first();
    if (taken) continue;
    const id = randomHex(8);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    await env.DB.prepare("INSERT INTO matches (id, code, seat0, seed, status, created_at) VALUES (?, ?, ?, ?, 'waiting', ?)")
      .bind(id, code, me.id, seed, Date.now())
      .run();
    return view(env, await loadMatch(env, id), 0);
  }
  throw new HttpError(503, 'Could not find a free match code, try again');
};

const joinMatch = async (req: Request, me: PlayerRow, env: Env) => {
  const code = String((await body(req)).code ?? '')
    .toUpperCase()
    .trim();
  const m = await env.DB.prepare(
    "SELECT * FROM matches WHERE code = ? AND status = 'waiting' AND created_at > ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(code, Date.now() - INVITE_TTL_MS)
    .first<MatchRow>();
  if (!m) throw new HttpError(404, 'No match is waiting with that code');
  if (m.seat0 === me.id) return view(env, m, 0);
  const now = Date.now();
  const joined = await env.DB.prepare(
    "UPDATE matches SET seat1 = ?, status = 'playing', started_at = ? WHERE id = ? AND status = 'waiting'",
  )
    .bind(me.id, now, m.id)
    .run();
  if (joined.meta.changes !== 1) throw new HttpError(409, 'Someone else joined that match first');
  return view(env, await loadMatch(env, m.id), 1);
};

const submitMove = async (req: Request, me: PlayerRow, env: Env, id: string) => {
  const m = await advance(env, id);
  const seat = seatOf(m, me.id);
  const data = await body(req);
  if (m.status === 'playing') {
    const pairs = pairsOf(await loadMoves(env, id));
    const { match, resolved } = replay(m.seed, pairs);
    // A late or repeated submission is ignored; the reply shows what was played.
    if (Number(data.exchange) === resolved.length && !match.isOver) {
      if (!isValidChoice(data.choice, match.expectedChoice(seat))) throw new HttpError(400, 'Invalid choice');
      await insertMove(env, id, resolved.length, seat, data.choice);
    }
  }
  return view(env, await advance(env, id), seat, Number(data.since ?? 0));
};

const history = async (me: PlayerRow, env: Env) => {
  const { results } = await env.DB.prepare(
    "SELECT * FROM matches WHERE (seat0 = ? OR seat1 = ?) AND status = 'finished' ORDER BY finished_at DESC LIMIT 20",
  )
    .bind(me.id, me.id)
    .all<MatchRow>();
  const ids = [...new Set(results.flatMap((m) => [m.seat0, m.seat1]).filter((x): x is string => !!x && x !== me.id))];
  const others = ids.length
    ? (
        await env.DB.prepare(`SELECT id, nickname, tag, rating FROM players WHERE id IN (${ids.map(() => '?').join(', ')})`)
          .bind(...ids)
          .all<PlayerRow>()
      ).results
    : [];
  const matches = [];
  for (const m of results) {
    const seat: PlayerIndex = m.seat0 === me.id ? 0 : 1;
    const { match } = replay(m.seed, pairsOf(await loadMoves(env, m.id)));
    const opp = others.find((p) => p.id === (seat === 0 ? m.seat1 : m.seat0));
    const won = m.winner === seat;
    matches.push({
      id: m.id,
      finishedAt: m.finished_at,
      opponent: opp ? publicPlayer(opp) : null,
      won,
      sets: match.score.completedSets.map((s) => (seat === 0 ? s : [s[1], s[0]])),
      ratingChange: m.rating_change === null ? null : won ? m.rating_change : -m.rating_change,
    });
  }
  return json({ matches });
};

// ------------------------------------------------------------------ routing

const route = async (req: Request, env: Env): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = req.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (path === '/api/health') return json({ ok: true });
  if (path === '/api/players' && method === 'POST') return createPlayer(req, env);
  if (path === '/api/players/recover' && method === 'POST') return recoverPlayer(req, env);

  const me = await authenticate(req, env);
  if (path === '/api/me' && method === 'GET') return json({ player: publicPlayer(me) });
  if (path === '/api/me/matches' && method === 'GET') return history(me, env);
  if (path === '/api/matches' && method === 'POST') return createMatch(me, env);
  if (path === '/api/matches/join' && method === 'POST') return joinMatch(req, me, env);
  const matchPath = path.match(/^\/api\/matches\/([0-9a-f]{16})(\/moves)?$/);
  if (matchPath && !matchPath[2] && method === 'GET') {
    const m = await advance(env, matchPath[1]);
    return view(env, m, seatOf(m, me.id), Number(url.searchParams.get('since') ?? 0));
  }
  if (matchPath && matchPath[2] && method === 'POST') return submitMove(req, me, env, matchPath[1]);
  throw new HttpError(404, 'Not found');
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Server error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
