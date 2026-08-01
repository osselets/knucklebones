import {
  idempotentPlayGameResultSchema,
  type PlayGameResult
} from '@knucklebones/common'
import {
  type DurableRoomRequestWithProps,
  type RequestWithMutationId
} from '../types/itty'
import { getGameStateDurableObject } from './endpoints'

export async function applyAuthoritativePlay(
  request: DurableRoomRequestWithProps & RequestWithMutationId,
  actorId: string,
  column: number,
  expectedRevision?: number
) {
  return idempotentPlayGameResultSchema.parse(
    await getGameStateDurableObject(request).play({
      mutationId: request.mutationId,
      actorId,
      column,
      expectedRevision
    })
  )
}

export function getAppliedPlayResult(
  result: Awaited<ReturnType<typeof applyAuthoritativePlay>>
): PlayGameResult | undefined {
  return result.idempotencyStatus === 'conflict' ? undefined : result.value
}
