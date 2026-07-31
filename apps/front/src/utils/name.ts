import { t } from 'i18next'
import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals
} from 'unique-names-generator'
import {
  isEmptyOrBlank,
  type IPlayer,
  type Difficulty
} from '@knucklebones/common'

// At most, we get a 21 character long name
const MAX_WORD_LENGTH = 7
export const MAX_NAME_LENGTH = MAX_WORD_LENGTH * 3

const shortAdjectives = adjectives.filter((a) => a.length <= MAX_WORD_LENGTH)
const shortColors = colors.filter((c) => c.length <= MAX_WORD_LENGTH)
const shortAnimals = animals.filter((a) => a.length <= MAX_WORD_LENGTH)

export function randomName() {
  return uniqueNamesGenerator({
    dictionaries: [shortAdjectives, shortColors, shortAnimals],
    length: 3,
    style: 'capital',
    separator: ''
  })
}

function getAiName(difficulty: Difficulty) {
  return `${t('game.ai')} (${t(`game-settings.difficulty.${difficulty}`)})`
}

export type PlayerNameProps = Pick<IPlayer, 'displayName' | 'id' | 'difficulty'>

export function getName({ difficulty, displayName, id }: PlayerNameProps) {
  if (difficulty !== undefined) {
    return getAiName(difficulty)
  }
  if (displayName === undefined || isEmptyOrBlank(displayName)) {
    return id
  } else {
    return decodeURIComponent(displayName).substring(0, MAX_NAME_LENGTH)
  }
}
