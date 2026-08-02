import {
  apiErrorBodySchema,
  type ClientProtocolDiagnosticCode,
  type GameSettings,
  type IdentityRecovery,
  type IdentityRecoveryPhrase,
  identityRecoveryPhraseSchema,
  identityRecoverySchema,
  type IdentityTransfer,
  identityTransferSchema,
  type MatchmakingStatus,
  matchmakingStatusSchema,
  type PlayerCredentials,
  playerCredentialsSchema,
  type PlayerIdentityBootstrap,
  playerIdentityBootstrapSchema,
  type RankedProfile,
  type RankedAvailability,
  rankedAvailabilitySchema,
  rankedProfileSchema,
  type WebSocketTicket,
  webSocketTicketSchema
} from '@knucklebones/common'
import {
  getStoredDeviceCredential,
  getStoredDisplayName
} from './identityStorage'
import { ensurePlayerIdentity } from './playerIdentity'

type Method = 'GET' | 'POST' | 'DELETE'

interface IdentificationParams {
  roomKey: string
  playerId: string
}

export async function createPlayer(): Promise<PlayerIdentityBootstrap> {
  const response = await sendApiRequest('/players', 'POST', undefined, null)
  const result = playerIdentityBootstrapSchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('The server returned invalid player credentials.')
  }

  return result.data
}

export async function rotateIdentityRecovery(): Promise<IdentityRecoveryPhrase> {
  const response = await sendApiRequest('/v1/identity/recovery/rotate', 'POST')
  const result = identityRecoveryPhraseSchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('The server returned an invalid recovery phrase.')
  }

  return result.data
}

export async function redeemIdentityRecovery(
  recoveryPhrase: string,
  revokeOtherDevices = false
): Promise<IdentityRecovery> {
  const response = await sendApiRequest(
    '/v1/identity/recovery/redeem',
    'POST',
    { recoveryPhrase, revokeOtherDevices },
    null
  )
  const result = identityRecoverySchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('The server returned an invalid identity recovery.')
  }

  return result.data
}

export async function verifyPlayer({
  credential
}: PlayerCredentials): Promise<void> {
  await sendApiRequest('/v1/identity/verify', 'POST', undefined, credential)
}

export async function reportClientProtocolDiagnostic(
  code: ClientProtocolDiagnosticCode
): Promise<void> {
  await sendApiRequest('/v1/diagnostics/protocol', 'POST', { code })
}

export async function createIdentityTransfer(): Promise<IdentityTransfer> {
  const response = await sendApiRequest('/v1/identity/transfers', 'POST')
  const result = identityTransferSchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('The server returned an invalid identity transfer.')
  }

  return result.data
}

export async function redeemIdentityTransfer(
  transferToken: string,
  revokeOtherDevices = false
): Promise<PlayerCredentials> {
  const response = await sendApiRequest(
    '/v1/identity/transfers/redeem',
    'POST',
    { transferToken, revokeOtherDevices },
    null
  )
  const result = playerCredentialsSchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('The server returned invalid player credentials.')
  }

  return result.data
}

export async function createWebSocketTicket({
  roomKey
}: IdentificationParams): Promise<WebSocketTicket> {
  const response = await sendApiRequest(
    `/v1/rooms/${roomKey}/websocket-ticket`,
    'POST'
  )
  const result = webSocketTicketSchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('The server returned an invalid WebSocket ticket.')
  }

  return result.data
}

export async function getRankedProfile(): Promise<RankedProfile> {
  const response = await sendApiRequest('/v1/ranked/profile', 'GET')
  const result = rankedProfileSchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('The server returned an invalid ranked profile.')
  }

  return result.data
}

export async function getRankedAvailability(): Promise<RankedAvailability> {
  const response = await sendApiRequest('/v1/ranked/availability', 'GET')
  const result = rankedAvailabilitySchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('The server returned invalid ranked availability.')
  }

  return result.data
}

