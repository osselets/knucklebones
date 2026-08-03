import * as React from 'react'
import { useGameSetup } from './useGameSetup'

export type GameSetup = ReturnType<typeof useGameSetup>

const GameContext = React.createContext<GameSetup | undefined>(undefined)

export function GameProvider({ children }: React.PropsWithChildren) {
  const gameSetup = useGameSetup()
  return (
    <GameContext.Provider value={gameSetup}>{children}</GameContext.Provider>
  )
}

export function useGameWhileLoading() {
  const context = React.useContext(GameContext)

  if (context === undefined) {
    throw new Error('`GameProvider` is not in scope.')
  }

  return context
}

export function useGame() {
  const context = useGameWhileLoading()

  if (context === null || context.status === 'identity-error') {
    throw new Error(
      '`GameContext` should not be used while the game is loading or its identity is unresolved'
    )
  }

  return context
}

export type InGameContext = ReturnType<typeof useGame>
