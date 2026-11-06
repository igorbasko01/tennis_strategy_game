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
  // Resume and resign: a second match between them.
  const b2 = rec; // Alice's new token after recovery
  const m2 = await call('/api/matches', b2.token, {});
  const none = await call('/api/me/active', b2.token);
  assert(none.match === null, 'a waiting invite is not an unfinished match');
  await call('/api/matches/join', b.token, { code: m2.code });
  const active = await call('/api/me/active', b.token);
  assert(active.match && active.match.id === m2.id && active.match.status === 'playing', 'the unfinished match is found');
  const resigned = await call(`/api/matches/${m2.id}/resign`, b.token, {});
  assert(resigned.status === 'finished' && resigned.winner === 1 && resigned.resigned === 0, 'resigning loses the match');
  const seenByAlice = await call(`/api/matches/${m2.id}`, b2.token);
  assert(seenByAlice.winner === 0 && seenByAlice.resigned === 1, 'the opponent sees the resignation as a win');
  assert((await call('/api/me/active', b.token)).match === null, 'nothing left to resume');
  const h2 = await call('/api/me/matches', b.token);
  assert(h2.matches[0].resigned === 'you', 'history shows who resigned');
  // Matchmaking: two players looking at the same time are paired with each other.
  const c = await call('/api/players', undefined, { nickname: 'Cara' });
  const d = await call('/api/players', undefined, { nickname: 'Dev' });
  const first = await call('/api/matchmaking', c.token, {});
  assert(first.waiting && first.secondsLeft > 0, 'the first player waits in the queue');
  const paired = await call('/api/matchmaking', d.token, {});
  assert(paired.status === 'playing' && paired.opponent.nickname === 'Cara' && paired.rated, 'the second player is paired with the first');
  const found = await call('/api/matchmaking', c.token, {});
  assert(found.id === paired.id && found.opponent.nickname === 'Dev', 'the first player finds the same match');
  await call(`/api/matches/${paired.id}/resign`, c.token, {});

  // Nobody else looking: a bot match starts after the wait, unrated, and the bot moves by itself.
  const e = await call('/api/players', undefined, { nickname: 'Eve' });
  let r = await call('/api/matchmaking', e.token, {});
  while (r.waiting) {
    await new Promise((res) => setTimeout(res, 1000));
    r = await call('/api/matchmaking', e.token, {});
  }
  assert(r.opponent.bot && r.opponent.nickname.endsWith('Bot') && r.rated === false, 'a bot opponent after the wait');
  assert(r.current.opponentLocked && !r.current.youLocked, 'the bot has already chosen, the player not yet');
  const mirror = newOnlineMatch(['Me', 'Bot'], r.firstServer as PlayerIndex);
  const ai = new AiOpponent();
  let bot = r;
  let n = 0;
  while (bot.status === 'playing') {
    bot = await call(`/api/matches/${bot.id}/moves`, e.token, { exchange: n, choice: ai.choose(mirror, 0), since: n });
    for (const x of bot.exchanges as ResolvedExchange[]) playExchange(mirror, x.choices, replayRng(x.rolls));
    n++;
  }
  assert(mirror.isOver && bot.winner === mirror.score.winner && bot.ratingChange === null, 'bot match finished, unrated');
  const eve = await call('/api/me', e.token);
  assert(eve.player.rating === 1000, 'rating unchanged after a bot match');
  const eh = await call('/api/me/matches', e.token);
  assert(eh.matches[0].opponent.bot && eh.matches[0].ratingChange === null, 'history shows the bot match');
  // Online Cup, alone: every round against a bot, energy carried over, until the run ends.
  const f = await call('/api/players', undefined, { nickname: 'Finn' });
  let cup = (await call('/api/cups', f.token, {})).cup;
  assert(cup.status === 'playing' && cup.round === 0 && cup.number === 1 && cup.energy === 1, 'a new cup starts at the quarterfinal, fresh');
  assert((await call('/api/cups', f.token, {})).cup.id === cup.id, 'starting again returns the cup in progress');
  const cupLog: string[] = [];
  while (cup.status === 'playing') {
    const energyIn = cup.energy;
    let r = await call(`/api/cups/${cup.id}/next`, f.token, {});
    while (r.waiting) {
      await new Promise((res) => setTimeout(res, 1000));
      r = await call(`/api/cups/${cup.id}/next`, f.token, {});
    }
    assert(r.cup && r.cup.round === cup.round && r.opponent.bot && !r.rated, `a bot in the ${cup.roundName}`);
    assert(r.energy[0] === energyIn, 'the player brings their carried energy');
    assert(r.energy[1] === [1, 0.85, 0.75][cup.round], 'the bot is as rested as a typical player at this round');
    if (cup.round === 2) assert(r.opponent.bot.style === 'balanced', 'the final bot plays Balanced');
    const m = newOnlineMatch(['Me', 'Bot'], r.firstServer as PlayerIndex, r.energy);
    let k = 0;
    while (r.status === 'playing') {
      r = await call(`/api/matches/${r.id}/moves`, f.token, { exchange: k, choice: ai.choose(m, 0), since: k });
      for (const x of r.exchanges as ResolvedExchange[]) playExchange(m, x.choices, replayRng(x.rolls));
      k++;
    }
    const next = (await call('/api/cups/current', f.token)).cup ?? (await call(`/api/cups/${cup.id}`, f.token)).cup;
    cupLog.push(`${cup.roundName} ${r.winner === 0 ? 'W' : 'L'}`);
    if (r.winner === 0 && cup.round < 2) {
      assert(next.status === 'playing' && next.round === cup.round + 1, 'a win moves the run to the next round');
      assert(Math.abs(next.energy - Math.min(1, m.energy[0] + 0.3)) < 0.002, 'energy carries over with a 30% rest');
    } else {
      assert(next.status === (r.winner === 0 ? 'won' : 'lost') && next.round === cup.round && next.ratingEnd === 1000, 'the run ends here');
    }
    cup = next;
  }
  assert(cup.rounds.length === cupLog.length && cup.rounds.every((x: any) => x.opponent.bot && x.won !== null), 'the run keeps every round with its opponent');

  // Two players at the same round meet each other; leaving the cup hands the opponent the round.
  const g = await call('/api/players', undefined, { nickname: 'Gus' });
  const h = await call('/api/players', undefined, { nickname: 'Hana' });
  const cg = (await call('/api/cups', g.token, {})).cup;
  const ch = (await call('/api/cups', h.token, {})).cup;
  assert((await call(`/api/cups/${cg.id}/next`, g.token, {})).waiting, 'the first cup player waits');
  const meet = await call(`/api/cups/${ch.id}/next`, h.token, {});
  assert(meet.status === 'playing' && meet.opponent.nickname === 'Gus' && meet.rated && meet.cup.round === 0, 'two quarterfinalists are paired, rated');
  const left = (await call(`/api/cups/${cg.id}/abandon`, g.token, {})).cup;
  assert(left.status === 'abandoned', 'leaving the cup ends the run');
  const hNow = (await call('/api/cups/current', h.token)).cup;
  assert(hNow.round === 1 && hNow.rounds[0].won && hNow.rounds[0].resigned === 'opponent', 'the opponent goes through to the semifinal');
  const cupHist = (await call('/api/cups', g.token)).cups;
  assert(cupHist.length === 1 && cupHist[0].rounds[0].opponent.nickname === 'Hana', 'cup history lists the run and its opponents');
  await call(`/api/cups/${ch.id}/abandon`, h.token, {});

  console.log(`OK: ${exchange} exchanges, sets ${JSON.stringify(la.score.completedSets)}, Alice ${meA.player.rating}, Bob ${meB.player.rating}; bot match ${n} exchanges vs ${bot.opponent.nickname} (${bot.opponent.bot.style}); cup ${cupLog.join(', ')} → ${cup.status}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
