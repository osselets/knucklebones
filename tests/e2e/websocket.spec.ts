import { expect, test } from '@playwright/test'

const workerUrl = 'http://localhost:8787'

test('WebSocket tickets are authenticated, one-time, and reject client messages', async ({
  request
}) => {
  const player = (await (
    await request.post(`${workerUrl}/players`)
  ).json()) as { playerId: string; credential: string }
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
