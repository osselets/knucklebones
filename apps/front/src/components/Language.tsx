import type * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { GlobeAltIcon } from '@heroicons/react/24/outline'
import { getPathWithoutLanguage, supportedLanguages } from '../translations'
import { Button } from './Button'

function getNextLanguage(currentLanguage: string) {
  const currentIndex = supportedLanguages.findIndex(({ value }) =>
    currentLanguage.startsWith(value)
  )
  return supportedLanguages[(currentIndex + 1) % supportedLanguages.length]
    .value
}

// https://ui.shadcn.com/docs/components/select ?
export function Language() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const nextLanguage = getNextLanguage(i18n.language)
  const nextLanguagePath = `/${nextLanguage}${getPathWithoutLanguage(pathname)}`

  function changeLanguage(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    event.preventDefault()
    document.documentElement.lang = nextLanguage
    void i18n.changeLanguage(nextLanguage)
    void navigate(nextLanguagePath)
  }

  return (
    <Button
      as='a'
      href={nextLanguagePath}
      onClick={changeLanguage}
      leftIcon={<GlobeAltIcon />}
      variant='ghost'
      center={false}
    >
      {t('language')}
    </Button>
  )
}
