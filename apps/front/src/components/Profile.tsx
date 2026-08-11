import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { type RankedProfile } from '@knucklebones/common'
import { useNoIndex } from '../hooks/useNoIndex'
import { getRankedProfile, updateRankedProfile } from '../utils/api'
import { MAX_NAME_LENGTH } from '../utils/name'
import { ensurePlayerIdentity } from '../utils/playerIdentity'
import { Button } from './Button'

interface StatisticProps {
  label: string
  value: string
}

function Statistic({ label, value }: StatisticProps) {
  return (
    <div className='rounded-2xl border border-slate-900/10 bg-white/70 p-5 text-center shadow-sm dark:border-slate-50/10 dark:bg-slate-800/70'>
      <dt className='text-sm font-medium text-slate-500 dark:text-slate-400'>
        {label}
      </dt>
      <dd className='mt-2 text-3xl font-bold tracking-tight'>{value}</dd>
    </div>
  )
}

export function ProfilePage() {
  const { t, i18n } = useTranslation()
  const [profile, setProfile] = React.useState<RankedProfile>()
  const [displayName, setDisplayName] = React.useState('')
  const [savedDisplayName, setSavedDisplayName] = React.useState('')
  const [hasError, setHasError] = React.useState(false)
  const [saveError, setSaveError] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [loadAttempt, setLoadAttempt] = React.useState(0)
  useNoIndex()

  React.useEffect(() => {
    let disposed = false

    async function loadProfile() {
      setHasError(false)
      try {
        await ensurePlayerIdentity()
        const nextProfile = await getRankedProfile()
        if (!disposed) {
          setProfile(nextProfile)
          setDisplayName(nextProfile.displayName)
          setSavedDisplayName(nextProfile.displayName)
        }
      } catch {
        if (!disposed) {
          setHasError(true)
        }
      }
    }

    void loadProfile()
    return () => {
      disposed = true
    }
  }, [loadAttempt])

  async function saveName(event: React.FormEvent) {
    event.preventDefault()
    const nextDisplayName = displayName.trim()
    if (nextDisplayName.length === 0) {
      return
    }

    setIsSaving(true)
    setSaveError(false)
    try {
      await updateRankedProfile(nextDisplayName)
      setDisplayName(nextDisplayName)
      setSavedDisplayName(nextDisplayName)
    } catch {
      setSaveError(true)
    } finally {
      setIsSaving(false)
    }
  }

  if (profile === undefined) {
    return (
      <main className='flex min-h-96 items-center justify-center px-4'>
        {hasError ? (
          <div className='flex flex-col items-center gap-4 text-center'>
            <p className='text-xl font-medium' role='alert'>
              {t('profile.error')}
            </p>
            <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
              {t('profile.retry')}
            </Button>
          </div>
        ) : (
          <p className='text-xl font-medium' aria-live='polite'>
            {t('profile.loading')}
          </p>
        )}
      </main>
    )
  }

  const numberFormatter = new Intl.NumberFormat(i18n.language)
  const statistics = [
    ['elo', profile.rating],
    ['wins', profile.wins],
    ['losses', profile.losses],
    ['draws', profile.draws]
  ] as const
  const isNameEmpty = displayName.trim().length === 0
  const isNameSaved = displayName === savedDisplayName

  return (
    <main className='container mx-auto max-w-3xl px-4 py-8 md:px-6'>
      <h1 className='font-mona text-center text-4xl font-bold tracking-tight md:text-6xl'>
        {t('profile.title')}
      </h1>

      <form
        className='mx-auto mt-8 max-w-xl rounded-2xl border border-slate-900/10 bg-white/70 p-5 shadow-sm dark:border-slate-50/10 dark:bg-slate-800/70'
        onSubmit={(event) => void saveName(event)}
      >
        <label htmlFor='profile-display-name' className='font-medium'>
          {t('profile.name.label')}
        </label>
        <div className='mt-2 flex flex-col gap-3 sm:flex-row'>
          <input
            id='profile-display-name'
            type='text'
            value={displayName}
            maxLength={MAX_NAME_LENGTH}
            autoComplete='nickname'
            className='min-w-0 flex-1 rounded-md border-2 border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900'
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <Button
            type='submit'
            disabled={isNameEmpty || isNameSaved || isSaving}
          >
            {t('profile.name.save')}
          </Button>
        </div>
        {saveError && (
          <p
            className='mt-2 text-sm text-red-600 dark:text-red-400'
            role='alert'
          >
            {t('profile.name.error')}
          </p>
        )}
      </form>

      <dl className='mt-8 grid grid-cols-2 gap-4'>
        {statistics.map(([key, value]) => (
          <Statistic
            key={key}
            label={t(`profile.statistics.${key}`)}
            value={numberFormatter.format(value)}
          />
        ))}
      </dl>
    </main>
  )
}
