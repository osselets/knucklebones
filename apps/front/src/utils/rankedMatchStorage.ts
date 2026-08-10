import {
  type RankedMatchAssignment,
  rankedMatchAssignmentSchema
} from '@knucklebones/common'

const RANKED_MATCH_STORAGE_PREFIX = 'knucklebones.ranked-match.v1.'

export function storeRankedMatchAssignment(
  assignment: RankedMatchAssignment
): void {
  const parsedAssignment = rankedMatchAssignmentSchema.parse(assignment)
  sessionStorage.setItem(
    `${RANKED_MATCH_STORAGE_PREFIX}${parsedAssignment.roomKey}`,
    JSON.stringify(parsedAssignment)
  )
}

export function getStoredRankedMatchAssignment(
  roomKey: string
): RankedMatchAssignment | undefined {
  const storedAssignment = sessionStorage.getItem(
    `${RANKED_MATCH_STORAGE_PREFIX}${roomKey}`
  )
  if (storedAssignment === null) {
    return
  }

  let storedValue: unknown
  try {
    storedValue = JSON.parse(storedAssignment)
  } catch {
    sessionStorage.removeItem(`${RANKED_MATCH_STORAGE_PREFIX}${roomKey}`)
    return
  }

  const parsedAssignment = rankedMatchAssignmentSchema.safeParse(storedValue)
  if (!parsedAssignment.success || parsedAssignment.data.roomKey !== roomKey) {
    sessionStorage.removeItem(`${RANKED_MATCH_STORAGE_PREFIX}${roomKey}`)
    return
  }
  return parsedAssignment.data
}
