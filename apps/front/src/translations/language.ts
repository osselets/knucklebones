import { isLanguageSupported } from './resources'

// Supports both language only and language + region (e.g. `en` and `en-US`)
const LANGUAGE_REGEX = /^\/(\w{2}(?:-\w{2})?)\//i
const PATH_WITHOUT_LANGUAGE_REGEX = /^\/(?:\w{2}(?:-\w{2})?)(\/.*)/i

export function getPathWithoutLanguage() {
  const [, path] =
    window.location.pathname.match(PATH_WITHOUT_LANGUAGE_REGEX) ?? []
  return path ?? window.location.pathname
}

export function getPathLanguage() {
  const [, lang] = window.location.pathname.match(LANGUAGE_REGEX) ?? []
  if (lang !== undefined && isLanguageSupported(lang)) {
    return lang
  }
}
