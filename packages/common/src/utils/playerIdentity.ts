import { credentialSchema } from '../schemas'

const IDENTITY_TRANSFER_CODE_PREFIX = 'knucklebones-transfer-v1'

export function createIdentityTransferCode(transferToken: string): string {
  return `${IDENTITY_TRANSFER_CODE_PREFIX}.${transferToken}`
}

export function parseIdentityTransferCode(
  transferCode: string
): string | undefined {
  const parts = transferCode.trim().split('.')

  if (parts.length !== 2 || parts[0] !== IDENTITY_TRANSFER_CODE_PREFIX) {
    return undefined
  }

  const result = credentialSchema.safeParse(parts[1])

  return result.success ? result.data : undefined
}
