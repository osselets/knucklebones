ALTER TABLE players
  ADD COLUMN display_name TEXT NOT NULL DEFAULT 'Player';

UPDATE players
SET display_name = 'Player ' || substr(player_id, 1, 8);
