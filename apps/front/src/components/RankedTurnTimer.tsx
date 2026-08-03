import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  RANKED_TIMEOUT_FORFEIT_COUNT,
  RANKED_TURN_DURATION_MS
} from '@knucklebones/common'
import { useGame } from './GameContext'

const RADIUS = 44
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface RankedTurnTimerProps {
  playerId: string
}

export function RankedTurnTimer({ playerId }: RankedTurnTimerProps) {
  const { t } = useTranslation()
  const { nextPlayer, outcome, playerOne, rankedTurn } = useGame()
  const [now, setNow] = React.useState(Date.now)
  const expiresAt = rankedTurn?.expiresAt

  React.useEffect(() => {
    if (expiresAt === undefined || outcome !== 'ongoing') {
      return
    }

    const interval = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(interval)
  }, [expiresAt, outcome])

  if (
    rankedTurn === undefined ||
    outcome !== 'ongoing' ||
    nextPlayer.id !== playerId
  ) {
    return null
  }

  const remainingMs = Math.min(
    RANKED_TURN_DURATION_MS,
    Math.max(0, rankedTurn.expiresAt - now)
  )
  const seconds = Math.ceil(remainingMs / 1_000)
  const progress = remainingMs / RANKED_TURN_DURATION_MS
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress)
  const isPlayerOneTurn = nextPlayer.id === playerOne.id
  const timeoutCount = isPlayerOneTurn
    ? rankedTurn.playerOneTimeouts
    : rankedTurn.playerTwoTimeouts
  const isRunningLow = seconds <= 5

  return (
    <div className='grid justify-items-center gap-1 text-center'>
      <div
        role='progressbar'
        aria-label={t('ranked.turn.time-left')}
        aria-valuemin={0}
        aria-valuemax={RANKED_TURN_DURATION_MS / 1_000}
        aria-valuenow={seconds}
        className='relative size-16 md:size-20'
      >
        <svg
          aria-hidden='true'
          viewBox='0 0 100 100'
          className='size-full -rotate-90'
        >
          <circle
            cx='50'
            cy='50'
            r={RADIUS}
            fill='none'
            stroke='currentColor'
            strokeWidth='8'
            className='text-slate-200 dark:text-slate-700'
          />
          <circle
            cx='50'
            cy='50'
            r={RADIUS}
            fill='none'
            stroke='currentColor'
            strokeWidth='8'
            strokeLinecap='round'
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            className={
              isRunningLow
                ? 'text-red-600 transition-[stroke-dashoffset] duration-100 ease-linear dark:text-red-400'
                : 'text-[#372fa2] transition-[stroke-dashoffset] duration-100 ease-linear'
            }
          />
        </svg>
        <span
          className={
            isRunningLow
              ? 'absolute inset-0 grid place-items-center font-mono text-xl font-bold text-red-700 tabular-nums md:text-2xl dark:text-red-400'
              : 'absolute inset-0 grid place-items-center font-mono text-xl font-bold tabular-nums md:text-2xl'
          }
        >
          {seconds}
        </span>
      </div>
      <p className='text-xs whitespace-nowrap text-slate-600 dark:text-slate-300'>
        {t('ranked.turn.timeouts', {
          count: timeoutCount,
          maximum: RANKED_TIMEOUT_FORFEIT_COUNT
        })}
      </p>
    </div>
  )
}
