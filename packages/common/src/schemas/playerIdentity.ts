import { z } from 'zod/mini'
import { type PlayerCredentials, type WebSocketTicket } from '../types'
import {
  credentialIdSchema,
  credentialSchema,
  playerCredentialSchema,
  playerIdSchema
} from './identifiers'

export const playerCredentialsSchema = z.object({
  playerId: playerIdSchema,
  credential: playerCredentialSchema
}) satisfies z.ZodMiniType<PlayerCredentials>

export const webSocketTicketSchema = z.object({
  ticket: credentialSchema,
  expiresAt: z.int().check(z.minimum(0))
}) satisfies z.ZodMiniType<WebSocketTicket>

export const deviceCredentialSummarySchema = z.object({
  credentialId: credentialIdSchema,
  createdAt: z.int().check(z.minimum(0)),
  current: z.boolean()
})

export const deviceCredentialListSchema = z.array(deviceCredentialSummarySchema)
