import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Dice } from './Dice'
import { useGame } from './GameContext'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

export function GameMode() {
  const { gameMode } = useGame()
  const { t } = useTranslation()

  return (
    <Popover>
      <PopoverTrigger>
        {/* Va falloir adapter Button et IconButton pour passer des refs
        Malheureusement c'est pas super compatible avec les composants
        polymorphiques, mais en même temps, on en a pas tellement besoin ici */}
        <Button
          variant='ghost'
          leftIcon={<Dice value={5} variant='outline' size='small' />}
        >
          {t('game-settings.game-mode.label')} :{' '}
          {t(`game-settings.game-mode.${gameMode}`)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='whitespace-pre-line'>
        {t(`game-settings.game-mode.info`)}
      </PopoverContent>
    </Popover>
  )
}
