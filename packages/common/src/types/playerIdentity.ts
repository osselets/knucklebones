export const AI_PLAYER_ID = 'beep-boop'

export interface PlayerCredentials {
  playerId: string
  credential: string
}

export interface WebSocketTicket {
  ticket: string
  expiresAt: number
}
