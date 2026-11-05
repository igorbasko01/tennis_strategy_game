# Tennis Strategy — online server

A Cloudflare Worker with a D1 (SQLite) database that runs online matches between two players.

## How it works

- **Players** are per device: `POST /api/players` with a nickname returns a public player, a secret token (sent as `Authorization: Bearer …`, stored hashed) and a recovery code (`POST /api/players/recover` issues a new token for it).
- **Matches** are created with an invite code (`POST /api/matches`) and joined with it (`POST /api/matches/join`).
- **Resume and resign:** `GET /api/me/active` returns the player's unfinished match with every exchange so far, so a browser can catch up after a reload; `POST /api/matches/:id/resign` ends it as a loss.
- **Moves:** each player posts their choice for the current exchange (`POST /api/matches/:id/moves`). A choice is never shown to the opponent until both have locked in. There is no turn timer.
- **No stored game state:** a match is replayed from its random seed and the moves table with the same engine the browser uses (`webapp/src/engine/online.ts`), so the dice come from the server and can't be faked. Every resolved exchange is sent with the dice it used, so each browser replays it exactly, always as player 0.
- **Rating:** chess-style Elo (K = 32, start 1000), updated once when a match ends. Online matches are at equal skill (0.50).

## Develop

```sh
npm ci
npx wrangler d1 migrations apply tennis-strategy --local
npm run dev              # http://localhost:8787
npm run e2e              # plays a whole match between two scripted players against it
```

Point the web app at it with `VITE_API_URL=http://localhost:8787 npm run dev` in `webapp/`.

## Deploy

`.github/workflows/deploy-server.yml` type-checks and dry-runs the build on pull requests, and on `main` applies D1 migrations and deploys. It needs the repo secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit + D1 Edit) and `CLOUDFLARE_ACCOUNT_ID`.
