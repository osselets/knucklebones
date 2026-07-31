function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  )
}

export function createCredential(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashCredential(credential: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(credential)
  )
  return bytesToHex(new Uint8Array(digest))
}
