import { type IGameState } from '@knucklebones/common'
import { type PlayerSide, augmentPlayer } from '../../utils/player'

export function preparePlayers(
  playerSide: PlayerSide,
  { playerOne, playerTwo }: IGameState
) {
  if (playerSide === 'player-two') {
    return [augmentPlayer(playerTwo, true), augmentPlayer(playerOne, false)]
  }
  return [
    augmentPlayer(playerOne, playerSide !== 'spectator'),
    augmentPlayer(playerTwo, false)
  ]
}

export function prepareRankedTurn(
  playerSide: PlayerSide,
  rankedTurn: IGameState['rankedTurn']
): IGameState['rankedTurn'] {
  if (rankedTurn === undefined || playerSide !== 'player-two') {
    return rankedTurn
  }

  return {
    ...rankedTurn,
    playerOneTimeouts: rankedTurn.playerTwoTimeouts,
    playerTwoTimeouts: rankedTurn.playerOneTimeouts
  }
}

export function getWebSocketUrl(roomKey: string, ticket: string) {
  let hostname = import.meta.env.VITE_WORKER_URL

  if (hostname.startsWith('http://')) {
    hostname = hostname.replace('http', 'ws')
  } else if (hostname.startsWith('https://')) {
    hostname = hostname.replace('https', 'wss')
  }

  return `${hostname}/${roomKey}/websocket?ticket=${ticket}`
}
