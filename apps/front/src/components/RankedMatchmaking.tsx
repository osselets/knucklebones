import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  type MatchmakingStatus,
  type RankedProfile
} from '@knucklebones/common'
import {
  getMatchmakingStatus,
  getRankedProfile,
  joinMatchmaking,
  leaveMatchmaking
} from '../utils/api'
import { storeRankedMatchAssignment } from '../utils/rankedMatchStorage'
import { Button } from './Button'

const MATCHMAKING_POLL_MS = 500
const MATCHMAKING_RETRY_MS = 1_000

export function RankedMatchmaking() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [profile, setProfile] = React.useState<RankedProfile>()
  const [joinedAt, setJoinedAt] = React.useState<number>()
  const [now, setNow] = React.useState(Date.now)
  const [errorMessage, setErrorMessage] = React.useState<string>()
  const [isCancelling, setIsCancelling] = React.useState(false)

  React.useEffect(() => {
    let disposed = false
    let pollTimeout: ReturnType<typeof setTimeout> | undefined
    const clockInterval = setInterval(() => setNow(Date.now()), 1_000)

    const handleStatus = (status: MatchmakingStatus): boolean => {
      if (status.status === 'matched') {
        storeRankedMatchAssignment(status.match)
        navigate(`/room/${status.match.roomKey}`, {
          replace: true,
          state: { playerType: 'human', boType: 1 }
        })
        return true
      }
      if (status.status === 'waiting') {
        setJoinedAt(status.joinedAt)
        setErrorMessage(undefined)
      }
      return false
    }

    const schedulePoll = (delay: number) => {
      pollTimeout = setTimeout(() => void poll(), delay)
    }

    const poll = async () => {
      if (disposed) {
        return
      }
      try {
        let status = await getMatchmakingStatus()
        if (status.status === 'idle') {
          status = await joinMatchmaking()
        }
        if (!disposed && !handleStatus(status)) {
          schedulePoll(MATCHMAKING_POLL_MS)
        }
      } catch {
        if (!disposed) {
          setErrorMessage(t('ranked.queue.connection-error'))
          schedulePoll(MATCHMAKING_RETRY_MS)
        }
      }
    }

    const start = async () => {
      try {
        const [nextProfile, status] = await Promise.all([
          getRankedProfile(),
          joinMatchmaking()
        ])
        if (disposed) {
          return
        }
        setProfile(nextProfile)
        if (!handleStatus(status)) {
          schedulePoll(MATCHMAKING_POLL_MS)
        }
      } catch {
        if (!disposed) {
          setErrorMessage(t('ranked.queue.join-error'))
          schedulePoll(MATCHMAKING_RETRY_MS)
        }
      }
    }

    void start()
    return () => {
      disposed = true
      clearInterval(clockInterval)
      clearTimeout(pollTimeout)
    }
  }, [navigate, t])

  const elapsedSeconds =
    joinedAt === undefined
      ? 0
      : Math.max(0, Math.floor((now - joinedAt) / 1000))

  async function cancelMatchmaking() {
    setIsCancelling(true)
    try {
      await leaveMatchmaking()
      navigate('/', { replace: true })
    } catch {
      setErrorMessage(t('ranked.queue.cancel-error'))
      setIsCancelling(false)
    }
  }

  return (
    <main className='mx-auto flex w-full max-w-xl flex-col items-center justify-center gap-6 p-6 text-center'>
      <h1 className='font-mona text-4xl font-bold'>
        {t('ranked.queue.title')}
      </h1>
      <p>{t('ranked.identity-warning')}</p>
      <div className='grid w-full gap-3 rounded-lg border-2 border-slate-300 p-6 dark:border-slate-600'>
        <p className='text-xl font-semibold'>
          {profile === undefined
            ? t('ranked.rating-loading')
            : t('ranked.rating', { rating: profile.rating })}
        </p>
        <p aria-live='polite' className='text-lg'>
          {joinedAt === undefined
            ? t('ranked.queue.joining')
            : t('ranked.queue.waiting', { seconds: elapsedSeconds })}
        </p>
        <p className='text-sm text-slate-600 dark:text-slate-300'>
          {t('ranked.queue.best-effort')}
        </p>
      </div>
      {errorMessage !== undefined && (
        <p role='alert' className='text-red-700 dark:text-red-400'>
          {errorMessage}
        </p>
      )}
      <Button
        size='medium'
        variant='secondary'
        disabled={isCancelling}
        onClick={() => void cancelMatchmaking()}
      >
        {t(isCancelling ? 'ranked.queue.cancelling' : 'ranked.queue.cancel')}
      </Button>
    </main>
  )
}
