CREATE TABLE device_credentials (
  credential_id TEXT PRIMARY KEY NOT NULL CHECK (length(credential_id) = 36),
  player_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE CHECK (length(secret_hash) = 64),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE
);

CREATE INDEX device_credentials_player_active
  ON device_credentials (player_id, revoked_at);

INSERT INTO device_credentials (
  credential_id,
  player_id,
  secret_hash,
  created_at
)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))),
  player_id,
  credential_hash,
  created_at
FROM players;
