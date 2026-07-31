import * as React from 'react'
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline'
import { t } from 'i18next'
import { Button } from './Button'

type Themes = 'dark' | 'light' | 'default'

interface ThemeProps {
  theme: Themes
}

function ThemeIcon({ theme }: ThemeProps) {
  if (theme === 'dark') {
    return <MoonIcon />
  }
  if (theme === 'light') {
    return <SunIcon />
  }
  return <ComputerDesktopIcon />
}

function getThemeLabel({ theme }: ThemeProps) {
  if (theme === 'dark') {
    return t('menu.style.dark')
  }
  if (theme === 'light') {
    return t('menu.style.light')
  }
  return t('menu.style.system')
}

function setDarkMode(darkMode: boolean) {
  if (darkMode) {
    document.body.classList.add('dark')
  } else {
    document.body.classList.remove('dark')
  }
}

// https://ui.shadcn.com/docs/components/select ?
export function Theme() {
  const [theme, setTheme] = React.useState<Themes>('default')

  function changeTheme() {
    let localTheme: Themes = 'dark'

    if (theme === 'dark') {
      localTheme = 'light'
    } else if (theme === 'light') {
      localTheme = 'default'
    }

    localStorage.theme = localTheme
    setTheme(localTheme)
  }

  function computeDarkMode(localTheme: Themes) {
    const hasDarkMode = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches
    if (localTheme === 'dark') {
      setDarkMode(true)
    } else if (localTheme === 'light') {
      setDarkMode(false)
    } else {
      setDarkMode(hasDarkMode)
    }
  }

  // Update the dark mode and the local storage when theme changes
  React.useEffect(() => {
    computeDarkMode(theme)
  }, [theme])

  // On initial mount, we read from the local storage to update the theme
  React.useEffect(() => {
    const savedTheme = localStorage.theme as Themes
    if (savedTheme !== null) {
      setTheme(savedTheme)
    } else {
      computeDarkMode('default')
    }
  }, [])

  // Detects theme changes and update the theme if using the default theme
  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    function update(e: MediaQueryListEvent) {
      if (theme === 'default') {
        computeDarkMode(e.matches ? 'dark' : 'light')
      }
    }

    mediaQuery.addEventListener('change', update)

    return () => {
      mediaQuery.removeEventListener('change', update)
    }
  }, [theme])

  return (
    <Button
      variant='ghost'
      leftIcon={<ThemeIcon theme={theme} />}
      onClick={changeTheme}
    >
      {getThemeLabel({ theme })}
    </Button>
  )
}
