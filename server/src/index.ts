import {
  firstServerOf,
  isValidChoice,
  orientExchange,
  ratingChange,
  replay,
} from '../../webapp/src/engine/online';
import type { Choice, PlayerIndex } from '../../webapp/src/engine/resolution';
import { AiOpponent } from '../../webapp/src/engine/ai';
import { STYLES, type StyleId } from '../../webapp/src/engine/styles';
import { restBetweenMatches } from '../../webapp/src/engine/energy';

export interface Env {
  DB: D1Database;
}

/** An invite nobody joins expires after this long, and its code can be reused. */
const INVITE_TTL_MS = 60 * 60 * 1000;
/** How long matchmaking looks for a person before bringing in a bot. */
const MATCHMAKING_SECONDS = 15;
/** A queued player who stops checking in for this long is skipped (they left). */
const QUEUE_STALE_MS = 6000;
/** Round names for the Online Cup. */
const CUP_ROUNDS = ['Quarterfinal', 'Semifinal', 'Final'];
/** A cup bot comes into each round about as rested as a typical player would be. */
const CUP_BOT_ENERGY = [1, 0.85, 0.75];
const BOT_NAMES = ['Ace', 'Volley', 'Slice', 'Topspin', 'Rally', 'Smash', 'Lob', 'Baseline'];
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
  resigned: number | null;
  rating_change: number | null;
  bot_style: StyleId | null;
  bot_name: string | null;
  rated: number;
  energy0: number;
  energy1: number;
  cup0: string | null;
  cup1: string | null;
  cup_round: number | null;
  started_at: number | null;
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

/** A bot opponent, shown as a bot with its playing style. */
const botPlayer = (m: MatchRow) => ({ id: 'bot', nickname: m.bot_name ?? 'Bot', tag: 'BOT', rating: null, bot: { style: m.bot_style } });

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

/** Each seat's energy going into the match. */
const energiesOf = (m: MatchRow): [number, number] => [m.energy0 ?? 1, m.energy1 ?? 1];

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
const finish = async (env: Env, m: MatchRow, winner: PlayerIndex, resigned: PlayerIndex | null = null) => {
  if (!m.rated) {
    // Bot matches are unrated.
    const done = await env.DB.prepare(
      "UPDATE matches SET status = 'finished', winner = ?, resigned = ?, finished_at = ? WHERE id = ? AND status = 'playing'",
    )
      .bind(winner, resigned, Date.now(), m.id)
      .run();
    if (done.meta.changes === 1) await advanceCups(env, m, winner);
    return;
  }
  const players = await env.DB.prepare('SELECT id, rating FROM players WHERE id IN (?, ?)').bind(m.seat0, m.seat1).all<{ id: string; rating: number }>();
  const rating = (id: string | null) => players.results.find((p) => p.id === id)?.rating ?? 1000;
  const [w, l] = winner === 0 ? [m.seat0, m.seat1!] : [m.seat1!, m.seat0];
  const change = ratingChange(rating(w), rating(l));
  const now = Date.now();
  const done = await env.DB.prepare(
    "UPDATE matches SET status = 'finished', winner = ?, resigned = ?, rating_change = ?, finished_at = ? WHERE id = ? AND status = 'playing'",
  )
    .bind(winner, resigned, change, now, m.id)
    .run();
  if (done.meta.changes === 1) {
    await env.DB.batch([
      env.DB.prepare('UPDATE players SET rating = rating + ? WHERE id = ?').bind(change, w),
      env.DB.prepare('UPDATE players SET rating = rating - ? WHERE id = ?').bind(change, l),
    ]);
    await advanceCups(env, m, winner);
  }
};

/**
 * After a cup match: the winner's run moves on to the next round with the energy
 * they finished on plus the usual rest (or wins the cup after the final); the
 * loser's run ends in that round.
 */
