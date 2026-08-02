import { useTranslation } from 'react-i18next'
import { GlobeAltIcon } from '@heroicons/react/24/outline'
import { getPathWithoutLanguage, supportedLanguages } from '../translations'
import { Button } from './Button'

function getNextLanguagePath(currentLanguage: string) {
  const currentIndex = supportedLanguages.findIndex(({ value }) =>
    currentLanguage.startsWith(value)
  )
  const nextLang =
    supportedLanguages[(currentIndex + 1) % supportedLanguages.length].value
  return `/${nextLang}${getPathWithoutLanguage()}`
}

// https://ui.shadcn.com/docs/components/select ?
export function Language() {
  const { t, i18n } = useTranslation()
  const nextLanguagePath = getNextLanguagePath(i18n.language)

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
