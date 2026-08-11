import {
  type PlayerCredentials,
  playerCredentialsSchema
} from '@knucklebones/common'
import { ApiRequestError, createPlayer, verifyPlayer } from './api'
import {
  clearStoredIdentity,
  getStoredDeviceCredential,
  getStoredPlayerId,
  storeIdentity,
  storePendingRecoveryPhrase
} from './identityStorage'
import { randomName } from './name'

export {
  confirmRecoveryPhrase,
  getPendingRecoveryPhrase,
  storePendingRecoveryPhrase
} from './identityStorage'

let identityInitialization: Promise<PlayerCredentials> | undefined

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

export function ensurePlayerIdentity(): Promise<PlayerCredentials> {
  if (identityInitialization !== undefined) {
    return identityInitialization
  }

  identityInitialization = initializePlayerIdentity().finally(() => {
    identityInitialization = undefined
  })

  return identityInitialization
}

async function initializePlayerIdentity(): Promise<PlayerCredentials> {
  const storedCredentials = getStoredPlayerCredentials()
  if (storedCredentials !== undefined) {
    if (import.meta.env.DEV) {
      try {
        await verifyPlayer(storedCredentials)
      } catch (error) {
        if (!(error instanceof ApiRequestError) || error.status !== 401) {
          throw error
        }
        clearStoredIdentity()
        return await createAndStorePlayerIdentity()
      }
    }
    return storedCredentials
  }

  return await createAndStorePlayerIdentity()
}

async function createAndStorePlayerIdentity(): Promise<PlayerCredentials> {
  const credentials = await createPlayer(randomName())
  storePlayerCredentials(credentials)
  storePendingRecoveryPhrase(credentials.recoveryPhrase)
  return credentials
}