const advanceCups = async (env: Env, m: MatchRow, winner: PlayerIndex) => {
  if (!m.cup0 && !m.cup1) return;
  const { match } = replay(m.seed, pairsOf(await loadMoves(env, m.id)), energiesOf(m));
  const now = Date.now();
  for (const seat of [0, 1] as PlayerIndex[]) {
    const cup = seat === 0 ? m.cup0 : m.cup1;
    if (!cup) continue;
    const player = seat === 0 ? m.seat0 : m.seat1!;
    const rating = (await env.DB.prepare('SELECT rating FROM players WHERE id = ?').bind(player).first<{ rating: number }>())?.rating ?? 1000;
    const round = m.cup_round ?? 0;
    if (seat !== winner) {
      await env.DB.prepare("UPDATE cup_runs SET status = 'lost', round = ?, rating_end = ?, finished_at = ? WHERE id = ? AND status = 'playing'")
        .bind(round, rating, now, cup)
        .run();
    } else if (round >= CUP_ROUNDS.length - 1) {
      await env.DB.prepare("UPDATE cup_runs SET status = 'won', round = ?, rating_end = ?, finished_at = ? WHERE id = ? AND status = 'playing'")
        .bind(round, rating, now, cup)
        .run();
    } else {
      await env.DB.prepare("UPDATE cup_runs SET round = ?, energy = ? WHERE id = ? AND status = 'playing'")
        .bind(round + 1, restBetweenMatches(match.energy[seat]), cup)
        .run();
    }
  }
};

/**
 * Ends the match (once) if its last exchange has been played. In a bot match it
 * also makes the bot's choice for the current exchange: from its style alone,
 * so it never depends on what the player chose.
 */
