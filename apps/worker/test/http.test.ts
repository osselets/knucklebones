import { describe, expect, it } from 'vitest'
import {
  resolveFrontendOrigin,
  sanitizeRequestForSentry
} from '../src/utils/http'

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

describe('Sentry request sanitization', () => {
  it('removes query strings and sensitive headers', () => {
    const sanitized = sanitizeRequestForSentry(
      new Request(
        'https://api.knucklebones.io/room/websocket?ticket=secret-ticket',
        {
          headers: {
            Authorization: 'Bearer secret-credential',
            Cookie: 'identity=secret-cookie',
            'User-Agent': 'test-browser',
            'Idempotency-Key': '11111111-1111-4111-8111-111111111111'
          }
        }
      ),
      '22222222-2222-4222-8222-222222222222'
    )

    expect(sanitized.url).toBe('https://api.knucklebones.io/room/websocket')
    expect(sanitized.headers.get('Authorization')).toBeNull()
    expect(sanitized.headers.get('Cookie')).toBeNull()
    expect(sanitized.headers.get('User-Agent')).toBe('test-browser')
    expect(sanitized.headers.get('X-Request-Id')).toBe(
      '22222222-2222-4222-8222-222222222222'
    )
  })
})
