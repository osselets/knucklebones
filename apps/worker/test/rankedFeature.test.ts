import { describe, expect, it } from 'vitest'
import { joinMatchmaking } from '../src/endpoints/matchmaking'
import { type CloudflareEnvironment } from '../src/types/cloudflareEnvironment'
import { type AuthenticatedRequestWithProps } from '../src/types/itty'
import { isRankedMatchmakingEnabled } from '../src/utils/rankedFeature'

describe('ranked feature availability', () => {
  it('requires an explicit true binding', () => {
    expect(
      isRankedMatchmakingEnabled({
        RANKED_MATCHMAKING_ENABLED: 'true'
      } as CloudflareEnvironment)
    ).toBe(true)
    expect(
      isRankedMatchmakingEnabled({
        RANKED_MATCHMAKING_ENABLED: 'false'
      } as CloudflareEnvironment)
    ).toBe(false)
    expect(isRankedMatchmakingEnabled({} as CloudflareEnvironment)).toBe(false)
  })

  it('rejects new queue joins while disabled', async () => {
    const request = Object.assign(
      new Request('https://api.knucklebones.io/v1/matchmaking/join', {
        method: 'POST'
      }),
      {
        principal: {
          playerId: '11111111-1111-4111-8111-111111111111',
          credentialId: '22222222-2222-4222-8222-222222222222'
        },
        requestId: '33333333-3333-4333-8333-333333333333'
      }
    ) as Request & AuthenticatedRequestWithProps

    const response = await joinMatchmaking(request, {
      RANKED_MATCHMAKING_ENABLED: 'false'
    } as CloudflareEnvironment)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'RANKED_MATCHMAKING_DISABLED', retryable: false }
    })
  })
})
