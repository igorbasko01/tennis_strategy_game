-- Players are identified per device: a public id plus a secret token (stored hashed).
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  tag TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  recovery_hash TEXT NOT NULL UNIQUE,
  rating INTEGER NOT NULL DEFAULT 1000,
  created_at INTEGER NOT NULL
);

-- A match between two seats (0 and 1). Its state is replayed from the seed and the moves.
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  seat0 TEXT NOT NULL REFERENCES players(id),
  seat1 TEXT REFERENCES players(id),
  seed INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'playing', 'finished')),
  winner INTEGER,
  -- The seat that resigned, when the match ended that way.
  resigned INTEGER,
  rating_change INTEGER,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX matches_waiting_code ON matches (code) WHERE status = 'waiting';
CREATE INDEX matches_seat0 ON matches (seat0);
CREATE INDEX matches_seat1 ON matches (seat1);

-- Every locked-in choice, one per seat per exchange.
CREATE TABLE moves (
  match_id TEXT NOT NULL REFERENCES matches(id),
  exchange INTEGER NOT NULL,
  seat INTEGER NOT NULL CHECK (seat IN (0, 1)),
  choice TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, exchange, seat)
);
