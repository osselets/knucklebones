import en from './en.json'
import fr from './fr.json'
import zh_tw from './zh-tw.json'

export const resources = {
  en: {
    translation: en
  },
  fr: {
    translation: fr
  },
  'zh-TW': {
    translation: zh_tw
  }
} as const

export const supportedLanguages = Object.entries(resources).map(
  ([lang, resource]) => ({
    value: lang.toLocaleLowerCase(),
    label: resource.translation.language
  })
)

export const DEFAULT_LANGUAGE = 'en'

export function isLanguageSupported(lang: string) {
  return supportedLanguages.some(({ value }) => lang === value)
}
