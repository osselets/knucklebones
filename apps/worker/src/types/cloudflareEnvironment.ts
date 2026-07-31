export interface CloudflareEnvironment {
  GAME_STATE_DURABLE_OBJECT: DurableObjectNamespace
  WEB_SOCKET_DURABLE_OBJECT: DurableObjectNamespace
  SENTRY_DSN: string
  ENVIRONMENT: 'development' | 'staging' | 'production'
}
