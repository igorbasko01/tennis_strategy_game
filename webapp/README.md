# Tennis Strategy — Web

The browser version of Tennis Strategy, built with TypeScript, [three.js](https://threejs.org) and [Vite](https://vitejs.dev).
It implements the rules in [`docs/tennis_strategy_design.md`](../docs/tennis_strategy_design.md) and is designed for phones
first (portrait and landscape), with tablets and desktops also supported.

## Features

- Simultaneous bundled decisions: pick a **target** and a **read** each exchange; the choices are revealed together.
- Serve phase (Wide / Body / T-Line vs. Wide / Neutral / T-Line reads) and rally phase (Cross-Court / Down the Line / Center Deep / Drop Shot).
- Resolution that follows the design: `skill + action modifier + random(-0.3..0.3)`, shown in a per-shot breakdown.
- Energy: running drains it and it recovers between points and at changeovers. In tournaments it carries over, round to round and tournament to tournament, with a 30% rest after each match; you can skip a tournament to rest another 30% (CPUs skip when tired or at random). Fresh players can scramble back from a wrong read; tired ones lose up to 0.15 on every shot and read.
- Every match is the best of three games: the first to win two games wins.
- Tennis scoring within each game (15/30/40, deuce and advantage), with the serve alternating every game.
- **Practice match:** pick your skill and the CPU's from five tiers (Beginner 0.3, Club 0.4, Pro 0.5, Elite 0.6, Legend 0.7).
- **Tournament:** an 8-player knockout (quarterfinal, semifinal, final), each match the best of three games. Every player starts at skill 0.30. After each match the winner takes skill from the loser, Elo-style: an upset moves up to 0.06, an expected win over a much weaker player almost nothing. Skipping a tournament costs 0.01–0.05 skill, but never below 0.30; skill never drops below 0.20. Skills are saved and carry over: yours, and those of the 15 CPU players. Every tournament runs two 8-player draws at the same time, filled by skill from whoever enters: Tier 1 is the strongest eight, Tier 2 the rest (with byes if short). You play in your tier and the other is played out in the background. When you are in Tier 2 it is always a full draw of the bottom eight, and Tier 1 takes the byes. Draws use classic tennis seeding by skill, with seed numbers shown in the bracket: quarterfinals are 1 v 8 and 4 v 5 in one half, 3 v 6 and 2 v 7 in the other, so the strongest meet at the end. In a short draw the top seeds get the byes. Tournaments pay prize money after every match: Tier 2 pays $10 for playing the quarterfinal, then $10, $20 and $40 for winning each round ($80 for a title); Tier 1 pays $25, $25, $50 and $100 ($200). Your total shows on the profile and before each tournament; skipping earns nothing. After a tournament loss you can spend it on one coaching review: +0.01 skill and a summary of what your opponent kept doing, for $100 at skill 0.30 plus $20 for every 0.1 above. If you are knocked out, the rest of the draw is played out so every tournament has a champion. Progress is saved in the browser between matches. Tournaments are numbered (#1, #2, …).
- **Play online:** *Find an opponent* pairs you with another player who is searching (closest rating first); if nobody turns up within 15 seconds you play a server-side bot instead, shown as 🤖 with its playing style, which can't see your choices and doesn't change your rating. Or invite a friend with a link or a 4-letter code and play them live. Both players are at skill 0.50, so only decisions (and the dice) count; there is no turn timer, a match simply waits for both choices. An unfinished match can be resumed after a reload or on another visit (Resume online match on the menu), and you can resign from the in-game menu (it counts as a loss). Your online player is a nickname with a tag (e.g. Igor#4821) kept on this device, with an online rating (starts at 1000, chess-style Elo), match history and a recovery code to restore it on another device. Online play is separate from the single-player career.
- **Profile:** your skill, tournaments played, titles and match record, plus every tournament with its result and each match you played in it. **Settings → Start fresh** wipes skill and history.
- **Rankings:** every player (you and the 14 CPUs) ranked by skill. The tournament bracket shows each player's skill too.
- **CPU styles:** every CPU player has a visible playing style with fixed tendencies and no memory: 🧱 Grinder, ⚡ Aggressor, 🪶 Touch player or ⚖️ Balanced (a game-theory mix). Styles are dealt out evenly and reshuffled when you start fresh. Practice matches use a Balanced CPU.
- 3D court with animated players and ball. You can tap the zones on the court as well as the buttons.

## Develop

```bash
cd webapp
npm install
npm run dev      # http://localhost:5173 (also exposed on your LAN to test on a phone)
npm test         # engine unit tests (vitest)
npm run build    # production build in webapp/dist
```

## Layout

```
src/
├── engine/           # Pure game logic, no DOM, unit tested
│   ├── actions.ts    # Action catalogue and modifier tables
│   ├── resolution.ts # Shot vs. read resolution
│   ├── scoring.ts    # Points / games / sets / tiebreaks
│   ├── match.ts      # Turn flow, choice collection, stats
│   ├── energy.ts     # Energy costs, recovery, fatigue and scramble
│   ├── ai.ts         # CPU opponent (picks from its style's percentages)
│   ├── styles.ts     # CPU playing styles
│   ├── skill.ts      # Practice-match skill tiers
│   ├── profile.ts    # Tournament history and profile stats
│   └── tournament.ts # Knockout bracket, skill gains, CPU-vs-CPU simulation
├── scene/            # three.js court, players, ball, animation
└── ui/               # DOM panels, menus, sound
```

## Deploy

**Online server:** `server/` is a Cloudflare Worker with a D1 database (`.github/workflows/deploy-server.yml` applies migrations and deploys on every push to `main` that touches `server/` or the engine; it needs the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`). The web app talks to `https://tennis-strategy.igorbasko.workers.dev` unless built with `VITE_API_URL`. See `server/README.md`.

The build output is static (`webapp/dist`) and uses relative asset paths, so it can be served from any sub-path.

**GitHub Pages:** `.github/workflows/deploy-web.yml` tests, builds and deploys on every push to `main` that touches `webapp/`.
Enable it once under *Settings → Pages → Build and deployment → Source: GitHub Actions*.
The game is then served at `https://<user>.github.io/<repo>/`.

**Cloudflare Pages:** create a project connected to this repo with:

| Setting                | Value             |
| ---------------------- | ----------------- |
| Root directory         | `webapp`          |
| Build command          | `npm run build`   |
| Build output directory | `dist`            |
| Environment variable   | `NODE_VERSION=22` |
