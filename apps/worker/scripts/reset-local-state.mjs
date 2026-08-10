import { rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const localStatePath = fileURLToPath(
  new URL('../.wrangler/state/', import.meta.url)
)

if (
  basename(localStatePath) !== 'state' ||
  basename(dirname(localStatePath)) !== '.wrangler'
) {
  throw new Error(`Refusing to remove unexpected path: ${localStatePath}`)
}

await rm(localStatePath, { recursive: true, force: true })
console.log('Cleared the local Wrangler D1 and Durable Object state.')
