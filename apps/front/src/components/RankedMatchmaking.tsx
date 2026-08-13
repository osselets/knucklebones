import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  type MatchmakingPopulation,
  type MatchmakingStatus,
  type RankedProfile
} from '@knucklebones/common'
import { useLocalizedPath } from '../hooks/useLocalizedPath'
import { useNoIndex } from '../hooks/useNoIndex'
import {
  acceptMatchmaking,
  getMatchmakingStatus,
  getRankedProfile,
  joinMatchmaking,
  leaveMatchmaking
} from '../utils/api'
import { getStoredPlayerId } from '../utils/identityStorage'
import { storeRankedMatchAssignment } from '../utils/rankedMatchStorage'
import { Button } from './Button'
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
  useNoIndex()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const localizedPath = useLocalizedPath()
  const [profile, setProfile] = React.useState<RankedProfile>()
  const [joinedAt, setJoinedAt] = React.useState<number>()
  const [population, setPopulation] = React.useState<MatchmakingPopulation>()
  const [readyCheck, setReadyCheck] =
    React.useState<Extract<MatchmakingStatus, { status: 'match-found' }>>()
  const [now, setNow] = React.useState(Date.now)
  const [errorMessage, setErrorMessage] = React.useState<string>()
  const [isAccepting, setIsAccepting] = React.useState(false)
  const [isDeclining, setIsDeclining] = React.useState(false)
  const shouldLeaveQueue = React.useRef(true)
  const hasSeenReadyCheck = React.useRef(false)
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

  const handleStatus = React.useCallback(
    (status: MatchmakingStatus): boolean => {
      if (status.status === 'matched') {
        shouldLeaveQueue.current = false
        storeRankedMatchAssignment(status.match)
        navigate(localizedPath(`/room/${status.match.roomKey}`), {
          replace: true,
          state: { playerType: 'human', boType: 1 }
        })
        return true
      }
      if (status.status === 'match-found') {
        hasSeenReadyCheck.current = true
        setReadyCheck(status)
        setErrorMessage(undefined)
      }
      if (status.status === 'waiting') {
        hasSeenReadyCheck.current = false
        setReadyCheck(undefined)
        setJoinedAt(status.joinedAt)
        setPopulation(status.population)
        setErrorMessage(undefined)
      }
      return false
    },
    [localizedPath, navigate]
  )

  React.useEffect(() => {
    let disposed = false
    let pollTimeout: ReturnType<typeof setTimeout> | undefined
    let profileRetryTimeout: ReturnType<typeof setTimeout> | undefined
    let consecutiveMatchmakingFailures = 0
    const clockInterval = setInterval(() => setNow(Date.now()), 1_000)

    const schedulePoll = (delay: number) => {
      pollTimeout = setTimeout(() => void poll(), delay)
    }

    const handleMatchmakingFailure = (message: string) => {
      consecutiveMatchmakingFailures += 1
      if (consecutiveMatchmakingFailures >= 2) {
        setErrorMessage(message)
      }
      schedulePoll(MATCHMAKING_RETRY_MS)
    }

    const loadProfile = async () => {
      try {
        const nextProfile = await getRankedProfile()
        if (!disposed) {
          setProfile(nextProfile)
        }
      } catch {
        if (!disposed) {
          profileRetryTimeout = setTimeout(
            () => void loadProfile(),
            MATCHMAKING_RETRY_MS
          )
        }
      }
    }

    const poll = async () => {
      if (disposed) {
        return
      }
      try {
        let status = await getMatchmakingStatus()
        if (status.status === 'idle') {
          if (hasSeenReadyCheck.current) {
            navigate(localizedPath('/'), { replace: true })
            return
          }
          status = await joinMatchmaking()
        }
        consecutiveMatchmakingFailures = 0
        if (!disposed && !handleStatus(status)) {
          schedulePoll(MATCHMAKING_POLL_MS)
        }
      } catch {
        if (!disposed) {
          handleMatchmakingFailure(t('ranked.queue.connection-error'))
        }
      }
    }

    const start = async () => {
      void loadProfile()
      try {
        const status = await joinMatchmaking()
        if (disposed) {
          return
        }
        consecutiveMatchmakingFailures = 0
        if (!handleStatus(status)) {
          schedulePoll(MATCHMAKING_POLL_MS)
        }
      } catch {
        if (!disposed) {
          handleMatchmakingFailure(t('ranked.queue.join-error'))
        }
      }
    }

    void start()
    return () => {
      disposed = true
      clearInterval(clockInterval)
      clearTimeout(pollTimeout)
      clearTimeout(profileRetryTimeout)
    }
  }, [handleStatus, localizedPath, navigate, t])

  const elapsedSeconds =
    joinedAt === undefined
      ? 0
      : Math.max(0, Math.floor((now - joinedAt) / 1000))
  const delayMessage = getMatchmakingDelayMessage(elapsedSeconds)
  const readyCheckSeconds =
    readyCheck === undefined
      ? 0
      : Math.max(0, Math.ceil((readyCheck.acceptBy - now) / 1_000))
  const readyCheckDuration =
    readyCheck === undefined
      ? 15
      : Math.max(
          1,
          Math.ceil((readyCheck.acceptBy - readyCheck.match.createdAt) / 1_000)
        )
  const readyCheckProgress = (readyCheckSeconds / readyCheckDuration) * 100
  const playerId = profile?.playerId ?? getStoredPlayerId()
  const playerRating =
    readyCheck === undefined || playerId === null
      ? undefined
      : playerId === readyCheck.match.playerOneId
        ? readyCheck.match.playerOneRating
        : playerId === readyCheck.match.playerTwoId
          ? readyCheck.match.playerTwoRating
          : undefined
  const opponentRating =
    readyCheck === undefined || playerId === null
      ? undefined
      : playerId === readyCheck.match.playerOneId
        ? readyCheck.match.playerTwoRating
        : playerId === readyCheck.match.playerTwoId
          ? readyCheck.match.playerOneRating
          : undefined
  const ratingDifference =
    playerRating === undefined || opponentRating === undefined
      ? undefined
      : opponentRating - playerRating

  React.useEffect(() => {
    if (
      readyCheck !== undefined &&
      !readyCheck.accepted &&
      now >= readyCheck.acceptBy
    ) {
      navigate(localizedPath('/'), { replace: true })
    }
  }, [localizedPath, navigate, now, readyCheck])

  async function acceptMatch() {
    setIsAccepting(true)
    try {
      handleStatus(await acceptMatchmaking())
    } catch {
      setErrorMessage(t('ranked.queue.accept-error'))
    } finally {
      setIsAccepting(false)
    }
  }

  async function declineMatch() {
    setIsDeclining(true)
    try {
      await leaveMatchmaking()
      shouldLeaveQueue.current = false
      navigate(localizedPath('/'), { replace: true })
    } catch {
      setErrorMessage(t('ranked.queue.decline-error'))
      setIsDeclining(false)
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
        {readyCheck !== undefined ? (
          <div className='flex flex-col items-center gap-4'>
            <p className='text-2xl font-semibold'>
              {t('ranked.queue.match-found')}
            </p>
            {opponentRating !== undefined && ratingDifference !== undefined && (
              <div className='grid gap-1'>
                <p>
                  {t('ranked.match.opponent-rating', {
                    rating: opponentRating
                  })}
                </p>
                <p className='text-sm text-slate-600 dark:text-slate-300'>
                  {t('ranked.queue.rating-difference', {
                    difference:
                      ratingDifference > 0
                        ? `+${ratingDifference}`
                        : ratingDifference
                  })}
                </p>
              </div>
            )}
            <p className='font-mono text-xl font-semibold tabular-nums'>
              {t('ranked.queue.accept-countdown', {
                seconds: readyCheckSeconds
              })}
            </p>
            <div
              className='h-3 w-full overflow-hidden rounded-full border border-[#372fa2] bg-[#372fa2]/15'
              role='progressbar'
              aria-valuemin={0}
              aria-valuemax={readyCheckDuration}
              aria-valuenow={readyCheckSeconds}
              aria-label={t('ranked.queue.accept-progress')}
            >
              <div
                className='h-full rounded-full bg-[#372fa2] transition-[width] duration-1000 ease-linear'
                style={{ width: `${readyCheckProgress}%` }}
              />
            </div>
            {readyCheck.accepted ? (
              <p className='text-lg'>
                {t('ranked.queue.waiting-for-accept')}
                <LoadingDots dotsShown={readyCheckSeconds % 4} />
              </p>
            ) : (
              <div className='flex flex-wrap justify-center gap-3'>
                <Button
                  size='medium'
                  disabled={
                    isAccepting || isDeclining || readyCheckSeconds === 0
                  }
                  onClick={() => void acceptMatch()}
                >
                  {t(
                    isAccepting
                      ? 'ranked.queue.accepting'
                      : 'ranked.queue.accept'
                  )}
                </Button>
                <Button
                  size='medium'
                  variant='secondary'
                  disabled={isAccepting || isDeclining}
                  onClick={() => void declineMatch()}
                >
                  {t(
                    isDeclining
                      ? 'ranked.queue.declining'
                      : 'ranked.queue.decline'
                  )}
                </Button>
              </div>
            )}
          </div>
        ) : joinedAt === undefined ? (
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
