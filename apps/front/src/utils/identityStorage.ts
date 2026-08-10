const PLAYER_ID_KEY = 'knucklebones.identity.v1.playerId'
const PLAYER_CREDENTIAL_KEY = 'knucklebones.identity.v1.deviceCredential'
const DISPLAY_NAME_KEY = 'knucklebones.identity.v1.displayName'
const PENDING_RECOVERY_PHRASE_KEY =
  'knucklebones.identity.v1.pendingRecoveryPhrase'
const RECOVERY_CONFIRMED_KEY = 'knucklebones.identity.v1.recoveryConfirmed'

const LEGACY_PLAYER_ID_KEY = 'playerId'
const LEGACY_PLAYER_CREDENTIAL_KEY = 'playerCredential'
const LEGACY_DISPLAY_NAME_KEY = 'displayName'

export function migrateLegacyIdentityStorage(): void {
  migrateKey(LEGACY_PLAYER_ID_KEY, PLAYER_ID_KEY)
  migrateKey(LEGACY_PLAYER_CREDENTIAL_KEY, PLAYER_CREDENTIAL_KEY)
  migrateKey(LEGACY_DISPLAY_NAME_KEY, DISPLAY_NAME_KEY)
}

export function getStoredPlayerId(): string | null {
  migrateLegacyIdentityStorage()
  return localStorage.getItem(PLAYER_ID_KEY)
}

export function getStoredDeviceCredential(): string | null {
  migrateLegacyIdentityStorage()
  return localStorage.getItem(PLAYER_CREDENTIAL_KEY)
}

export function storeIdentity(playerId: string, credential: string): void {
  localStorage.setItem(PLAYER_ID_KEY, playerId)
  localStorage.setItem(PLAYER_CREDENTIAL_KEY, credential)
  localStorage.removeItem(LEGACY_PLAYER_ID_KEY)
  localStorage.removeItem(LEGACY_PLAYER_CREDENTIAL_KEY)
}

export function clearStoredIdentity(): void {
  localStorage.removeItem(PLAYER_ID_KEY)
  localStorage.removeItem(PLAYER_CREDENTIAL_KEY)
  localStorage.removeItem(PENDING_RECOVERY_PHRASE_KEY)
  localStorage.removeItem(RECOVERY_CONFIRMED_KEY)
  localStorage.removeItem(LEGACY_PLAYER_ID_KEY)
  localStorage.removeItem(LEGACY_PLAYER_CREDENTIAL_KEY)
}

export function getStoredDisplayName(): string | null {
  migrateLegacyIdentityStorage()
  return localStorage.getItem(DISPLAY_NAME_KEY)
}

export function storeDisplayName(displayName: string): void {
  localStorage.setItem(DISPLAY_NAME_KEY, displayName)
  localStorage.removeItem(LEGACY_DISPLAY_NAME_KEY)
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

function migrateKey(legacyKey: string, versionedKey: string): void {
  const versionedValue = localStorage.getItem(versionedKey)
  const legacyValue = localStorage.getItem(legacyKey)

  if (versionedValue === null && legacyValue !== null) {
    localStorage.setItem(versionedKey, legacyValue)
  }
  if (localStorage.getItem(versionedKey) !== null) {
    localStorage.removeItem(legacyKey)
  }
}
