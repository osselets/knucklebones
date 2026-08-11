import * as React from 'react'
import { Navigate, Outlet, Routes, Route, useParams } from 'react-router-dom'
import { isLanguageSupported } from '../translations'
import { Game } from './Game'
import { GameProvider } from './GameContext'
import { HomePage } from './HomePage'
import { HowToPlayPage } from './HowToPlay'
import { RankedMatchmaking } from './RankedMatchmaking'

const RankedStatsPage = React.lazy(() =>
  import('./RankedStats').then((module) => ({
    default: module.RankedStatsPage
  }))
)

function RankedStatsRoute() {
  return (
    <React.Suspense fallback={null}>
      <RankedStatsPage />
    </React.Suspense>
  )
}

function GameRoute() {
  return (
    <GameProvider>
      <Game />
    </GameProvider>
  )
}

function SupportedLanguageRoute() {
  const { language } = useParams()
  return language !== undefined && isLanguageSupported(language) ? (
    <Outlet />
  ) : (
    <Navigate to='/' replace />
  )
}

export function Router() {
  return (
    <Routes>
      <Route path='/' element={<HomePage />} />
      <Route path='/room/:roomKey' element={<GameRoute />} />
      <Route path='/how-to-play' element={<HowToPlayPage />} />
      <Route path='/ranked' element={<RankedMatchmaking />} />
      <Route path='/ranked-stats' element={<RankedStatsRoute />} />
      <Route path='/:language' element={<SupportedLanguageRoute />}>
        <Route index element={<HomePage />} />
        <Route path='room/:roomKey' element={<GameRoute />} />
        <Route path='how-to-play' element={<HowToPlayPage />} />
        <Route path='ranked' element={<RankedMatchmaking />} />
        <Route path='ranked-stats' element={<RankedStatsRoute />} />
      </Route>
      {/* Handle 404 */}
    </Routes>
  )
}
