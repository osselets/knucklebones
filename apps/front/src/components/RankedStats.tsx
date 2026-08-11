import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  type RankedStats,
  type RankedStatsTimePoint
} from '@knucklebones/common'
import { useNoIndex } from '../hooks/useNoIndex'
import { getRankedStats } from '../utils/api'

const REFRESH_INTERVAL_MS = 15_000

interface IndicatorProps {
  label: string
  value: string
}

function Indicator({ label, value }: IndicatorProps) {
  return (
    <div className='rounded-2xl border border-slate-900/10 bg-white/70 p-5 shadow-sm dark:border-slate-50/10 dark:bg-slate-800/70'>
      <dt className='text-sm font-medium text-slate-500 dark:text-slate-400'>
        {label}
      </dt>
      <dd className='mt-2 text-3xl font-bold tracking-tight'>{value}</dd>
    </div>
  )
}

interface StatsChartProps {
  data: RankedStatsTimePoint[]
  id: string
  label: string
  title: string
  formatTimestamp(timestamp: number): string
  formatValue(value: number): string
}

function StatsChart({
  data,
  id,
  label,
  title,
  formatTimestamp,
  formatValue
}: StatsChartProps) {
  return (
    <section className='rounded-2xl border border-slate-900/10 bg-white/70 p-5 shadow-sm dark:border-slate-50/10 dark:bg-slate-800/70'>
      <h2 className='mb-5 text-xl font-semibold'>{title}</h2>
      <div className='h-72 w-full' role='img' aria-label={title}>
        <ResponsiveContainer width='100%' height='100%'>
          <AreaChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
            <defs>
              <linearGradient id={`${id}-fill`} x1='0' y1='0' x2='0' y2='1'>
                <stop offset='5%' stopColor='#6366f1' stopOpacity={0.35} />
                <stop offset='95%' stopColor='#6366f1' stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray='3 3'
              stroke='#94a3b8'
              opacity={0.25}
            />
            <XAxis
              dataKey='timestamp'
              minTickGap={32}
              stroke='#64748b'
              tickFormatter={formatTimestamp}
            />
            <YAxis allowDecimals={false} stroke='#64748b' width={42} />
            <Tooltip
              labelFormatter={(timestamp) => formatTimestamp(Number(timestamp))}
              formatter={(value) => [formatValue(Number(value)), label]}
              contentStyle={{
                backgroundColor: '#0f172a',
                border: 'none',
                borderRadius: '0.75rem',
                color: '#f8fafc'
              }}
            />
            <Area
              dataKey='value'
              fill={`url(#${id}-fill)`}
              stroke='#6366f1'
              strokeWidth={3}
              type='stepAfter'
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export function RankedStatsPage() {
  const { t, i18n } = useTranslation()
  const [stats, setStats] = React.useState<RankedStats>()
  const [hasError, setHasError] = React.useState(false)
  useNoIndex()

  React.useEffect(() => {
    let disposed = false

    const loadStats = async () => {
      try {
        const nextStats = await getRankedStats()
        if (!disposed) {
          setStats(nextStats)
          setHasError(false)
        }
      } catch {
        if (!disposed) {
          setHasError(true)
        }
      }
    }

    void loadStats()
    const refreshInterval = setInterval(
      () => void loadStats(),
      REFRESH_INTERVAL_MS
    )
    return () => {
      disposed = true
      clearInterval(refreshInterval)
    }
  }, [])

  const numberFormatter = React.useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language]
  )
  const playerDateFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric'
      }),
    [i18n.language]
  )
  const queueTimeFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit'
      }),
    [i18n.language]
  )

  if (stats === undefined) {
    return (
      <div className='flex min-h-96 items-center justify-center px-4'>
        <p className='text-xl font-medium' aria-live='polite'>
          {hasError ? t('ranked.stats.error') : t('ranked.stats.loading')}
        </p>
      </div>
    )
  }

  const indicators = [
    ['players', stats.totals.players],
    ['matches', stats.totals.matches],
    ['wins', stats.totals.wins],
    ['draws', stats.totals.draws],
    ['losses', stats.totals.losses],
    ['forfeits', stats.totals.forfeits],
    ['no-contests', stats.totals.noContests],
    ['average-elo-gain', stats.totals.averageEloGain],
    ['active-players', stats.current.activePlayers],
    ['queued-players', stats.current.queuedPlayers]
  ] as const

  return (
    <main className='container mx-auto max-w-7xl px-4 py-8 md:px-6'>
      <div className='mb-8'>
        <h1 className='font-mona text-4xl font-bold tracking-tight md:text-6xl'>
          {t('ranked.stats.title')}
        </h1>
        <p className='mt-2 text-slate-600 dark:text-slate-300'>
          {t('ranked.stats.subtitle')}
        </p>
        <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>
          {t('ranked.stats.updated', {
            time: new Intl.DateTimeFormat(i18n.language, {
              dateStyle: 'medium',
              timeStyle: 'medium'
            }).format(stats.generatedAt)
          })}
        </p>
        {hasError && (
          <p
            className='mt-2 text-sm text-red-600 dark:text-red-400'
            aria-live='polite'
          >
            {t('ranked.stats.refresh-error')}
          </p>
        )}
      </div>

      <dl className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {indicators.map(([key, value]) => (
          <Indicator
            key={key}
            label={t(`ranked.stats.indicators.${key}`)}
            value={
              key === 'average-elo-gain'
                ? numberFormatter.format(Math.round(value * 10) / 10)
                : numberFormatter.format(value)
            }
          />
        ))}
      </dl>

      <div className='mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2'>
        <StatsChart
          data={stats.history.players}
          id='ranked-players'
          label={t('ranked.stats.graphs.players-value')}
          title={t('ranked.stats.graphs.players')}
          formatTimestamp={(timestamp) => playerDateFormatter.format(timestamp)}
          formatValue={(value) => numberFormatter.format(value)}
        />
        <StatsChart
          data={stats.history.queue}
          id='ranked-queue'
          label={t('ranked.stats.graphs.queue-value')}
          title={t('ranked.stats.graphs.queue')}
          formatTimestamp={(timestamp) => queueTimeFormatter.format(timestamp)}
          formatValue={(value) => numberFormatter.format(value)}
        />
      </div>
    </main>
  )
}
