export const AI_PLAYER_ID = 'beep-boop'

export interface PlayerCredentials {
  playerId: string
  credential: string
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
