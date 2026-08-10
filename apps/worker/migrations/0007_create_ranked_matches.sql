CREATE TABLE active_ranked_matches (
  match_id TEXT PRIMARY KEY NOT NULL CHECK (length(match_id) = 36),
  room_key TEXT NOT NULL UNIQUE CHECK (length(room_key) = 36),
  queue_key TEXT NOT NULL,
  rating_pool TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('bo1')),
  player_one_id TEXT NOT NULL,
  player_two_id TEXT NOT NULL,
  player_one_rating INTEGER NOT NULL,
  player_two_rating INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('assigned', 'active')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  activated_at INTEGER,
  FOREIGN KEY (player_one_id) REFERENCES players(player_id) ON DELETE CASCADE,
  FOREIGN KEY (player_two_id) REFERENCES players(player_id) ON DELETE CASCADE,
  CHECK (player_one_id <> player_two_id),
  CHECK (expires_at > created_at),
  CHECK (
    (state = 'assigned' AND activated_at IS NULL) OR
    (state = 'active' AND activated_at IS NOT NULL)
  )
);

CREATE INDEX active_ranked_matches_player_one
  ON active_ranked_matches (player_one_id);

CREATE INDEX active_ranked_matches_player_two
  ON active_ranked_matches (player_two_id);

CREATE TRIGGER active_ranked_matches_unique_players
BEFORE INSERT ON active_ranked_matches
WHEN EXISTS (
  SELECT 1
  FROM active_ranked_matches
  WHERE player_one_id IN (NEW.player_one_id, NEW.player_two_id)
    OR player_two_id IN (NEW.player_one_id, NEW.player_two_id)
)
BEGIN
  SELECT RAISE(ABORT, 'PLAYER_ALREADY_IN_RANKED_MATCH');
END;

CREATE TRIGGER active_ranked_matches_players_immutable
BEFORE UPDATE OF player_one_id, player_two_id ON active_ranked_matches
BEGIN
  SELECT RAISE(ABORT, 'RANKED_MATCH_PLAYERS_ARE_IMMUTABLE');
END;

CREATE TABLE rated_matches (
  match_id TEXT PRIMARY KEY NOT NULL CHECK (length(match_id) = 36),
  room_key TEXT NOT NULL UNIQUE CHECK (length(room_key) = 36),
  queue_key TEXT NOT NULL,
  rating_pool TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('bo1')),
  player_one_id TEXT NOT NULL,
  player_two_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (
    result IN ('player-one-win', 'draw', 'player-two-win', 'no-contest')
  ),
  finish_reason TEXT NOT NULL CHECK (
    finish_reason IN ('completed', 'forfeit', 'no-contest')
  ),
  player_one_rating_before INTEGER NOT NULL,
  player_two_rating_before INTEGER NOT NULL,
  player_one_rating_after INTEGER NOT NULL,
  player_two_rating_after INTEGER NOT NULL,
  rating_delta INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  activated_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  settled_at INTEGER NOT NULL,
  FOREIGN KEY (player_one_id) REFERENCES players(player_id),
  FOREIGN KEY (player_two_id) REFERENCES players(player_id),
  CHECK (player_one_id <> player_two_id),
  CHECK (activated_at >= created_at),
  CHECK (finished_at >= activated_at),
  CHECK (settled_at >= finished_at),
  CHECK (
    (result = 'no-contest' AND finish_reason = 'no-contest' AND
      rating_delta = 0 AND
      player_one_rating_after = player_one_rating_before AND
      player_two_rating_after = player_two_rating_before) OR
    (result <> 'no-contest' AND finish_reason <> 'no-contest' AND
      player_one_rating_after = player_one_rating_before + rating_delta AND
      player_two_rating_after = player_two_rating_before - rating_delta)
  )
);

CREATE INDEX rated_matches_player_one_history
  ON rated_matches (player_one_id, settled_at DESC);

CREATE INDEX rated_matches_player_two_history
  ON rated_matches (player_two_id, settled_at DESC);

CREATE TRIGGER rated_matches_validate_active_match
BEFORE INSERT ON rated_matches
WHEN NOT EXISTS (
  SELECT 1
  FROM active_ranked_matches
  WHERE match_id = NEW.match_id
    AND room_key = NEW.room_key
    AND queue_key = NEW.queue_key
    AND rating_pool = NEW.rating_pool
    AND format = NEW.format
    AND player_one_id = NEW.player_one_id
    AND player_two_id = NEW.player_two_id
    AND player_one_rating = NEW.player_one_rating_before
    AND player_two_rating = NEW.player_two_rating_before
    AND state = 'active'
    AND created_at = NEW.created_at
    AND activated_at = NEW.activated_at
)
OR NOT EXISTS (
  SELECT 1
  FROM player_ratings
  WHERE player_id = NEW.player_one_id
    AND rating_pool = NEW.rating_pool
    AND rating = NEW.player_one_rating_before
)
OR NOT EXISTS (
  SELECT 1
  FROM player_ratings
  WHERE player_id = NEW.player_two_id
    AND rating_pool = NEW.rating_pool
    AND rating = NEW.player_two_rating_before
)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_RANKED_MATCH_SETTLEMENT');
END;
