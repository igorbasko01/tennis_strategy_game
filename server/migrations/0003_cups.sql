-- Online Cup: a player's run through quarterfinal, semifinal and final.
-- Each round is matched separately (another player at the same round, or a bot),
-- and the player's energy carries from one round to the next.
CREATE TABLE cup_runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  -- 1, 2, 3, ... per player.
  number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('playing', 'won', 'lost', 'abandoned')),
  -- The round being played or next to play (0 quarterfinal, 1 semifinal, 2 final); the round reached once over.
  round INTEGER NOT NULL DEFAULT 0,
  -- Energy going into the next round.
  energy REAL NOT NULL DEFAULT 1,
  rating_start INTEGER NOT NULL,
  rating_end INTEGER,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX cup_runs_player ON cup_runs (player_id, started_at);
CREATE INDEX cup_runs_status ON cup_runs (status, finished_at);

-- Each seat's energy going into a match, and which cup run (and round) a match belongs to.
ALTER TABLE matches ADD COLUMN energy0 REAL NOT NULL DEFAULT 1;
ALTER TABLE matches ADD COLUMN energy1 REAL NOT NULL DEFAULT 1;
ALTER TABLE matches ADD COLUMN cup0 TEXT REFERENCES cup_runs(id);
ALTER TABLE matches ADD COLUMN cup1 TEXT REFERENCES cup_runs(id);
ALTER TABLE matches ADD COLUMN cup_round INTEGER;
CREATE INDEX matches_cup0 ON matches (cup0);
CREATE INDEX matches_cup1 ON matches (cup1);

-- Matchmaking pools: single matches, or one pool per cup round. Cup entries carry the run and its energy.
ALTER TABLE queue ADD COLUMN pool TEXT NOT NULL DEFAULT 'single';
ALTER TABLE queue ADD COLUMN cup_id TEXT;
ALTER TABLE queue ADD COLUMN energy REAL NOT NULL DEFAULT 1;
