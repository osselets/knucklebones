import { z } from 'zod/mini'
import { type PlayerCredentials, type WebSocketTicket } from '../types'
import { credentialSchema, playerIdSchema } from './identifiers'

export const playerCredentialsSchema = z.object({
  playerId: playerIdSchema,
  credential: credentialSchema
}) satisfies z.ZodMiniType<PlayerCredentials>

export const webSocketTicketSchema = z.object({
  ticket: credentialSchema,
  expiresAt: z.int().check(z.minimum(0))
}) satisfies z.ZodMiniType<WebSocketTicket>
