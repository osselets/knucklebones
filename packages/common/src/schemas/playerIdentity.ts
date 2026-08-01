import { z } from 'zod/mini'
import { type PlayerCredentials, type WebSocketTicket } from '../types'

export const playerCredentialsSchema = z.object({
  playerId: z.uuidv4(),
  credential: z.string().check(z.length(64), z.regex(/^[0-9a-f]+$/))
}) satisfies z.ZodMiniType<PlayerCredentials>

export const webSocketTicketSchema = z.object({
  ticket: z.string().check(z.length(64), z.regex(/^[0-9a-f]+$/)),
  expiresAt: z.number()
}) satisfies z.ZodMiniType<WebSocketTicket>
