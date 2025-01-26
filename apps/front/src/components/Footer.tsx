import { Trans } from 'react-i18next'
import { CodeBracketIcon, EnvelopeIcon } from '@heroicons/react/24/outline'
import { IconWrapper } from './IconWrapper'

export function Footer() {
  return (
    <>
      <div className='whitespace-pre-line text-center text-xs'>
        <Trans i18nKey='home.footer'>
          <a
            href='https://www.cultofthelamb.com/'
            target='_blank'
            rel='noreferrer'
            className='underline hover:text-blue-600'
          >
            Cult of the Lamb
          </a>
        </Trans>
      </div>
      <div className='flex flex-row justify-center gap-4'>
        <a
          className='text-slate-900 transition-all hover:text-slate-900/80 dark:text-slate-200 dark:hover:text-slate-50/80'
          href='https://github.com/Poooel/knucklebones'
          target='_blank'
          rel='noreferrer'
        >
          <IconWrapper>
            <CodeBracketIcon />
          </IconWrapper>
        </a>
        <a
          className='text-slate-900 transition-all hover:text-slate-900/80 dark:text-slate-200 dark:hover:text-slate-50/80'
          href='mailto:contact@knucklebones.io'
          target='_blank'
          rel='noreferrer'
        >
          <IconWrapper>
            <EnvelopeIcon />
          </IconWrapper>
        </a>
      </div>
    </>
  )
}
