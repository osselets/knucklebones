CREATE TABLE player_ratings (
  player_id TEXT NOT NULL,
  rating_pool TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1200,
  games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  draws INTEGER NOT NULL DEFAULT 0 CHECK (draws >= 0),
  losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, rating_pool),
  FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE
);

CREATE INDEX player_ratings_pool_rating
  ON player_ratings (rating_pool, rating DESC);

INSERT INTO player_ratings (player_id, rating_pool, updated_at)
  SELECT player_id, 'classic', created_at FROM players;

CREATE TRIGGER players_create_default_ranked_profile
AFTER INSERT ON players
BEGIN
  INSERT INTO player_ratings (player_id, rating_pool, updated_at)
    VALUES (NEW.player_id, 'classic', NEW.created_at);
END;
