import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { type RankedLeaderboardEntry } from '@knucklebones/common'
import { useNoIndex } from '../hooks/useNoIndex'
import { getRankedLeaderboard } from '../utils/api'
import { Button } from './Button'

interface PodiumPlaceProps {
  player: RankedLeaderboardEntry
  formatNumber(value: number): string
}

function PodiumPlace({ player, formatNumber }: PodiumPlaceProps) {
  const height =
    player.rank === 1 ? 'h-48 md:h-56' : player.rank === 2 ? 'h-40' : 'h-32'
  const color =
    player.rank === 1
      ? 'bg-amber-300 dark:bg-amber-500'
      : player.rank === 2
        ? 'bg-slate-300 dark:bg-slate-500'
        : 'bg-orange-300 dark:bg-orange-700'

  return (
    <article
      className={`${height} ${color} flex min-w-0 flex-col items-center justify-start rounded-t-2xl px-2 py-4 text-center text-slate-900 shadow-md`}
    >
      <span className='text-2xl font-bold'>#{player.rank}</span>
      <h2
        className='mt-2 w-full truncate font-semibold'
        title={player.displayName}
      >
        {player.displayName}
      </h2>
      <p className='mt-1 text-sm font-medium'>
        {formatNumber(player.rating)} Elo
      </p>
    </article>
  )
}

export function LeaderboardPage() {
  const { t, i18n } = useTranslation()
  const [leaderboard, setLeaderboard] =
    React.useState<Awaited<ReturnType<typeof getRankedLeaderboard>>>()
  const [hasError, setHasError] = React.useState(false)
  const [loadAttempt, setLoadAttempt] = React.useState(0)
  useNoIndex()

  React.useEffect(() => {
    let disposed = false

    async function loadLeaderboard() {
      setHasError(false)
      try {
        const nextLeaderboard = await getRankedLeaderboard()
        if (!disposed) {
          setLeaderboard(nextLeaderboard)
        }
      } catch {
        if (!disposed) {
          setHasError(true)
        }
      }
    }

    void loadLeaderboard()
    return () => {
      disposed = true
    }
  }, [loadAttempt])

  if (leaderboard === undefined) {
    return (
      <main className='flex min-h-96 items-center justify-center px-4'>
        {hasError ? (
          <div className='flex flex-col items-center gap-4 text-center'>
            <p className='text-xl font-medium' role='alert'>
              {t('leaderboard.error')}
            </p>
            <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
              {t('leaderboard.retry')}
            </Button>
          </div>
        ) : (
          <p className='text-xl font-medium' aria-live='polite'>
            {t('leaderboard.loading')}
          </p>
        )}
      </main>
    )
  }

  const numberFormatter = new Intl.NumberFormat(i18n.language)
  const formatNumber = (value: number) => numberFormatter.format(value)
  const podiumPlayers = [
    leaderboard.topPlayers[1],
    leaderboard.topPlayers[0],
    leaderboard.topPlayers[2]
  ]

  return (
    <main className='container mx-auto max-w-4xl px-4 py-8 md:px-6'>
      <h1 className='font-mona text-center text-4xl font-bold tracking-tight md:text-6xl'>
        {t('leaderboard.title')}
      </h1>

      {leaderboard.topPlayers.length === 0 ? (
        <p className='mt-12 text-center text-xl'>{t('leaderboard.empty')}</p>
      ) : (
        <>
          <section
            className='mx-auto mt-10 grid max-w-2xl grid-cols-3 items-end gap-2 md:gap-4'
            aria-label={t('leaderboard.podium')}
          >
            {podiumPlayers.map((player, index) =>
              player === undefined ? (
                <div key={index} />
              ) : (
                <PodiumPlace
                  key={player.playerId}
                  player={player}
                  formatNumber={formatNumber}
                />
              )
            )}
          </section>

          <div className='mt-10 overflow-hidden rounded-2xl border border-slate-900/10 bg-white/70 shadow-sm dark:border-slate-50/10 dark:bg-slate-800/70'>
            <table className='w-full table-fixed'>
              <thead className='bg-slate-200/70 text-left dark:bg-slate-700/70'>
                <tr>
                  <th className='w-20 px-4 py-3'>{t('leaderboard.rank')}</th>
                  <th className='px-4 py-3'>{t('leaderboard.player')}</th>
                  <th className='w-28 px-4 py-3 text-right'>
                    {t('leaderboard.elo')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.topPlayers.map((player) => {
                  const isCurrentPlayer =
                    player.playerId === leaderboard.currentPlayer.playerId
                  return (
                    <tr
                      key={player.playerId}
                      className={
                        isCurrentPlayer
                          ? 'bg-indigo-100 font-semibold dark:bg-indigo-950'
                          : 'border-t border-slate-900/10 dark:border-slate-50/10'
                      }
                    >
                      <td className='px-4 py-3'>#{player.rank}</td>
                      <td
                        className='truncate px-4 py-3'
                        title={player.displayName}
                      >
                        {player.displayName}
                      </td>
                      <td className='px-4 py-3 text-right'>
                        {formatNumber(player.rating)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <section className='mt-8' aria-labelledby='current-player-position'>
        <h2 id='current-player-position' className='mb-3 text-xl font-semibold'>
          {t('leaderboard.your-position')}
        </h2>
        <div className='grid grid-cols-[5rem_1fr_7rem] items-center rounded-2xl border-2 border-indigo-400 bg-indigo-100 px-4 py-4 font-semibold dark:border-indigo-500 dark:bg-indigo-950'>
          <span>
            {leaderboard.currentPlayer.rank === null
              ? t('leaderboard.unranked')
              : `#${leaderboard.currentPlayer.rank}`}
          </span>
          <span
            className='truncate'
            title={leaderboard.currentPlayer.displayName}
          >
            {leaderboard.currentPlayer.displayName}
          </span>
          <span className='text-right'>
            {formatNumber(leaderboard.currentPlayer.rating)}
          </span>
        </div>
      </section>
    </main>
  )
}
