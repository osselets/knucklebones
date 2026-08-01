function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  )
}

export function createCredential(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
}

export interface CreatedDeviceCredential {
  credentialId: string
  credential: string
  secretHash: string
}

export async function createDeviceCredential(): Promise<CreatedDeviceCredential> {
  const credentialId = crypto.randomUUID()
  const secret = createCredential()

  return {
    credentialId,
    credential: `${credentialId}_${secret}`,
    secretHash: await hashCredential(secret)
  }
}

export function parseDeviceCredential(credential: string): {
  credentialId?: string
  secret: string
} {
  const separator = credential.indexOf('_')
  if (separator === -1) {
    return { secret: credential }
  }

  return {
    credentialId: credential.slice(0, separator),
    secret: credential.slice(separator + 1)
  }
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }

  let difference = 0
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return difference === 0
}

export async function hashCredential(credential: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(credential)
  )
  return bytesToHex(new Uint8Array(digest))
}
