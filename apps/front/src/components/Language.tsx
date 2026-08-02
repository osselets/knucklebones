import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { GlobeAltIcon } from '@heroicons/react/24/outline'
import { getPathWithoutLanguage, supportedLanguages } from '../translations'
import { Button } from './Button'

function getNextLanguagePath(currentLanguage: string, pathname: string) {
  const currentIndex = supportedLanguages.findIndex(({ value }) =>
    currentLanguage.startsWith(value)
  )
  const nextLang =
    supportedLanguages[(currentIndex + 1) % supportedLanguages.length].value
  return `/${nextLang}${getPathWithoutLanguage(pathname)}`
}

// https://ui.shadcn.com/docs/components/select ?
export function Language() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const nextLanguagePath = getNextLanguagePath(i18n.language, pathname)

  return (
    <Button
      as='a'
      href={nextLanguagePath}
      leftIcon={<GlobeAltIcon />}
      variant='ghost'
      center={false}
    >
      {t('language')}
    </Button>
  )
}
