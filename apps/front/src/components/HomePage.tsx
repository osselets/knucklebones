import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { UserCircleIcon } from '@heroicons/react/24/outline'
import { type PlayerType } from '@knucklebones/common'
import { useLocalizedPath } from '../hooks/useLocalizedPath'
import KnucklebonesLogo from '../svgs/logo.svg'
import { ensurePlayerIdentity } from '../utils/playerIdentity'
import { Button } from './Button'
import { Footer } from './Footer'
import { GameSettingsModal } from './GameSettings'

export function HomePage() {
  const [playerType, setPlayerType] = React.useState<PlayerType>()
  const [isEditingGameSettings, setEditingGameSettings] = React.useState(false)
  const { t } = useTranslation()
  const localizedPath = useLocalizedPath()

  React.useEffect(() => {
    void ensurePlayerIdentity()
  }, [])

  function openGameSettings(playerType: PlayerType) {
    setEditingGameSettings(true)
    setPlayerType(playerType)
  }

  return (
    <>
      <div className='mx-4 flex flex-col items-center justify-center gap-4 md:gap-8'>
        <div className='flex flex-row items-center gap-2 md:gap-4'>
          <img
            src={KnucklebonesLogo}
            alt='Knucklebones Logo'
            className='aspect-square h-16 md:h-32'
          />
          <h1 className='font-mona text-4xl font-bold tracking-tight md:text-8xl'>
            Knucklebones
          </h1>
        </div>
        <div className='flex flex-col gap-4 md:gap-8'>
          <Button as={Link} size='large' to={localizedPath('/ranked')}>
            {t('home.play.ranked')}
          </Button>
          <Button
            size='large'
            onClick={() => {
              openGameSettings('human')
            }}
          >
            {t('home.play.friend')}
          </Button>
          <Button
            size='large'
            onClick={() => {
              openGameSettings('ai')
            }}
          >
            {t('home.play.ai')}
          </Button>
          <Button as={Link} size='large' to={localizedPath('/how-to-play')}>
            {t('guide.label')}
          </Button>
          <Button
            as={Link}
            size='large'
            to={localizedPath('/profile')}
            aria-label={t('profile.label')}
            title={t('profile.label')}
          >
            <UserCircleIcon className='h-8 w-8 md:h-10 md:w-10' />
          </Button>
        </div>
        <div className='absolute bottom-0 flex flex-col gap-2 p-2'>
          <Footer />
        </div>
      </div>
      <div className='fixed'>
        <GameSettingsModal
          isOpen={isEditingGameSettings}
          playerType={playerType}
          onClose={() => {
            setEditingGameSettings(false)
          }}
          onAfterClose={() => {
            setPlayerType(undefined)
          }}
        />
      </div>
    </>
  )
}
