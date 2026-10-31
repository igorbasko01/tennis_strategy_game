# Tennis Strategy — Web

The browser version of Tennis Strategy, built with TypeScript, [three.js](https://threejs.org) and [Vite](https://vitejs.dev).
It implements the rules in [`docs/tennis_strategy_design.md`](../docs/tennis_strategy_design.md) and is designed for phones
first (portrait and landscape), with tablets and desktops also supported.

## Features

- Simultaneous bundled decisions: pick a **target** and a **read** each exchange; the choices are revealed together.
- Serve phase (Wide / Body / T-Line vs. Wide / Neutral / T-Line reads) and rally phase (Cross-Court / Down the Line / Center Deep / Drop Shot).
- Resolution that follows the design: `skill + action modifier + random(-0.3..0.3)`, shown in a per-shot breakdown.
- Energy: running drains it and it recovers between points and at changeovers. Fresh players can scramble back from a wrong read; tired ones lose up to 0.15 on every shot and read.
- Every match is the best of three games: the first to win two games wins.
- Tennis scoring within each game (15/30/40, deuce and advantage), with the serve alternating every game.
- **Practice match:** pick your skill and the CPU's from five tiers (Beginner 0.3, Club 0.4, Pro 0.5, Elite 0.6, Legend 0.7).
- **Tournament:** an 8-player knockout (quarterfinal, semifinal, final), each match the best of three games. Every player starts at skill 0.30 and every round won adds a random 0.00–0.05. Skills are saved and carry over: yours, and those of the 14 CPU players, 7 of whom are drawn for each tournament. If you are knocked out, the rest of the draw is played out so every tournament has a champion. Progress is saved in the browser between matches. Tournaments are numbered (#1, #2, …).
- **Profile:** your skill, tournaments played, titles and match record, plus every tournament with its result and each match you played in it. **Settings → Start fresh** wipes skill and history.
- **Rankings:** every player (you and the 14 CPUs) ranked by skill. The tournament bracket shows each player's skill too.
- The CPU currently picks every decision at random; smarter behaviour will come later.
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
│   ├── ai.ts         # CPU opponent (random choices)
│   ├── skill.ts      # Practice-match skill tiers
│   ├── profile.ts    # Tournament history and profile stats
│   └── tournament.ts # Knockout bracket, skill gains, CPU-vs-CPU simulation
├── scene/            # three.js court, players, ball, animation
└── ui/               # DOM panels, menus, sound
```

## Deploy

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
