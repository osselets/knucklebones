import { useTranslation } from 'react-i18next'
import { type PlayerNameProps, getName } from '../../utils/name'

interface NameProps extends PlayerNameProps {
  isCurrentPlayer: boolean
}

export function Name({ isCurrentPlayer, ...player }: NameProps) {
  const { t } = useTranslation()
  return (
    <p className='text-center break-all'>
      {getName(player)}
      {isCurrentPlayer && ` (${t('game.you')})`}
    </p>
  )
}
