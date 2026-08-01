import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import {
  type AuthenticatedMutationRoomRequestWithProps,
  type MutationRequestWithProps
} from '../types/itty'
import { executeDisplayNameUpdate } from './displayName'

export async function deleteDisplayName(
  request: MutationRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  return await executeDisplayNameUpdate(
    request,
    undefined,
    cloudflareEnvironment,
    context
  )
}

export async function deleteRoomDisplayName(
  request: Request & AuthenticatedMutationRoomRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  return await executeDisplayNameUpdate(
    request,
    undefined,
    cloudflareEnvironment,
    context
  )
}
