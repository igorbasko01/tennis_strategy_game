# Tennis Strategy — Web

The browser version of Tennis Strategy, built with TypeScript, [three.js](https://threejs.org) and [Vite](https://vitejs.dev).
It implements the rules in [`docs/tennis_strategy_design.md`](../docs/tennis_strategy_design.md) and is designed for phones
first (portrait and landscape), with tablets and desktops also supported.

## Features

- Simultaneous bundled decisions: pick a **target** and a **read** each exchange; the choices are revealed together.
- Serve phase (Wide / Body / T-Line vs. Wide / Neutral / T-Line reads) and rally phase (Cross-Court / Down the Line / Center Deep / Drop Shot).
- Resolution that follows the design: `skill + action modifier + random(-0.3..0.3)`, shown in a per-shot breakdown.
- Energy: running drains it and it recovers between points and at changeovers. In the Online Cup it carries from round to round with a 30% rest after each match. Fresh players can scramble back from a wrong read; tired ones lose up to 0.15 on every shot and read.
- Every match is the best of three games: the first to win two games wins.
- Tennis scoring within each game (15/30/40, deuce and advantage), with the serve alternating every game.
- **Play online:** *Find an opponent* pairs you with another player who is searching (closest rating first); if nobody turns up within 15 seconds you play a server-side bot instead, shown as 🤖 with its playing style, which can't see your choices and doesn't change your rating. The *Online Cup* is a three-round run (quarterfinal, semifinal, final): each round you meet a player at the same round of their own cup, or a bot that gets tougher each round; your energy carries over with a 30% rest after each match, and *Cup history* keeps every run with its results and opponents. Or invite a friend with a link or a 4-letter code and play them live. Both players are at skill 0.50, so only decisions (and the dice) count; there is no turn timer, a match simply waits for both choices. An unfinished match can be resumed after a reload or on another visit (Resume online match on the menu), and you can resign from the in-game menu (it counts as a loss). Your online player is a nickname with a tag (e.g. Igor#4821) kept on this device, with an online rating (starts at 1000, chess-style Elo), match history and a recovery code to restore it on another device.
- **Bot styles:** every bot has a visible playing style with fixed tendencies and no memory: 🧱 Grinder, ⚡ Aggressor, 🪶 Touch player or ⚖️ Balanced (a game-theory mix).
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
│   ├── ai.ts         # Bot opponent (picks from its style's percentages)
│   ├── styles.ts     # Bot playing styles
│   ├── verdict.ts    # Per-shot odds and what decided it
│   └── online.ts     # Online matches: seeded replay shared with the server
├── online/           # Online server client and device identity
├── scene/            # three.js court, players, ball, animation
└── ui/               # DOM panels, menus, sound
```

## Deploy

The game is served at **https://tennisim.baskorp.com** by one Cloudflare Worker (`server/`): it serves the built web app (`webapp/dist`) and the online server under `/api/*`, so both share the same address. `.github/workflows/deploy-server.yml` tests and builds the web app, applies D1 migrations and deploys on every push to `main` that touches `webapp/` or `server/`; it needs the repo secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit, Workers Routes Edit, D1 Edit) and `CLOUDFLARE_ACCOUNT_ID`. The custom domain is set in `server/wrangler.toml`; Cloudflare creates its DNS record and certificate.

The web app calls the online server on its own address. For local development run `wrangler dev` in `server/` (it also serves the built app at http://localhost:8787), or run `vite` with `VITE_API_URL=http://localhost:8787`.

The old GitHub Pages address only redirects to the new one (`pages-redirect/`, deployed by `.github/workflows/deploy-web.yml`), keeping invite links working.
