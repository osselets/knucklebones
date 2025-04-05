import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import {
  type GameSettings,
  type Difficulty,
  type PlayerType,
  type GameMode
} from '@knucklebones/common'
import { Button } from '../Button'
import { Modal, type ModalProps } from '../Modal'
import { InfoPopover } from '../Popover'
import { type Option, ToggleGroup } from '../ToggleGroup'
import {
  getBoTypeOptions,
  getDifficultyOptions,
  convertToBoType,
  type StringBoType,
  getGameModeOptions
} from './options'

interface GameSettingProps<T> {
  label: string
  info?: string
  options: Array<Option<T>>
  value: T
  onValueChange(value: T): void
}

function GameSetting<T>({
  label,
  info,
  options,
  value,
  onValueChange
}: GameSettingProps<T>) {
  return (
    <div className='grid grid-cols-1 gap-2'>
      <div className='flex gap-2'>
        <label className='text-lg md:text-xl'>{label}</label>
        {info !== undefined && <InfoPopover>{info}</InfoPopover>}
      </div>
      {/* Accessibility? */}
      <ToggleGroup
        mandatory
        type='single'
        size='medium'
        options={options}
        value={String(value)}
        onValueChange={(value) => {
          onValueChange(value as T)
        }}
      />
    </div>
  )
}

interface GameSettingsProps extends ModalProps {
  playerType?: PlayerType
}

export function GameSettingsModal({
  playerType,
  ...modalProps
}: GameSettingsProps) {
  const [difficulty, setDifficulty] = React.useState<Difficulty>('medium')
  const [boType, setBoType] = React.useState<StringBoType>('indefinite')
  const [gameMode, setGameMode] = React.useState<GameMode>('classic')
  const { t } = useTranslation()

  return (
    <Modal {...modalProps}>
      <Modal.Title>{t('game-settings.title')}</Modal.Title>
      <div className='grid grid-cols-1 gap-8'>
        {playerType === 'ai' && (
          <GameSetting
            label={t('game-settings.difficulty.label')}
            value={difficulty}
            onValueChange={setDifficulty}
            options={getDifficultyOptions()}
          />
        )}
        <GameSetting
          label={t('game-settings.games.label')}
          value={boType}
          onValueChange={setBoType}
          options={getBoTypeOptions()}
        />
        <GameSetting
          label={t('game-settings.game-mode.label')}
          // Voir pour la mise en force (mode de jeu en gras)
          info={t('game-settings.game-mode.info')}
          value={gameMode}
          onValueChange={setGameMode}
          options={getGameModeOptions()}
        />
        <Button
          as={Link}
          size='medium'
          to={`/room/${uuidv4()}`}
          // Sauvegarder les paramètres dans le local storage pour les
          // prochaines parties
          state={
            {
              playerType: playerType!,
              gameMode,
              boType: convertToBoType(boType),
              difficulty: playerType === 'ai' ? difficulty : undefined
            } satisfies GameSettings
          }
        >
          {t('game-settings.start')}
        </Button>
      </div>
    </Modal>
  )
}
