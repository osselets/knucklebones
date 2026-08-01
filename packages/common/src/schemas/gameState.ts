import { z } from 'zod/mini'
import { type IGameState, type ILog, type IPlayer } from '../interfaces'
import {
  type BoType,
  type Difficulty,
  type GameFinishReason,
  type Outcome,
  type OutcomeHistoryEntry,
  type PlayerOutcome
} from '../types'

const playerIdSchema = z.string().check(z.minLength(1))
const diceSchema = z.int().check(z.minimum(1), z.maximum(6))
const columnSchema = z.array(diceSchema).check(z.maxLength(3))

export const difficultySchema = z.enum([
  'easy',
  'medium',
  'hard'
]) satisfies z.ZodMiniType<Difficulty>

export const boTypeSchema = z.union([
  z.literal('indefinite'),
  z.literal(1),
  z.literal(3),
  z.literal(5)
]) satisfies z.ZodMiniType<BoType>

export const outcomeSchema = z.enum([
  'ongoing',
  'round-ended',
  'game-ended'
]) satisfies z.ZodMiniType<Outcome>

export const gameFinishReasonSchema = z.enum([
  'completed',
  'forfeit',
  'no-contest'
]) satisfies z.ZodMiniType<GameFinishReason>

export const logSchema = z.object({
  content: z.string(),
  timestamp: z.int().check(z.minimum(0))
}) satisfies z.ZodMiniType<ILog>

export const playerSchema = z.object({
  id: playerIdSchema,
  // Legacy rooms allowed arbitrary display names. New writes are constrained
  // at the HTTP boundary while persisted snapshots remain readable.
  displayName: z.optional(z.string()),
  difficulty: z.optional(difficultySchema),
  dice: z.optional(diceSchema),
  columns: z.tuple([columnSchema, columnSchema, columnSchema]),
  score: z.number().check(z.minimum(0)),
  scorePerColumn: z.tuple([
    z.number().check(z.minimum(0)),
    z.number().check(z.minimum(0)),
    z.number().check(z.minimum(0))
  ])
}) satisfies z.ZodMiniType<IPlayer>

const playerOutcomeSchema = z.object({
  id: playerIdSchema,
  score: z.number().check(z.minimum(0))
}) satisfies z.ZodMiniType<PlayerOutcome>

const outcomeHistoryEntrySchema = z.object({
  playerOne: playerOutcomeSchema,
  playerTwo: playerOutcomeSchema
}) satisfies z.ZodMiniType<OutcomeHistoryEntry>

export const lobbySchema = z.object({
  players: z.array(playerSchema).check(z.maxLength(2)),
  boType: z.optional(boTypeSchema)
})

export const gameStateSchema = z.object({
  revision: z._default(z.int().check(z.minimum(0)), 0),
  playerOne: playerSchema,
  playerTwo: playerSchema,
  spectators: z.array(playerIdSchema),
  logs: z.array(logSchema),
  nextPlayer: playerSchema,
  boType: boTypeSchema,
  winnerId: z.optional(playerIdSchema),
  outcome: outcomeSchema,
  finishReason: z.optional(gameFinishReasonSchema),
  outcomeHistory: z.array(outcomeHistoryEntrySchema),
  rematchVote: z.optional(playerIdSchema)
}) satisfies z.ZodMiniType<IGameState>
