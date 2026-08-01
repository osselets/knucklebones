import { describe, expect, it } from 'vitest'
import { resolveFrontendOrigin } from '../src/utils/http'

describe('frontend origin policy', () => {
  it('allows only the public site in production', () => {
    expect(resolveFrontendOrigin('https://knucklebones.io', 'production')).toBe(
      'https://knucklebones.io'
    )
    expect(
      resolveFrontendOrigin(
        'https://preview.knucklebones-8ep.pages.dev',
        'production'
      )
    ).toBeUndefined()
  })

  it('allows Cloudflare branch previews only in staging', () => {
    const preview = 'https://updating.knucklebones-8ep.pages.dev'
    expect(resolveFrontendOrigin(preview, 'staging')).toBe(preview)
    expect(
      resolveFrontendOrigin(
        'https://knucklebones-8ep.pages.dev.evil.test',
        'staging'
      )
    ).toBeUndefined()
  })

  it('allows loopback development origins without opening deployed workers', () => {
    expect(resolveFrontendOrigin('http://localhost:5173', 'development')).toBe(
      'http://localhost:5173'
    )
    expect(
      resolveFrontendOrigin('http://localhost.evil.test:5173', 'development')
    ).toBeUndefined()
  })
})
