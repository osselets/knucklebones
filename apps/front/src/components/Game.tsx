import * as React from 'react'
import { useIsOnMobile } from '../hooks/detectDevice'
import { useNoIndex } from '../hooks/useNoIndex'
import { useGameWhileLoading } from './GameContext'
import { GameOutcome } from './GameOutcome'
import { HowToPlayModal } from './HowToPlay'
import { Loading } from './Loading'
import { OutcomeHistory } from './OutcomeHistory'
import { PlayerOneBoard, PlayerTwoBoard } from './PlayerBoard'
import { QRCodeModal } from './QRCode'
import { ReconnectNotice } from './ReconnectNotice'
import { SideBarActions } from './SideBar'
import { WarningToast } from './WarningToast'

export function Game() {
  const gameStore = useGameWhileLoading()
  const isOnMobile = useIsOnMobile()
  const gameRef = React.useRef<React.ElementRef<'div'>>(null)
  useNoIndex()

  if (gameStore === null) {
    return <Loading />
  }

  const { errorMessage, clearErrorMessage } = gameStore

  // Pas tip top je trouve, mais virtuellement ça marche
  const gameOutcome = <GameOutcome />

  return (
    <>
      <SideBarActions>
        <HowToPlayModal />
        <QRCodeModal />
        <OutcomeHistory />
        {isOnMobile && gameOutcome}
      </SideBarActions>
      <div ref={gameRef} className='flex flex-col items-center justify-around'>
        <ReconnectNotice />
        <PlayerTwoBoard />
        {!isOnMobile && gameOutcome}
        <PlayerOneBoard />
        <WarningToast message={errorMessage} onDismiss={clearErrorMessage} />
      </div>
    </>
  )
}
