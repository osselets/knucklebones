import {
  type PlayerCredentials,
  playerCredentialsSchema
} from '@knucklebones/common'
import { createPlayer } from './api'

const PLAYER_ID_KEY = 'playerId'
const PLAYER_CREDENTIAL_KEY = 'playerCredential'

export function getStoredPlayerCredentials(): PlayerCredentials | undefined {
  const result = playerCredentialsSchema.safeParse({
    playerId: localStorage.getItem(PLAYER_ID_KEY),
    credential: localStorage.getItem(PLAYER_CREDENTIAL_KEY)
  })
  return result.success ? result.data : undefined
}

export async function ensurePlayerIdentity(): Promise<PlayerCredentials> {
  const storedCredentials = getStoredPlayerCredentials()
  if (storedCredentials !== undefined) {
    return storedCredentials
  }

  const credentials = await createPlayer()
  localStorage.setItem(PLAYER_ID_KEY, credentials.playerId)
  localStorage.setItem(PLAYER_CREDENTIAL_KEY, credentials.credential)
  return credentials
}
