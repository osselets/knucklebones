import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ensurePlayerIdentity } from '../utils/playerIdentity'
import { Button } from './Button'

type IdentityStatus = 'loading' | 'ready' | 'error'

export function PlayerIdentityGate({ children }: React.PropsWithChildren) {
  const [status, setStatus] = React.useState<IdentityStatus>('loading')
  const { t } = useTranslation()

  const initializeIdentity = React.useCallback(async () => {
    setStatus('loading')

    try {
      await ensurePlayerIdentity()
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  React.useEffect(() => {
    void initializeIdentity()
  }, [initializeIdentity])

  if (status === 'loading') {
    return (
      <h2 className='text-center text-3xl font-semibold md:text-5xl'>
        {t('identity.loading')}
      </h2>
    )
  }

  if (status === 'error') {
    return (
      <div className='flex flex-col items-center gap-4 text-center'>
        <h2 className='text-2xl font-semibold md:text-4xl'>
          {t('identity.error')}
        </h2>
        <Button onClick={() => void initializeIdentity()}>
          {t('identity.retry')}
        </Button>
      </div>
    )
  }

  return children
}
