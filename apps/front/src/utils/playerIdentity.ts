import {
  type PlayerCredentials,
  playerCredentialsSchema
} from '@knucklebones/common'
import { createPlayer } from './api'
import {
  getStoredDeviceCredential,
  getStoredDisplayName,
  getStoredPlayerId,
  storeDisplayName,
  storeIdentity,
  storePendingRecoveryPhrase
} from './identityStorage'
import { randomName } from './name'

export {
  confirmRecoveryPhrase,
  getPendingRecoveryPhrase,
  storePendingRecoveryPhrase
} from './identityStorage'

export function getStoredPlayerCredentials(): PlayerCredentials | undefined {
  const result = playerCredentialsSchema.safeParse({
    playerId: getStoredPlayerId(),
    credential: getStoredDeviceCredential()
  })
  return result.success ? result.data : undefined
}

export function storePlayerCredentials(credentials: PlayerCredentials): void {
  storeIdentity(credentials.playerId, credentials.credential)
}

export async function ensurePlayerIdentity(): Promise<PlayerCredentials> {
  const storedCredentials = getStoredPlayerCredentials()
  if (storedCredentials !== undefined) {
    ensurePlayerDisplayName()
    return storedCredentials
  }

  const credentials = await createPlayer()
  storePlayerCredentials(credentials)
  storePendingRecoveryPhrase(credentials.recoveryPhrase)
  ensurePlayerDisplayName()
  return credentials
}

function ensurePlayerDisplayName(): void {
  if (getStoredDisplayName() === null) {
    storeDisplayName(randomName())
  }
}
