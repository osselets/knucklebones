export const AI_PLAYER_ID = 'beep-boop'

export interface CreatePlayerRequest {
  displayName: string
}

export interface PlayerCredentials {
  playerId: string
  credential: string
}

export interface PlayerIdentityBootstrap extends PlayerCredentials {
  recoveryPhrase: string
}

export interface IdentityRecovery extends PlayerCredentials {
  recoveryPhrase: string
}

export interface IdentityRecoveryPhrase {
  recoveryPhrase: string
}

export interface RedeemIdentityRecoveryRequest {
  recoveryPhrase: string
  revokeOtherDevices?: boolean
}

export interface IdentityTransfer {
  transferToken: string
  expiresAt: number
}

export interface RedeemIdentityTransferRequest {
  transferToken: string
  revokeOtherDevices?: boolean
}

export interface WebSocketTicket {
  ticket: string
  expiresAt: number
}

export interface AuthenticatedPrincipal {
  playerId: string
  credentialId: string
}

export interface DeviceCredentialSummary {
  credentialId: string
  createdAt: number
  current: boolean
}
