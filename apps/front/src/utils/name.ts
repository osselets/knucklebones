import { t } from 'i18next'
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator
} from 'unique-names-generator'
import {
  isEmptyOrBlank,
  type IPlayer,
  type Difficulty
} from '@knucklebones/common'

const MAX_WORD_LENGTH = 7
export const MAX_NAME_LENGTH = MAX_WORD_LENGTH * 3

const shortAdjectives = adjectives.filter(
  (adjective) => adjective.length <= MAX_WORD_LENGTH
)
const shortColors = colors.filter((color) => color.length <= MAX_WORD_LENGTH)
const shortAnimals = animals.filter(
  (animal) => animal.length <= MAX_WORD_LENGTH
)

export function randomName() {
  return uniqueNamesGenerator({
    dictionaries: [shortAdjectives, shortColors, shortAnimals],
    length: 3,
    separator: '',
    style: 'capital'
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
