import { expect, test, type APIRequestContext } from '@playwright/test'

const workerUrl = 'http://localhost:8787'

interface PlayerCredentials {
  playerId: string
  credential: string
}

interface GamePresenceEvent {
  version: 1
  type: 'game.presence'
  payload: {
    roomKey: string
    playerId: string
    connected: boolean
  }
}

async function createPlayer(
  request: APIRequestContext
): Promise<PlayerCredentials> {
  return (await (
    await request.post(`${workerUrl}/players`, {
      data: { displayName: 'E2E Player' }
    })
  ).json()) as PlayerCredentials
}

async function issueTicket(
  request: APIRequestContext,
  roomKey: string,
  player: PlayerCredentials
): Promise<string> {
  const response = await request.post(
    `${workerUrl}/${roomKey}/${player.playerId}/websocket-ticket`,
    { headers: { Authorization: `Bearer ${player.credential}` } }
  )
  expect(response.status()).toBe(201)
  return ((await response.json()) as { ticket: string }).ticket
}

async function openSocket(roomKey: string, ticket: string): Promise<WebSocket> {
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `${workerUrl.replace('http', 'ws')}/${roomKey}/websocket?ticket=${ticket}`
    )
    socket.addEventListener('open', () => resolve(socket), { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
}

async function closeSocket(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve) => {
    socket.addEventListener('close', () => resolve(), { once: true })
    socket.close()
  })
}

test('WebSocket tickets are authenticated, one-time, and reject client messages', async ({
  request
}) => {
  const player = await createPlayer(request)
  expect(player.playerId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  )
  expect(player.credential).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[0-9a-f]{64}$/
  )
  const roomKey = crypto.randomUUID()
  const ticketResponse = await request.post(
    `${workerUrl}/${roomKey}/${player.playerId}/websocket-ticket`,
    { headers: { Authorization: `Bearer ${player.credential}` } }
  )
  const { ticket } = (await ticketResponse.json()) as { ticket: string }
  expect(ticket).toMatch(/^[0-9a-f]{64}$/)
  const socketUrl = `${workerUrl.replace('http', 'ws')}/${roomKey}/websocket?ticket=${ticket}`
  const wrongRoomUrl = `${workerUrl.replace('http', 'ws')}/${crypto.randomUUID()}/websocket?ticket=${ticket}`

  await expect(
    new Promise<void>((resolve, reject) => {
      const wrongRoomSocket = new WebSocket(wrongRoomUrl)
      wrongRoomSocket.addEventListener('open', () => resolve(), { once: true })
      wrongRoomSocket.addEventListener('error', reject, { once: true })
    })
  ).rejects.toBeDefined()

  const closeCode = await new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(socketUrl)
    socket.addEventListener('open', () => socket.send('unsupported'))
    socket.addEventListener('close', (event) => resolve(event.code), {
      once: true
    })
    socket.addEventListener('error', reject, { once: true })
  })
  expect(closeCode).toBe(1008)

  await expect(
    new Promise<void>((resolve, reject) => {
      const reusedSocket = new WebSocket(socketUrl)
      reusedSocket.addEventListener('open', () => resolve(), { once: true })
      reusedSocket.addEventListener('error', reject, { once: true })
    })
  ).rejects.toBeDefined()
})

test('presence changes only for the first and final socket of an identity', async ({
  request
}) => {
  test.setTimeout(60_000)
  const observer = await createPlayer(request)
  const player = await createPlayer(request)
  const roomKey = crypto.randomUUID()
  const observerSocket = await openSocket(
    roomKey,
    await issueTicket(request, roomKey, observer)
  )
  const playerPresence: GamePresenceEvent[] = []
  observerSocket.addEventListener('message', ({ data }) => {
    const event = parsePresenceEvent(String(data))
    if (event?.payload.playerId === player.playerId) {
      playerPresence.push(event)
    }
  })

  const firstPlayerSocket = await openSocket(
    roomKey,
    await issueTicket(request, roomKey, player)
  )
  await expect.poll(() => playerPresence.length).toBe(1)
  expect(playerPresence[0].payload.connected).toBe(true)

  const secondPlayerSocket = await openSocket(
    roomKey,
    await issueTicket(request, roomKey, player)
  )
  await closeSocket(firstPlayerSocket)
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(playerPresence).toHaveLength(1)

  await closeSocket(secondPlayerSocket)
  await expect.poll(() => playerPresence.length).toBe(2)
  expect(playerPresence[1].payload.connected).toBe(false)

  observerSocket.close()
})

function parsePresenceEvent(message: string): GamePresenceEvent | undefined {
  const event = JSON.parse(message) as Partial<GamePresenceEvent>
  if (
    event.version !== 1 ||
    event.type !== 'game.presence' ||
    typeof event.payload?.roomKey !== 'string' ||
    typeof event.payload.playerId !== 'string' ||
    typeof event.payload.connected !== 'boolean'
  ) {
    return undefined
  }

  return event as GamePresenceEvent
}
