CREATE TABLE ranked_queue_samples (
  queue_key TEXT NOT NULL,
  sampled_at INTEGER NOT NULL,
  queued_players INTEGER NOT NULL CHECK (queued_players >= 0),
  PRIMARY KEY (queue_key, sampled_at)
);

CREATE INDEX ranked_queue_samples_history
  ON ranked_queue_samples (queue_key, sampled_at DESC);
