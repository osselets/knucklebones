import { useGame } from '../GameContext'
import { PlayerBoard } from './Board'

export function PlayerOneBoard() {
  const { outcome, nextPlayer, playerOne, isLoading, playerSide, sendPlay } =
    useGame()

  const isSpectator = playerSide === 'spectator'
  const canPlay = !isLoading && outcome === 'ongoing' && !isSpectator
  const canPlayerOnePlay = canPlay && nextPlayer?.id === playerOne?.id

  return (
    <PlayerBoard
      {...playerOne}
      isPlayerOne
      isNextPlayer={nextPlayer?.id === playerOne?.id}
      onColumnClick={
        canPlayerOnePlay
          ? (column) => {
              void sendPlay(column)
            }
          : undefined
      }
      canPlay={canPlayerOnePlay}
      isCurrentPlayer={!isSpectator}
      outcome={outcome}
    />
  )
}
