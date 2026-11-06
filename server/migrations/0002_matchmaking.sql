-- Bot matches: seat 1 is a server-side bot with a playing style; they don't change ratings.
ALTER TABLE matches ADD COLUMN bot_style TEXT;
ALTER TABLE matches ADD COLUMN bot_name TEXT;
ALTER TABLE matches ADD COLUMN rated INTEGER NOT NULL DEFAULT 1;

-- Players looking for an opponent. `match_id` is set when someone pairs with them.
CREATE TABLE queue (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  rating INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  match_id TEXT
);
