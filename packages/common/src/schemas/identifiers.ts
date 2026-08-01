import { z } from 'zod/mini'
import { AI_PLAYER_ID } from '../types'

export const roomKeySchema = z.uuidv4()
export const playerIdSchema = z.uuidv4()
export const gamePlayerIdSchema = z.union([
  playerIdSchema,
  z.literal(AI_PLAYER_ID)
])
export const matchIdSchema = z.uuidv4()
export const mutationIdSchema = z.uuidv4()
export const requestIdSchema = z.uuidv4()
export const credentialSchema = z
  .string()
  .check(z.length(64), z.regex(/^[0-9a-f]+$/))

export const displayNameSchema = z
  .string()
  .check(z.minLength(1), z.maxLength(64), z.regex(/\S/u))
