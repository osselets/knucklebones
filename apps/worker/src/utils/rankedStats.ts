const QUEUE_SAMPLE_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000

export async function recordRankedQueueSize(
  database: D1Database,
  queueKey: string,
  queuedPlayers: number,
  sampledAt = Date.now()
): Promise<void> {
  if (!Number.isSafeInteger(queuedPlayers) || queuedPlayers < 0) {
    throw new Error('The ranked queue size is invalid.')
  }

  await database.batch([
    database
      .prepare(
        `INSERT INTO ranked_queue_samples
           (queue_key, sampled_at, queued_players)
         VALUES (?, ?, ?)
         ON CONFLICT (queue_key, sampled_at)
         DO UPDATE SET queued_players = excluded.queued_players`
      )
      .bind(queueKey, sampledAt, queuedPlayers),
    database
      .prepare(
        `DELETE FROM ranked_queue_samples
         WHERE queue_key = ? AND sampled_at < ?`
      )
      .bind(queueKey, sampledAt - QUEUE_SAMPLE_RETENTION_MS)
  ])
}
