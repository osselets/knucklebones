import { t } from 'i18next'
import {
  type GameMode,
  type BoType,
  type Difficulty
} from '@knucklebones/common'
import { type Option } from '../ToggleGroup'

export function getGameModeOptions(): Array<Option<GameMode>> {
  return [
    {
      value: 'classic',
      label: t('game-settings.game-mode.classic')
    },
    {
      value: 'dice-pool',
      label: t('game-settings.game-mode.dice-pool')
    }
  ]
}

export function getDifficultyOptions(): Array<Option<Difficulty>> {
  return [
    {
      value: 'easy',
      label: t('game-settings.difficulty.easy')
    },
    {
      value: 'medium',
      label: t('game-settings.difficulty.medium')
    },
    {
      value: 'hard',
      label: t('game-settings.difficulty.hard')
    }
  ]
}

export type StringBoType = `${BoType}`
export function getBoTypeOptions(): Array<Option<StringBoType>> {
  return [
    {
      value: 'indefinite',
      label: t('game-settings.games.indefinite')
    },
    {
      value: '1',
      label: t('game-settings.games.1')
    },
    {
      value: '3',
      label: t('game-settings.games.3')
    },
    {
      value: '5',
      label: t('game-settings.games.5')
    }
  ]
}

export function convertToBoType(boType: string) {
  if (boType === 'indefinite') {
    return boType satisfies BoType
  }
  const parsed = Number(boType)
  // .includes ?
  if (parsed === 1 || parsed === 3 || parsed === 5) {
    return parsed satisfies BoType
  }
  throw new Error(`Unknown boType: ${boType}`)
}
