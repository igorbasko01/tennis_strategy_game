# Tennis Strategy — Web

The browser version of Tennis Strategy, built with TypeScript, [three.js](https://threejs.org) and [Vite](https://vitejs.dev).
It implements the rules in [`docs/tennis_strategy_design.md`](../docs/tennis_strategy_design.md) and is designed for phones
first (portrait and landscape), with tablets and desktops also supported.

## Features

- Simultaneous bundled decisions: pick a **target** and a **read** each exchange; the choices are revealed together.
- Serve phase (Wide / Body / T-Line vs. Wide / Neutral / T-Line reads) and rally phase (Cross-Court / Down the Line / Center Deep / Drop Shot).
- Resolution that follows the design: `skill + action modifier + random(-0.3..0.3)`, shown in a per-shot breakdown.
- Full tennis scoring: deuce/advantage, games, sets, tiebreaks, and serve rotation.
- vs CPU (Rookie / Pro / Champion, which learns your habits) or 2 players on one device with a hand-off screen.
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
│   └── ai.ts         # CPU opponent
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
