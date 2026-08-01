import { playerCredentialsSchema } from '../schemas'
import { type PlayerCredentials } from '../types'

const PLAYER_TRANSFER_CODE_PREFIX = 'knucklebones-player-v1'

export function createPlayerTransferCode({
  playerId,
  credential
}: PlayerCredentials): string {
  return `${PLAYER_TRANSFER_CODE_PREFIX}.${playerId}.${credential}`
}

export function parsePlayerTransferCode(
  transferCode: string
): PlayerCredentials | undefined {
  const parts = transferCode.trim().split('.')

  if (parts.length !== 3 || parts[0] !== PLAYER_TRANSFER_CODE_PREFIX) {
    return undefined
  }

  const result = playerCredentialsSchema.safeParse({
    playerId: parts[1],
    credential: parts[2]
  })

  return result.success ? result.data : undefined
}
