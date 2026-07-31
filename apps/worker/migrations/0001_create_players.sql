CREATE TABLE players (
  player_id TEXT PRIMARY KEY NOT NULL CHECK (length(player_id) = 36),
  credential_hash TEXT NOT NULL UNIQUE CHECK (length(credential_hash) = 64),
  created_at INTEGER NOT NULL
);
