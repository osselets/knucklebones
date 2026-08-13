import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useLocalizedPath } from '../hooks/useLocalizedPath'
import { useNoIndex } from '../hooks/useNoIndex'
import KnucklebonesLogo from '../svgs/logo.svg'
import { Button } from './Button'

export function NotFoundPage() {
  useNoIndex()
  const { t } = useTranslation()
  const localizedPath = useLocalizedPath()

  return (
    <div className='mx-4 flex flex-col items-center justify-center gap-8 text-center'>
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
      <p className='font-mona text-3xl font-bold tracking-tight md:text-5xl'>
        {t('not-found.message')}
      </p>
      <Button as={Link} size='large' to={localizedPath('/')}>
        {t('not-found.home')}
      </Button>
    </div>
  )
}
