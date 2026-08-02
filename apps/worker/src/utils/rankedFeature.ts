import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'

export function isRankedMatchmakingEnabled(
  cloudflareEnvironment: CloudflareEnvironment
): boolean {
  return cloudflareEnvironment.RANKED_MATCHMAKING_ENABLED === 'true'
}
