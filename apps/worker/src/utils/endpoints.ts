import { GameState } from '@knucklebones/common'
import { json } from 'itty-router-extras'
import { CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { RequestWithProps } from '../types/itty'

export async function getGameState(request: RequestWithProps) {
  const gameStateStore = request.GAME_STATE_STORE.get(request.roomKey!)
  return await gameStateStore.getState()
}

export async function saveAndPropagate(
  gameState: GameState,
  request: RequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
) {
  const roomKey = request.roomKey!
  const gameStateStore = request.GAME_STATE_STORE.get(roomKey)
  await gameStateStore.save(gameState)
  await broadcast(gameState, roomKey, cloudflareEnvironment)
  return json(gameState)
}

async function broadcast(
  gameState: GameState,
  roomKey: string,
  cloudflareEnvironment: CloudflareEnvironment
) {
  const id = cloudflareEnvironment.WEB_SOCKET_STORE.idFromName(roomKey)
  const webSocketStore = cloudflareEnvironment.WEB_SOCKET_STORE.get(id)

  return await webSocketStore.fetch('https://dummy-url/broadcast', {
    method: 'POST',
    body: JSON.stringify(gameState)
  })
}
