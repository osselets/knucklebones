import { type BoType, type Difficulty } from '@knucklebones/common'

export interface GameSettingsQuery {
  boType?: string
  difficulty?: string
}

type ParsedGameSettingsQuery =
  | {
      success: true
      value: { boType?: BoType; difficulty?: Difficulty }
    }
  | { success: false }

export function parseGameSettingsQuery(
  query?: GameSettingsQuery
): ParsedGameSettingsQuery {
  const boType = parseBoType(query?.boType)
  const difficulty = parseDifficulty(query?.difficulty)

  if (
    (query?.boType !== undefined && boType === undefined) ||
    (query?.difficulty !== undefined && difficulty === undefined)
  ) {
    return { success: false }
  }

  return {
    success: true,
    value: {
      ...(boType !== undefined && { boType }),
      ...(difficulty !== undefined && { difficulty })
    }
  }
}

function parseBoType(value?: string): BoType | undefined {
  switch (value) {
    case undefined:
      return undefined
    case 'indefinite':
      return 'indefinite'
    case '1':
      return 1
    case '3':
      return 3
    case '5':
      return 5
    default:
      return undefined
  }
}

function parseDifficulty(value?: string): Difficulty | undefined {
  switch (value) {
    case undefined:
      return undefined
    case 'easy':
    case 'medium':
    case 'hard':
      return value
    default:
      return undefined
  }
}
