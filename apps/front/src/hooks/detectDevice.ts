import * as React from 'react'

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)'

function subscribeToDesktopMediaQuery(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)
  mediaQuery.addEventListener('change', onStoreChange)

  return () => {
    mediaQuery.removeEventListener('change', onStoreChange)
  }
}

function getDesktopMediaQuerySnapshot() {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches
}

export function useIsOnMobile() {
  return !useIsOnDesktop()
}

export function useIsOnDesktop() {
  return React.useSyncExternalStore(
    subscribeToDesktopMediaQuery,
    getDesktopMediaQuerySnapshot
  )
}