const advance = async (env: Env, id: string): Promise<MatchRow> => {
  const m = await loadMatch(env, id);
  if (m.status !== 'playing') return m;
  const pairs = pairsOf(await loadMoves(env, id));
  const { match, resolved } = replay(m.seed, pairs, energiesOf(m));
  if (match.isOver) {
    await finish(env, m, match.score.winner!);
    return loadMatch(env, id);
  }
  if (m.bot_style && !pairs[resolved.length]?.[1]) {
    const bot = new AiOpponent(Math.random, STYLES[m.bot_style]);
    await insertMove(env, id, resolved.length, 1, bot.choose(match, 1));
  }
  return m;
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
  const opponent = seat === 0 && m.bot_style ? botPlayer(m) : player(seat === 0 ? m.seat1 : m.seat0);
  const pairs = pairsOf(rows);
  const { resolved } = replay(m.seed, pairs, energiesOf(m));
  const pending = pairs[resolved.length] ?? [null, null];
  const orient = (s: number | null) => (s === null ? null : seat === 0 ? s : 1 - s);
  const firstServer = firstServerOf(m.seed);
  const won = m.winner === null ? null : m.winner === seat;
  return json({
    id: m.id,
    code: m.code,
    status: m.status,
    you: player(seat === 0 ? m.seat0 : m.seat1),
    opponent,
    rated: m.rated === 1,
    // Energy going in, from this seat's side.
    energy: seat === 0 ? [m.energy0 ?? 1, m.energy1 ?? 1] : [m.energy1 ?? 1, m.energy0 ?? 1],
    cup: (seat === 0 ? m.cup0 : m.cup1) ? { id: seat === 0 ? m.cup0 : m.cup1, round: m.cup_round, roundName: CUP_ROUNDS[m.cup_round ?? 0] } : null,
    firstServer: orient(firstServer),
    exchanges: resolved.slice(since).map((x) => orientExchange(x, seat)),
    exchangeCount: resolved.length,
    current: {
      exchange: resolved.length,
      youLocked: pending[seat] !== null,
      opponentLocked: pending[1 - seat] !== null,
    },
    winner: orient(m.winner),
    resigned: orient(m.resigned),
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
    const { match, resolved } = replay(m.seed, pairs, energiesOf(m));
    // A late or repeated submission is ignored; the reply shows what was played.
    if (Number(data.exchange) === resolved.length && !match.isOver) {
      if (!isValidChoice(data.choice, match.expectedChoice(seat))) throw new HttpError(400, 'Invalid choice');
      await insertMove(env, id, resolved.length, seat, data.choice);
    }
  }
  return view(env, await advance(env, id), seat, Number(data.since ?? 0));
};

/** The bot's style follows the player's rating: newer players get easier-to-read styles. */
const botStyleFor = (rating: number): StyleId => {
  const pool: StyleId[] = rating < 1000 ? ['grinder', 'aggressor', 'touch'] : rating < 1100 ? ['aggressor', 'touch', 'balanced'] : ['balanced'];
  return pool[crypto.getRandomValues(new Uint8Array(1))[0] % pool.length];
};

interface Seat {
  player: string | null;
  energy: number;
  cup: string | null;
}

const startMatch = async (env: Env, seat0: Seat, seat1: Seat, bot: StyleId | null, cupRound: number | null = null) => {
  const id = randomHex(8);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const now = Date.now();
  const name = bot ? `${BOT_NAMES[crypto.getRandomValues(new Uint8Array(1))[0] % BOT_NAMES.length]} Bot` : null;
  await env.DB.prepare(
    `INSERT INTO matches (id, code, seat0, seat1, seed, status, bot_style, bot_name, rated, energy0, energy1, cup0, cup1, cup_round, created_at, started_at)
     VALUES (?, '', ?, ?, ?, 'playing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, seat0.player, seat1.player, seed, bot, name, bot ? 0 : 1, seat0.energy, seat1.energy, seat0.cup, seat1.cup, cupRound, now, now)
    .run();
  return id;
};

/** Who the player is looking for an opponent as: a single match, or a cup run in a given round. */
interface Search {
  pool: string;
  energy: number;
  cup: { id: string; round: number } | null;
}

const SINGLE: Search = { pool: 'single', energy: 1, cup: null };

/** Cup bots get tougher each round: the final is always against the hardest-to-read style. */
const cupBotStyle = (rating: number, round: number): StyleId => {
  if (round >= 2) return 'balanced';
  if (round === 1) {
    const pool: StyleId[] = ['aggressor', 'touch', 'balanced'];
    return pool[crypto.getRandomValues(new Uint8Array(1))[0] % pool.length];
  }
  return botStyleFor(rating);
};

/**
 * Find an opponent: pairs with another waiting player (closest rating first) or
 * joins the queue. The browser calls it every second or so; after
 * MATCHMAKING_SECONDS with nobody found, a bot match starts instead.
 */
const matchmaking = async (me: PlayerRow, env: Env, search: Search = SINGLE): Promise<Response> => {
  const now = Date.now();
  let mine = await env.DB.prepare('SELECT * FROM queue WHERE player_id = ?')
    .bind(me.id)
    .first<{ joined_at: number; last_seen: number; match_id: string | null; pool: string }>();
  // Someone paired with us since we last checked.
  if (mine?.match_id) {
    const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(mine.match_id).first<MatchRow>();
    // The match is being set up this very moment: check again shortly.
    if (!m) return json({ waiting: true, secondsLeft: MATCHMAKING_SECONDS });
    await env.DB.prepare('DELETE FROM queue WHERE player_id = ?').bind(me.id).run();
    return view(env, m, 0);
  }
  // An old entry from a search we abandoned, or a search for something else: start the wait again.
  if (mine && (mine.last_seen < now - QUEUE_STALE_MS || mine.pool !== search.pool)) {
    await env.DB.prepare('DELETE FROM queue WHERE player_id = ? AND match_id IS NULL').bind(me.id).run();
    mine = null;
  }
  // Pair with the closest-rated player who is still waiting.
  const other = await env.DB.prepare(
    'SELECT player_id, cup_id, energy FROM queue WHERE player_id != ? AND pool = ? AND match_id IS NULL AND last_seen > ? ORDER BY ABS(rating - ?), joined_at LIMIT 1',
  )
    .bind(me.id, search.pool, now - QUEUE_STALE_MS, me.rating)
    .first<{ player_id: string; cup_id: string | null; energy: number }>();
  if (other) {
    // Claim them first, so two players can't both take the same opponent.
    const placeholder = randomHex(8);
    const claimed = await env.DB.prepare('UPDATE queue SET match_id = ? WHERE player_id = ? AND match_id IS NULL').bind(placeholder, other.player_id).run();
    if (claimed.meta.changes === 1) {
      const id = await startMatch(
        env,
        { player: other.player_id, energy: other.energy, cup: other.cup_id },
        { player: me.id, energy: search.energy, cup: search.cup?.id ?? null },
        null,
        search.cup?.round ?? null,
      );
      await env.DB.batch([
        env.DB.prepare('UPDATE queue SET match_id = ? WHERE player_id = ?').bind(id, other.player_id),
        env.DB.prepare('DELETE FROM queue WHERE player_id = ?').bind(me.id),
      ]);
      return view(env, await loadMatch(env, id), 1);
    }
  }
  if (!mine) {
    await env.DB.prepare('INSERT INTO queue (player_id, rating, joined_at, last_seen, pool, cup_id, energy) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(me.id, me.rating, now, now, search.pool, search.cup?.id ?? null, search.energy)
      .run();
    return json({ waiting: true, secondsLeft: MATCHMAKING_SECONDS });
  }
  const waited = now - mine.joined_at;
  if (waited < MATCHMAKING_SECONDS * 1000) {
    await env.DB.prepare('UPDATE queue SET last_seen = ? WHERE player_id = ?').bind(now, me.id).run();
    return json({ waiting: true, secondsLeft: Math.ceil((MATCHMAKING_SECONDS * 1000 - waited) / 1000) });
  }
  // Nobody came: leave the queue (unless someone paired with us this instant) and play a bot.
  const left = await env.DB.prepare('DELETE FROM queue WHERE player_id = ? AND match_id IS NULL').bind(me.id).run();
  if (left.meta.changes !== 1) return matchmaking(me, env, search);
  const round = search.cup?.round ?? null;
  const id = await startMatch(
    env,
    { player: me.id, energy: search.energy, cup: search.cup?.id ?? null },
    { player: null, energy: round === null ? 1 : CUP_BOT_ENERGY[round], cup: null },
    round === null ? botStyleFor(me.rating) : cupBotStyle(me.rating, round),
    round,
  );
  return view(env, await advance(env, id), 0);
};

// ------------------------------------------------------------------ online cup

interface CupRow {
  id: string;
  player_id: string;
  number: number;
  status: 'playing' | 'won' | 'lost' | 'abandoned';
  round: number;
  energy: number;
  rating_start: number;
  rating_end: number | null;
  started_at: number;
  finished_at: number | null;
}

const loadCup = async (env: Env, id: string, me: PlayerRow) => {
  const c = await env.DB.prepare('SELECT * FROM cup_runs WHERE id = ?').bind(id).first<CupRow>();
  if (!c || c.player_id !== me.id) throw new HttpError(404, 'Cup not found');
  return c;
};

/** The cup's match in progress, if any. */
const cupMatchInPlay = (env: Env, cupId: string) =>
  env.DB.prepare("SELECT * FROM matches WHERE (cup0 = ? OR cup1 = ?) AND status = 'playing' LIMIT 1").bind(cupId, cupId).first<MatchRow>();

/** A cup run with each round played so far: opponent, result and score, from the player's side. */
const cupView = async (env: Env, c: CupRow) => {
  const { results } = await env.DB.prepare('SELECT * FROM matches WHERE cup0 = ? OR cup1 = ? ORDER BY cup_round').bind(c.id, c.id).all<MatchRow>();
  const rounds = [];
  for (const m of results) {
    const seat: PlayerIndex = m.cup0 === c.id ? 0 : 1;
    const oppId = seat === 0 ? m.seat1 : m.seat0;
    const opp = m.bot_style
      ? botPlayer(m)
      : oppId
        ? await env.DB.prepare('SELECT id, nickname, tag, rating FROM players WHERE id = ?').bind(oppId).first<PlayerRow>().then((p) => (p ? publicPlayer(p) : null))
        : null;
    const { match } = replay(m.seed, pairsOf(await loadMoves(env, m.id)), energiesOf(m));
    rounds.push({
      round: m.cup_round,
      roundName: CUP_ROUNDS[m.cup_round ?? 0],
      matchId: m.id,
      opponent: opp,
      status: m.status,
      won: m.status === 'finished' ? m.winner === seat : null,
      resigned: m.resigned === null ? null : m.resigned === seat ? 'you' : 'opponent',
      sets: match.score.completedSets.map((s) => (seat === 0 ? s : [s[1], s[0]])),
      ratingChange: m.rating_change === null || m.status !== 'finished' ? null : m.winner === seat ? m.rating_change : -m.rating_change,
      energy: seat === 0 ? m.energy0 : m.energy1,
    });
  }
  return {
    id: c.id,
    number: c.number,
    status: c.status,
    round: c.round,
    roundName: CUP_ROUNDS[c.round],
    energy: c.energy,
    ratingStart: c.rating_start,
    ratingEnd: c.rating_end,
    startedAt: c.started_at,
    finishedAt: c.finished_at,
    rounds,
  };
};

const currentCup = (env: Env, me: PlayerRow) =>
  env.DB.prepare("SELECT * FROM cup_runs WHERE player_id = ? AND status = 'playing' ORDER BY started_at DESC LIMIT 1").bind(me.id).first<CupRow>();

/** Starts a new cup run, or returns the one already in progress. */
const startCup = async (me: PlayerRow, env: Env) => {
  const existing = await currentCup(env, me);
  if (existing) return json({ cup: await cupView(env, existing) });
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM cup_runs WHERE player_id = ?').bind(me.id).first<{ n: number }>();
  const id = randomHex(8);
  await env.DB.prepare("INSERT INTO cup_runs (id, player_id, number, status, round, energy, rating_start, started_at) VALUES (?, ?, ?, 'playing', 0, 1, ?, ?)")
    .bind(id, me.id, (count?.n ?? 0) + 1, me.rating, Date.now())
    .run();
  return json({ cup: await cupView(env, (await loadCup(env, id, me))!) }, 201);
};

/** Matchmaking for the cup's next round: players at the same round of their own cup, or a bot. */
const cupNext = async (me: PlayerRow, env: Env, id: string) => {
  const c = await loadCup(env, id, me);
  if (c.status !== 'playing') throw new HttpError(409, 'This cup is over');
  const inPlay = await cupMatchInPlay(env, c.id);
  if (inPlay) return view(env, await advance(env, inPlay.id), seatOf(inPlay, me.id));
  return matchmaking(me, env, { pool: `cup:${c.round}`, energy: c.energy, cup: { id: c.id, round: c.round } });
};

/** Leaves a cup: resigns its match in progress and marks the run abandoned. */
const abandonCup = async (me: PlayerRow, env: Env, id: string) => {
  const c = await loadCup(env, id, me);
  if (c.status !== 'playing') return json({ cup: await cupView(env, c) });
  await env.DB.prepare('DELETE FROM queue WHERE player_id = ? AND match_id IS NULL').bind(me.id).run();
  const inPlay = await cupMatchInPlay(env, c.id);
  if (inPlay) {
    const seat = seatOf(inPlay, me.id);
    await finish(env, await advance(env, inPlay.id), (1 - seat) as PlayerIndex, seat);
  }
  const rating = (await env.DB.prepare('SELECT rating FROM players WHERE id = ?').bind(me.id).first<{ rating: number }>())?.rating ?? me.rating;
  // A run that just ended as a loss still counts as abandoned: the player chose to leave.
  await env.DB.prepare("UPDATE cup_runs SET status = 'abandoned', rating_end = ?, finished_at = COALESCE(finished_at, ?) WHERE id = ? AND status IN ('playing', 'lost')")
    .bind(rating, Date.now(), c.id)
    .run();
  return json({ cup: await cupView(env, await loadCup(env, id, me)) });
};

const cupHistory = async (me: PlayerRow, env: Env) => {
  const { results } = await env.DB.prepare('SELECT * FROM cup_runs WHERE player_id = ? ORDER BY started_at DESC LIMIT 20').bind(me.id).all<CupRow>();
  const cups = [];
  for (const c of results) cups.push(await cupView(env, c));
  return json({ cups });
};

const cancelMatchmaking = async (me: PlayerRow, env: Env) => {
  await env.DB.prepare('DELETE FROM queue WHERE player_id = ? AND match_id IS NULL').bind(me.id).run();
  return json({ ok: true });
};

/** The player's unfinished match, if any, with every exchange so far so the browser can catch up. */
const activeMatch = async (me: PlayerRow, env: Env) => {
  const m = await env.DB.prepare(
    "SELECT * FROM matches WHERE (seat0 = ? OR seat1 = ?) AND status = 'playing' ORDER BY started_at DESC LIMIT 1",
  )
    .bind(me.id, me.id)
    .first<MatchRow>();
  if (!m) return json({ match: null });
  const current = await advance(env, m.id);
  if (current.status !== 'playing') return json({ match: null });
  const res = await view(env, current, seatOf(current, me.id));
  return json({ match: await res.json() });
};

/** Ends the match as a loss for the player who resigns. */
const resign = async (me: PlayerRow, env: Env, id: string) => {
  const m = await advance(env, id);
  const seat = seatOf(m, me.id);
  if (m.status === 'playing') await finish(env, m, (1 - seat) as PlayerIndex, seat);
  return view(env, await loadMatch(env, id), seat);
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
    const { match } = replay(m.seed, pairsOf(await loadMoves(env, m.id)), energiesOf(m));
    const opp = others.find((p) => p.id === (seat === 0 ? m.seat1 : m.seat0));
    const won = m.winner === seat;
    matches.push({
      id: m.id,
      finishedAt: m.finished_at,
      opponent: m.bot_style ? botPlayer(m) : opp ? publicPlayer(opp) : null,
      won,
      cupRound: m.cup_round === null ? null : CUP_ROUNDS[m.cup_round],
      resigned: m.resigned === null ? null : m.resigned === seat ? 'you' : 'opponent',
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
  if (path === '/api/me/active' && method === 'GET') return activeMatch(me, env);
  if (path === '/api/matches' && method === 'POST') return createMatch(me, env);
  if (path === '/api/matches/join' && method === 'POST') return joinMatch(req, me, env);
  if (path === '/api/matchmaking' && method === 'POST') return matchmaking(me, env);
  if (path === '/api/matchmaking/cancel' && method === 'POST') return cancelMatchmaking(me, env);
  if (path === '/api/cups' && method === 'POST') return startCup(me, env);
  if (path === '/api/cups' && method === 'GET') return cupHistory(me, env);
  if (path === '/api/cups/current' && method === 'GET') {
    const c = await currentCup(env, me);
    return json({ cup: c ? await cupView(env, c) : null });
  }
  const cupGet = path.match(/^\/api\/cups\/([0-9a-f]{16})$/);
  if (cupGet && method === 'GET') return json({ cup: await cupView(env, await loadCup(env, cupGet[1], me)) });
  const cupPath = path.match(/^\/api\/cups\/([0-9a-f]{16})\/(next|abandon)$/);
  if (cupPath && method === 'POST') return cupPath[2] === 'next' ? cupNext(me, env, cupPath[1]) : abandonCup(me, env, cupPath[1]);
  const matchPath = path.match(/^\/api\/matches\/([0-9a-f]{16})(\/moves|\/resign)?$/);
  if (matchPath && !matchPath[2] && method === 'GET') {
    const m = await advance(env, matchPath[1]);
    return view(env, m, seatOf(m, me.id), Number(url.searchParams.get('since') ?? 0));
  }
  if (matchPath && matchPath[2] === '/moves' && method === 'POST') return submitMove(req, me, env, matchPath[1]);
  if (matchPath && matchPath[2] === '/resign' && method === 'POST') return resign(me, env, matchPath[1]);
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
