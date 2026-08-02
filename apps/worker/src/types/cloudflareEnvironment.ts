export interface CloudflareEnvironment {
  GAME_STATE_DURABLE_OBJECT: DurableObjectNamespace
  MATCHMAKING_DURABLE_OBJECT: DurableObjectNamespace
  WEB_SOCKET_DURABLE_OBJECT: DurableObjectNamespace
  PLAYERS_DB: D1Database
  SENTRY_DSN: string
  ENVIRONMENT: 'development' | 'staging' | 'production'
  RANKED_MATCHMAKING_ENABLED: 'true' | 'false'
}
