import * as React from 'react'
import { useLocation } from 'react-router-dom'
import { DEFAULT_LANGUAGE, getPathLanguage } from '../translations'

export function useLocalizedPath() {
  const { pathname } = useLocation()
  const language = getPathLanguage(pathname) ?? DEFAULT_LANGUAGE

  return React.useCallback((path: string) => `/${language}${path}`, [language])
}
