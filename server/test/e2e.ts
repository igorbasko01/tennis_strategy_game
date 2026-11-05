// Plays a whole online match between two scripted players against a running server.
// Usage: npx tsx test/e2e.ts [http://localhost:8787]
import { AiOpponent } from '../../webapp/src/engine/ai';
import { newOnlineMatch, playExchange, replayRng, type ResolvedExchange } from '../../webapp/src/engine/online';
import type { PlayerIndex } from '../../webapp/src/engine/resolution';

const base = process.argv[2] ?? 'http://localhost:8787';
const call = async (path: string, token?: string, data?: unknown) => {
  const res = await fetch(base + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(body)}`);
  return body as any;
};

const assert = (ok: unknown, msg: string) => {
  if (!ok) throw new Error(`FAILED: ${msg}`);
};

const main = async () => {
  const a = await call('/api/players', undefined, { nickname: 'Alice' });
  const b = await call('/api/players', undefined, { nickname: 'Bob' });
  assert(a.recoveryCode.startsWith('TENNIS-'), 'recovery code issued');
  const created = await call('/api/matches', a.token, {});
  assert(created.status === 'waiting' && created.code.length === 4, 'match waiting with a code');
  const joined = await call('/api/matches/join', b.token, { code: created.code });
  assert(joined.status === 'playing', 'match starts when the second player joins');
  await call('/api/matches/join', b.token, { code: created.code }).then(
    () => assert(false, 'a playing match cannot be joined again'),
    () => undefined,
  );

  const players = [
    { token: a.token as string, ai: new AiOpponent(), seen: [] as ResolvedExchange[] },
    { token: b.token as string, ai: new AiOpponent(), seen: [] as ResolvedExchange[] },
  ];
  const id = created.id as string;
  // Each player mirrors the match locally as player 0, like the browser does.
  // joined.firstServer is from Bob's (seat 1) side; Alice's mirror is flipped.
  const local = [
    newOnlineMatch(['Me', 'Them'], (1 - joined.firstServer) as PlayerIndex),
    newOnlineMatch(['Me', 'Them'], joined.firstServer as PlayerIndex),
  ];
  let exchange = 0;
  let state: any;
  for (;;) {
    for (const [seat, p] of players.entries()) {
      const choice = p.ai.choose(local[seat], 0);
      // Before both lock in, the opponent's choice must not be visible.
      state = await call(`/api/matches/${id}/moves`, p.token, { exchange, choice, since: exchange });
      if (seat === 0) {
        assert(state.current.youLocked && !state.current.opponentLocked, 'first choice is hidden from the opponent');
        assert(state.exchanges.length === 0, 'no exchange resolved with one choice');
      }
    }
    for (const [seat, p] of players.entries()) {
      const s = await call(`/api/matches/${id}?since=${exchange}`, p.token);
      for (const x of s.exchanges as ResolvedExchange[]) playExchange(local[seat], x.choices, replayRng(x.rolls));
      state = s;
    }
    exchange++;
    if (state.status !== 'playing') break;
  }
  const [la, lb] = local;
  assert(la.isOver && lb.isOver, 'both mirrors finished');
  assert(JSON.stringify(la.score.completedSets) === JSON.stringify(lb.score.completedSets.map(([x, y]) => [y, x])), 'mirrors agree');
  const finalA = await call(`/api/matches/${id}`, a.token);
  assert(finalA.winner === la.score.winner, 'server winner matches the mirror');
  const meA = await call('/api/me', a.token);
  const meB = await call('/api/me', b.token);
  assert(meA.player.rating + meB.player.rating === 2000 && meA.player.rating !== 1000, 'ratings moved, zero-sum');
  const hist = await call('/api/me/matches', a.token);
  assert(hist.matches.length === 1 && hist.matches[0].opponent.nickname === 'Bob', 'history lists the match');
  const rec = await call('/api/players/recover', undefined, { code: a.recoveryCode.toLowerCase() });
  assert(rec.player.id === a.player.id, 'recovery code restores the player');
  await call('/api/me', a.token).then(
    () => assert(false, 'old token stops working after recovery'),
    () => undefined,
  );
  console.log(`OK: ${exchange} exchanges, sets ${JSON.stringify(la.score.completedSets)}, Alice ${meA.player.rating}, Bob ${meB.player.rating}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
