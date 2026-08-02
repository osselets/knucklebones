import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  type MatchmakingPopulation,
  type MatchmakingStatus,
  type RankedProfile
} from '@knucklebones/common'
import { useLocalizedPath } from '../hooks/useLocalizedPath'
import {
  getMatchmakingStatus,
  getRankedProfile,
  joinMatchmaking,
  leaveMatchmaking
} from '../utils/api'
import { storeRankedMatchAssignment } from '../utils/rankedMatchStorage'
import { LoadingDots } from './Loading'

const MATCHMAKING_POLL_MS = 500
const MATCHMAKING_RETRY_MS = 1_000

export function formatMatchmakingDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }

  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function getMatchmakingDelayMessage(
  seconds: number
): 'ranked.queue.slow' | 'ranked.queue.scarce' | undefined {
  if (seconds >= 60) {
    return 'ranked.queue.scarce'
  }
  if (seconds >= 30) {
    return 'ranked.queue.slow'
  }
}

export function RankedMatchmaking() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const localizedPath = useLocalizedPath()
  const [profile, setProfile] = React.useState<RankedProfile>()
  const [joinedAt, setJoinedAt] = React.useState<number>()
  const [population, setPopulation] = React.useState<MatchmakingPopulation>()
  const [now, setNow] = React.useState(Date.now)
  const [errorMessage, setErrorMessage] = React.useState<string>()
  const shouldLeaveQueue = React.useRef(true)
  const exitCancellationTimeout = React.useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined)

  React.useEffect(() => {
    clearTimeout(exitCancellationTimeout.current)

    const leaveQueue = (keepalive: boolean) => {
      if (!shouldLeaveQueue.current) {
        return
      }

      shouldLeaveQueue.current = false
      void leaveMatchmaking({ keepalive }).catch(() => undefined)
    }
    const handlePageHide = () => leaveQueue(true)

    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      exitCancellationTimeout.current = setTimeout(() => leaveQueue(false), 0)
    }
  }, [])

  React.useEffect(() => {
    let disposed = false
    let pollTimeout: ReturnType<typeof setTimeout> | undefined
    const clockInterval = setInterval(() => setNow(Date.now()), 1_000)

    const handleStatus = (status: MatchmakingStatus): boolean => {
      if (status.status === 'matched') {
        shouldLeaveQueue.current = false
        storeRankedMatchAssignment(status.match)
        navigate(localizedPath(`/room/${status.match.roomKey}`), {
          replace: true,
          state: { playerType: 'human', boType: 1 }
        })
        return true
      }
      if (status.status === 'waiting') {
        setJoinedAt(status.joinedAt)
        setPopulation(status.population)
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
  }, [localizedPath, navigate, t])

  const elapsedSeconds =
    joinedAt === undefined
      ? 0
      : Math.max(0, Math.floor((now - joinedAt) / 1000))
  const delayMessage = getMatchmakingDelayMessage(elapsedSeconds)

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
        {joinedAt === undefined ? (
          <p className='text-lg'>{t('ranked.queue.joining')}</p>
        ) : (
          <div className='flex flex-col items-center gap-1'>
            <p className='text-lg'>
              {t('ranked.queue.looking')}
              <LoadingDots dotsShown={elapsedSeconds % 4} />
            </p>
            <p className='font-mono text-sm tabular-nums'>
              {t('ranked.queue.elapsed', {
                duration: formatMatchmakingDuration(elapsedSeconds)
              })}
            </p>
            {population !== undefined && (
              <dl className='mt-2 grid grid-cols-2 gap-6'>
                <div className='flex flex-col-reverse'>
                  <dt className='text-sm text-slate-600 dark:text-slate-300'>
                    {t('ranked.queue.in-queue')}
                  </dt>
                  <dd className='text-xl font-semibold tabular-nums'>
                    {population.queuedPlayers}
                  </dd>
                </div>
                <div className='flex flex-col-reverse'>
                  <dt className='text-sm text-slate-600 dark:text-slate-300'>
                    {t('ranked.queue.playing')}
                  </dt>
                  <dd className='text-xl font-semibold tabular-nums'>
                    {population.activePlayers}
                  </dd>
                </div>
              </dl>
            )}
            {delayMessage !== undefined && (
              <p aria-live='polite' className='mt-2 text-sm font-medium'>
                {t(delayMessage)}
              </p>
            )}
          </div>
        )}
        <p className='text-sm text-slate-600 dark:text-slate-300'>
          {t('ranked.queue.best-effort')}
        </p>
      </div>
      {errorMessage !== undefined && (
        <p role='alert' className='text-red-700 dark:text-red-400'>
          {errorMessage}
        </p>
      )}
    </main>
  )
}
