CREATE TABLE rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY NOT NULL CHECK (length(bucket_key) = 64),
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  updated_at INTEGER NOT NULL
);

CREATE INDEX rate_limit_buckets_updated
  ON rate_limit_buckets (updated_at);
