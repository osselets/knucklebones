import {
  type GameSettings,
  type PlayerCredentials,
  playerCredentialsSchema,
  type WebSocketTicket,
  webSocketTicketSchema
} from '@knucklebones/common'

type Method = 'GET' | 'POST' | 'DELETE'

interface IdentificationParams {
  roomKey: string
  playerId: string
}

export async function createPlayer(): Promise<PlayerCredentials> {
  const response = await sendApiRequest('/players', 'POST')
  const result = playerCredentialsSchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('The server returned invalid player credentials.')
  }

  return result.data
}

export async function verifyPlayer({
  playerId,
  credential
}: PlayerCredentials): Promise<void> {
  await sendApiRequest(
    `/players/${playerId}/verify`,
    'POST',
    undefined,
    credential
  )
}

export async function createWebSocketTicket({
  playerId,
  roomKey
}: IdentificationParams): Promise<WebSocketTicket> {
  const response = await sendApiRequest(
    `/${roomKey}/${playerId}/websocket-ticket`,
    'POST'
  )
  const result = webSocketTicketSchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('The server returned an invalid WebSocket ticket.')
  }

  return result.data
}

// À synchroniser avec les types de requêtes côté back
interface InitGameRequestParams extends Omit<GameSettings, 'boType'> {
  boType?: GameSettings['boType']
}
export async function initGame(
  { playerId, roomKey }: IdentificationParams,
  { boType, difficulty, playerType }: InitGameRequestParams
) {
  const urlSearchParams = new URLSearchParams()

  if (playerType === 'ai' && difficulty !== undefined) {
    urlSearchParams.append('difficulty', difficulty)
  } else if ('displayName' in localStorage) {
    urlSearchParams.append('displayName', localStorage.displayName)
  }

  if (boType !== undefined) {
    urlSearchParams.append('boType', String(boType))
  }

  const urlSearchParamsString = urlSearchParams.toString()

  const queryParamsString =
    urlSearchParamsString.length > 0 ? '?' + urlSearchParamsString : ''

  const path = `/${roomKey}/${playerId}/init${queryParamsString}`

  await sendMutationRequest(path, 'POST')
}

// Pas besoin de repréciser `boType` si il change pas de la partie en cours
type VoteRematchRequestParams = Partial<Omit<GameSettings, 'playerType'>>
export async function voteRematch(
  { playerId, roomKey }: IdentificationParams,
  { boType, difficulty }: VoteRematchRequestParams = {}
) {
  const urlSearchParams = new URLSearchParams()
  if (boType !== undefined) {
    urlSearchParams.append('boType', String(boType))
  }
  if (difficulty !== undefined) {
    urlSearchParams.append('difficulty', difficulty)
  }

  const path = `/${roomKey}/${playerId}/rematch?${urlSearchParams.toString()}`
  await sendMutationRequest(path, 'POST')
}

interface PlayRequestParams {
  dice: number
  column: number
}
export async function play(
  { playerId, roomKey }: IdentificationParams,
  { column, dice }: PlayRequestParams
) {
  const path = `/${roomKey}/${playerId}/play/${column}/${dice}`
  await sendMutationRequest(path, 'POST')
}
interface UpdateDisplayNameRequestParams {
  displayName: string
}
export async function updateDisplayName(
  { playerId, roomKey }: IdentificationParams,
  { displayName }: UpdateDisplayNameRequestParams
) {
  const path = `/${roomKey}/${playerId}/displayName/${displayName}`
  await sendMutationRequest(path, 'POST')
}

export async function deleteDisplayName({
  playerId,
  roomKey
}: IdentificationParams) {
  const path = `/${roomKey}/${playerId}/displayName`
  await sendMutationRequest(path, 'DELETE')
}

async function sendMutationRequest(path: string, method: 'POST' | 'DELETE') {
  const mutationId = crypto.randomUUID()
  return await sendApiRequest(path, method, undefined, undefined, mutationId)
}

async function sendApiRequest(
  path: string,
  method: Method,
  body?: unknown,
  credential = localStorage.getItem('playerCredential'),
  mutationId?: string
) {
  const headers = {
    Accept: 'application/json',
    ...(credential !== null && {
      Authorization: `Bearer ${credential}`
    }),
    ...(mutationId !== undefined && { 'Idempotency-Key': mutationId }),
    ...(body !== undefined && { 'Content-Type': 'application/json' })
  }

  const attempts = mutationId === undefined ? 1 : 2

  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Response

    try {
      response = await fetch(`${import.meta.env.VITE_WORKER_URL}${path}`, {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) })
      })
    } catch (error) {
      if (attempt === attempts - 1) {
        throw new Error(
          'There was an error while doing a network call. Please try again.',
          { cause: error }
        )
      }
      continue
    }

    if (response.ok) {
      return response
    }

    if (response.status < 500 || attempt === attempts - 1) {
      throw new Error(
        `[${response.status}:${response.statusText}] There was an error while doing a network call. Please try again.`
      )
    }
  }

  throw new Error(
    'There was an error while doing a network call. Please try again.'
  )
}
