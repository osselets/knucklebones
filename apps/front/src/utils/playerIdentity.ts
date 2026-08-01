import {
  type PlayerCredentials,
  playerCredentialsSchema
} from '@knucklebones/common'
import { createPlayer } from './api'
import { randomName } from './name'

const PLAYER_ID_KEY = 'playerId'
const PLAYER_CREDENTIAL_KEY = 'playerCredential'
const DISPLAY_NAME_KEY = 'displayName'
const PENDING_RECOVERY_PHRASE_KEY =
  'knucklebones.identity.v1.pendingRecoveryPhrase'
const RECOVERY_CONFIRMED_KEY = 'knucklebones.identity.v1.recoveryConfirmed'

export function getStoredPlayerCredentials(): PlayerCredentials | undefined {
  const result = playerCredentialsSchema.safeParse({
    playerId: localStorage.getItem(PLAYER_ID_KEY),
    credential: localStorage.getItem(PLAYER_CREDENTIAL_KEY)
  })
  return result.success ? result.data : undefined
}

export function storePlayerCredentials(credentials: PlayerCredentials): void {
  localStorage.setItem(PLAYER_ID_KEY, credentials.playerId)
  localStorage.setItem(PLAYER_CREDENTIAL_KEY, credentials.credential)
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

export function getPendingRecoveryPhrase(): string | undefined {
  return localStorage.getItem(PENDING_RECOVERY_PHRASE_KEY) ?? undefined
}

export function storePendingRecoveryPhrase(recoveryPhrase: string): void {
  localStorage.setItem(PENDING_RECOVERY_PHRASE_KEY, recoveryPhrase)
  localStorage.removeItem(RECOVERY_CONFIRMED_KEY)
}

export function confirmRecoveryPhrase(): void {
  localStorage.removeItem(PENDING_RECOVERY_PHRASE_KEY)
  localStorage.setItem(RECOVERY_CONFIRMED_KEY, 'true')
}

function ensurePlayerDisplayName(): void {
  if (localStorage.getItem(DISPLAY_NAME_KEY) === null) {
    localStorage.setItem(DISPLAY_NAME_KEY, randomName())
  }
}
