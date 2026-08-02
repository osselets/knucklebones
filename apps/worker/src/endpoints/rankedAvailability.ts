import { rankedAvailabilitySchema } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { isRankedMatchmakingEnabled } from '../utils/rankedFeature'

export function getRankedAvailability(
  _request: Request,
  cloudflareEnvironment: CloudflareEnvironment
): Response {
  return Response.json(
    rankedAvailabilitySchema.parse({
      enabled: isRankedMatchmakingEnabled(cloudflareEnvironment)
    }),
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
