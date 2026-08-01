import { z } from 'zod/mini'
import {
  type IdentityTransfer,
  type PlayerCredentials,
  type RedeemIdentityTransferRequest,
  type WebSocketTicket
} from '../types'
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

export const identityTransferSchema = z.object({
  transferToken: credentialSchema,
  expiresAt: z.int().check(z.minimum(0))
}) satisfies z.ZodMiniType<IdentityTransfer>

export const redeemIdentityTransferRequestSchema = z.strictObject({
  transferToken: credentialSchema,
  revokeOtherDevices: z.optional(z.boolean())
}) satisfies z.ZodMiniType<RedeemIdentityTransferRequest>

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
