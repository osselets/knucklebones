import { Navigate, Outlet, Routes, Route, useParams } from 'react-router-dom'
import { isLanguageSupported } from '../translations'
import { Game } from './Game'
import { GameProvider } from './GameContext'
import { HomePage } from './HomePage'
import { HowToPlayPage } from './HowToPlay'
import { RankedMatchmaking } from './RankedMatchmaking'

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
      <Route path='/:language' element={<SupportedLanguageRoute />}>
        <Route index element={<HomePage />} />
        <Route path='room/:roomKey' element={<GameRoute />} />
        <Route path='how-to-play' element={<HowToPlayPage />} />
        <Route path='ranked' element={<RankedMatchmaking />} />
      </Route>
      {/* Handle 404 */}
    </Routes>
  )
}
