import { t } from 'i18next'
import {
  isEmptyOrBlank,
  type IPlayer,
  type Difficulty
} from '@knucklebones/common'

export const MAX_NAME_LENGTH = 21

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
