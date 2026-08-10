import { z } from 'zod/mini'
import { AI_PLAYER_ID } from '../types'

export const roomKeySchema = z.uuidv4()
export const playerIdSchema = z.uuidv4()
export const gamePlayerIdSchema = z.union([
  playerIdSchema,
  z.literal(AI_PLAYER_ID)
])
export const matchIdSchema = z.uuidv4()
export const credentialIdSchema = z.uuidv4()
export const mutationIdSchema = z.uuidv4()
export const requestIdSchema = z.uuidv4()
export const credentialSchema = z
  .string()
  .check(z.length(64), z.regex(/^[0-9a-f]+$/))

export const deviceCredentialSchema = z
  .string()
  .check(
    z.regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[0-9a-f]{64}$/
    )
  )

export const playerCredentialSchema = z.union([
  credentialSchema,
  deviceCredentialSchema
])

export const recoveryPhraseSchema = z
  .string()
  .check(z.regex(/^knucklebones-recovery-v1(?:\.[0-9a-f]{4}){8}$/i))

export const displayNameSchema = z
  .string()
  .check(z.minLength(1), z.maxLength(64), z.regex(/\S/u))
