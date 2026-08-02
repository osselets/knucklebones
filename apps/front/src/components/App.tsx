import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { DEFAULT_LANGUAGE, getPathLanguage } from '../translations'
import { ensurePlayerIdentity } from '../utils/playerIdentity'
import { Language } from './Language'
import { PlayerIdentityTransfer } from './PlayerIdentityTransfer'
import { Router } from './Router'
import {
  MainContent,
  SideBarActions,
  SideBarContainer,
  SideBarLayout
} from './SideBar'
import { Theme } from './Theme'

function LanguageSync() {
  const { pathname } = useLocation()
  const { i18n } = useTranslation()

  React.useEffect(() => {
    const language = getPathLanguage(pathname) ?? DEFAULT_LANGUAGE
    document.documentElement.lang = language
    void i18n.changeLanguage(language)
  }, [i18n, pathname])

  return null
}

export function App() {
  const mainContentRef = React.useRef<React.ElementRef<'div'>>(null)

  React.useEffect(() => {
    void ensurePlayerIdentity().catch((error) => {
      console.error('Failed to initialize player identity.', error)
    })
  }, [])

  return (
    <BrowserRouter>
      <LanguageSync />
      <div className='bg-slate-50 text-slate-900 transition-colors duration-150 ease-in-out dark:bg-slate-900 dark:text-slate-200'>
        <SideBarLayout>
          <SideBarContainer
            swipeableAreaRef={mainContentRef}
            actions={
              <>
                <Theme />
                <Language />
              </>
            }
          />

          <MainContent ref={mainContentRef}>
            <SideBarActions>
              <PlayerIdentityTransfer />
            </SideBarActions>
            <Router />
          </MainContent>
        </SideBarLayout>
      </div>
    </BrowserRouter>
  )
}