export async function joinMatchmaking(): Promise<MatchmakingStatus> {
  return await getMatchmakingResponse('/v1/matchmaking/join', 'POST')
}

export async function getMatchmakingStatus(): Promise<MatchmakingStatus> {
  return await getMatchmakingResponse('/v1/matchmaking/status', 'GET')
}

export async function leaveMatchmaking(): Promise<void> {
  await sendApiRequest('/v1/matchmaking/queue', 'DELETE')
}

async function getMatchmakingResponse(
  path: string,
  method: 'GET' | 'POST'
): Promise<MatchmakingStatus> {
  const response = await sendApiRequest(path, method)
  const result = matchmakingStatusSchema.safeParse(await response.json())

  if (!result.success) {
    throw new Error('The server returned an invalid matchmaking status.')
  }

  return result.data
}

// À synchroniser avec les types de requêtes côté back
interface InitGameRequestParams extends Omit<GameSettings, 'boType'> {
  boType?: GameSettings['boType']
}
export async function initGame(
  { roomKey }: IdentificationParams,
  { boType, difficulty, playerType }: InitGameRequestParams
) {
  const displayName = getStoredDisplayName()
  const body =
    playerType === 'ai'
      ? { playerType, difficulty, boType }
      : {
          playerType,
          boType,
          ...(displayName !== null && { displayName })
        }

  await sendMutationRequest(`/v1/rooms/${roomKey}/init`, 'POST', body)
}

// Pas besoin de repréciser `boType` si il change pas de la partie en cours
type VoteRematchRequestParams = Partial<Omit<GameSettings, 'playerType'>>
export async function voteRematch(
  { roomKey }: IdentificationParams,
  { boType, difficulty }: VoteRematchRequestParams = {}
) {
  await sendMutationRequest(`/v1/rooms/${roomKey}/rematch`, 'POST', {
    boType,
    difficulty
  })
}

interface PlayRequestParams {
  column: number
}
export async function play(
  { roomKey }: IdentificationParams,
  { column }: PlayRequestParams
) {
  const path = `/v1/rooms/${roomKey}/play`
  await sendMutationRequest(path, 'POST', { column })
}

export async function resignGame({
  roomKey
}: Pick<IdentificationParams, 'roomKey'>): Promise<void> {
  await sendMutationRequest(`/v1/rooms/${roomKey}/resign`, 'POST')
}

interface UpdateDisplayNameRequestParams {
  displayName: string
}
export async function updateDisplayName(
  { roomKey }: IdentificationParams,
  { displayName }: UpdateDisplayNameRequestParams
) {
  await sendMutationRequest(`/v1/rooms/${roomKey}/display-name`, 'POST', {
    displayName
  })
}

export async function deleteDisplayName({ roomKey }: IdentificationParams) {
  await sendMutationRequest(`/v1/rooms/${roomKey}/display-name`, 'DELETE')
}

async function sendMutationRequest(
  path: string,
  method: 'POST' | 'DELETE',
  body?: unknown
) {
  const mutationId = crypto.randomUUID()
  return await sendApiRequest(path, method, body, undefined, mutationId)
}

async function sendApiRequest(
  path: string,
  method: Method,
  body?: unknown,
  credential?: string | null,
  mutationId?: string
) {
  if (credential === undefined) {
    credential = getStoredDeviceCredential()
    if (credential === null) {
      await ensurePlayerIdentity()
      credential = getStoredDeviceCredential()
    }
  }

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
      const result = apiErrorBodySchema.safeParse(
        await response
          .clone()
          .json()
          .catch(() => undefined)
      )
      const details = result.success
        ? `${result.data.error.code}: ${result.data.error.message}`
        : `${response.status}:${response.statusText}`

      throw new Error(
        `[${details}] There was an error while doing a network call. Please try again.`
      )
    }
  }

  throw new Error(
    'There was an error while doing a network call. Please try again.'
  )
}
